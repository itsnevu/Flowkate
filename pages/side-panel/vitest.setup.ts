import { vi } from 'vitest';

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
    // The bundled i18n build carries its own locale table, so this is only a backstop for the
    // production build, which delegates straight to chrome.i18n.
    i18n: { getMessage: vi.fn((key: string) => key) },
  },
  writable: true,
  configurable: true,
});
