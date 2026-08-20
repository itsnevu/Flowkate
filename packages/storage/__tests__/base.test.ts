import { describe, it, expect } from 'vitest';
import { createStorage } from '../lib/base/base';
import { StorageEnum } from '../lib/base/enums';

/**
 * These cover the read-modify-write contract of `createStorage`, not any one store.
 *
 * Every store in the package is built on it, and its callers fire updates un-awaited from event
 * handlers — a chat message appended while a status message arrives, a provider saved while another
 * card saves. Same-tick pairs are the normal case here, so the atomicity of `set` is what keeps a
 * message or an API key from disappearing without an error.
 */
describe('createStorage - concurrent writes', () => {
  it('applies every update when two writes are issued in the same tick', async () => {
    const store = createStorage<string[]>('base-test-concurrent', [], { storageEnum: StorageEnum.Local });

    await Promise.all([store.set(prev => [...prev, 'a']), store.set(prev => [...prev, 'b'])]);

    // Both updaters used to read the same pre-write snapshot, so the second overwrote the first
    // and the array held one entry.
    expect(await store.get()).toEqual(['a', 'b']);
  });

  it('keeps every record when a keyed map is populated concurrently', async () => {
    // The shape that loses an API key: each writer spreads the previous record and adds one field.
    const store = createStorage<Record<string, string>>('base-test-record', {}, { storageEnum: StorageEnum.Local });

    await Promise.all([
      store.set(prev => ({ ...prev, openai: 'key-1' })),
      store.set(prev => ({ ...prev, anthropic: 'key-2' })),
      store.set(prev => ({ ...prev, gemini: 'key-3' })),
    ]);

    expect(await store.get()).toEqual({ openai: 'key-1', anthropic: 'key-2', gemini: 'key-3' });
  });

  it('applies ten same-tick appends in order', async () => {
    const store = createStorage<number[]>('base-test-many', [], { storageEnum: StorageEnum.Local });

    await Promise.all(Array.from({ length: 10 }, (_, i) => store.set(prev => [...prev, i])));

    expect(await store.get()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('does not let a write that lost its race to the initial read get resurrected', async () => {
    const store = createStorage<string>('base-test-init', 'fallback', { storageEnum: StorageEnum.Local });

    // Issued while the constructor's own `get()` is still in flight.
    await store.set('written');

    expect(await store.get()).toBe('written');
    expect(store.getSnapshot()).toBe('written');
  });

  it('leaves the cache matching disk when a write fails', async () => {
    const store = createStorage<string>('base-test-failure', 'initial', { storageEnum: StorageEnum.Local });
    await store.set('persisted');

    const area = globalThis.chrome.storage.local as unknown as { set: (items: unknown) => Promise<void> };
    const realSet = area.set;
    area.set = () => Promise.reject(new Error('quota exceeded'));

    await expect(store.set('never-written')).rejects.toThrow('quota exceeded');

    area.set = realSet;

    // The cache used to advance before the write, so a failure left `getSnapshot()` reporting a
    // value that was never persisted — and the next update would build on it.
    expect(store.getSnapshot()).toBe('persisted');
    expect(await store.get()).toBe('persisted');
  });

  it('recovers after a failed write instead of wedging the queue', async () => {
    const store = createStorage<string>('base-test-recover', 'initial', { storageEnum: StorageEnum.Local });

    const area = globalThis.chrome.storage.local as unknown as { set: (items: unknown) => Promise<void> };
    const realSet = area.set;
    area.set = () => Promise.reject(new Error('transient'));
    await expect(store.set('doomed')).rejects.toThrow('transient');
    area.set = realSet;

    await store.set('after');
    expect(await store.get()).toBe('after');
  });
});
