import { vi } from 'vitest';

/**
 * Minimal in-memory stand-in for chrome.storage.
 *
 * The storage layer captures `globalThis.chrome` at module load, so this has to be installed before
 * anything under test is imported — which is why it lives in a setup file rather than in the test.
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
  },
  writable: true,
  configurable: true,
});
