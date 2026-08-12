import { vi } from 'vitest';
import enMessages from '../../packages/i18n/locales/en/messages.json';

type I18nEntry = { message: string; placeholders?: Record<string, { content: string }> };

/**
 * Minimal `chrome` stand-in for the page workspaces.
 *
 * Nothing here is under test — but `@extension/storage` captures `globalThis.chrome` at module
 * load, so anything that imports it (and every helper in this pane does, for the enums) needs
 * the global to exist before the import runs. Hence a setup file rather than a per-test stub.
 */
function createFakeStorageArea() {
  const data = new Map<string, unknown>();
  return {
    get: vi.fn(async (keys: string[]) => {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (data.has(key)) result[key] = data.get(key);
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) data.set(key, value);
    }),
    remove: vi.fn(async (key: string) => {
      data.delete(key);
    }),
    clear: vi.fn(async () => {
      data.clear();
    }),
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    setAccessLevel: vi.fn(async () => {}),
  };
}

Object.defineProperty(globalThis, 'chrome', {
  value: {
    storage: {
      local: createFakeStorageArea(),
      session: createFakeStorageArea(),
      sync: createFakeStorageArea(),
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    // Resolves from the real English table rather than echoing the key. The bundled i18n build
    // has two variants - dev embeds the locale table, prod delegates to chrome.i18n - and which one
    // sits in dist depends on whether `ready` or `build` ran last. A key-echoing fake made any test
    // that asserts on visible copy pass or fail based on that ordering; resolving here makes the
    // tests deterministic regardless of dist state.
    i18n: {
      getMessage: vi.fn((key: string, substitutions?: string | string[]) => {
        const entry = (enMessages as Record<string, I18nEntry>)[key];
        if (!entry) return key;
        let message = entry.message;
        const values = typeof substitutions === 'string' ? [substitutions] : (substitutions ?? []);
        for (const [name, def] of Object.entries(entry.placeholders ?? {})) {
          const index = Number.parseInt(def.content.replace('$', ''), 10) - 1;
          message = message.replaceAll(`$${name.toUpperCase()}$`, values[index] ?? '');
        }
        return message;
      }),
    },
  },
  writable: true,
  configurable: true,
});
