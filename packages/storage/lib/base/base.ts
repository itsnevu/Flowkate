import { SessionAccessLevelEnum, StorageEnum } from './enums';
import type { BaseStorage, StorageConfig, ValueOrUpdate } from './types';

/**
 * Chrome reference error while running `processTailwindFeatures` in tailwindcss.
 *  To avoid this, we need to check if the globalThis.chrome is available and add fallback logic.
 */
const chrome = globalThis.chrome;

/**
 * Sets or updates an arbitrary cache with a new value or the result of an update function.
 */
async function updateCache<D>(valueOrUpdate: ValueOrUpdate<D>, cache: D | null): Promise<D> {
  // Type guard to check if our value or update is a function
  function isFunction<D>(value: ValueOrUpdate<D>): value is (prev: D) => D | Promise<D> {
    return typeof value === 'function';
  }

  // Type guard to check in case of a function, if its a Promise
  function returnsPromise<D>(func: (prev: D) => D | Promise<D>): func is (prev: D) => Promise<D> {
    // Use ReturnType to infer the return type of the function and check if it's a Promise
    return (func as (prev: D) => Promise<D>) instanceof Promise;
  }

  if (isFunction(valueOrUpdate)) {
    // Check if the function returns a Promise
    if (returnsPromise(valueOrUpdate)) {
      return valueOrUpdate(cache as D);
    } else {
      return valueOrUpdate(cache as D);
    }
  } else {
    return valueOrUpdate;
  }
}

/**
 * If one session storage needs access from content scripts, we need to enable it globally.
 * @default false
 */
let globalSessionAccessLevelFlag: StorageConfig['sessionAccessForContentScripts'] = false;

/**
 * The in-flight write chain for each storage key, shared by every store that addresses that key.
 *
 * Keyed by the storage key rather than held per `createStorage` closure, because the closure is not
 * the unit that matters: `chat/history.ts` builds a fresh store on every `addMessage`, so a
 * per-instance chain gave two same-tick appends two independent queues and lost one of them - the
 * exact bug serialization was added to fix. Keys are bounded by the number of distinct storage keys
 * the extension uses, and each entry is a single settled promise.
 */
const writeQueues = new Map<string, Promise<unknown>>();

/**
 * Checks if the storage permission is granted in the manifest.json.
 */
function checkStoragePermission(storageEnum: StorageEnum): void {
  if (!chrome) {
    return;
  }

  if (chrome.storage[storageEnum] === undefined) {
    throw new Error(`Check your storage permission in manifest.json: ${storageEnum} is not defined`);
  }
}

/**
 * Creates a storage area for persisting and exchanging data.
 */
export function createStorage<D = string>(key: string, fallback: D, config?: StorageConfig<D>): BaseStorage<D> {
  let cache: D | null = null;
  let initedCache = false;
  let listeners: Array<() => void> = [];

  const storageEnum = config?.storageEnum ?? StorageEnum.Local;
  const liveUpdate = config?.liveUpdate ?? false;

  const serialize = config?.serialization?.serialize ?? ((v: D) => v);
  const deserialize = config?.serialization?.deserialize ?? (v => v as D);

  // Set global session storage access level for StoryType.Session, only when not already done but needed.
  if (
    globalSessionAccessLevelFlag === false &&
    storageEnum === StorageEnum.Session &&
    config?.sessionAccessForContentScripts === true
  ) {
    checkStoragePermission(storageEnum);
    chrome?.storage[storageEnum]
      .setAccessLevel({
        accessLevel: SessionAccessLevelEnum.ExtensionPagesAndContentScripts,
      })
      .catch(error => {
        console.warn(error);
        console.warn('Please call setAccessLevel into different context, like a background script.');
      });
    globalSessionAccessLevelFlag = true;
  }

  // Register life cycle methods
  const get = async (): Promise<D> => {
    checkStoragePermission(storageEnum);
    const value = await chrome?.storage[storageEnum].get([key]);

    if (!value) {
      return fallback;
    }

    return deserialize(value[key]) ?? fallback;
  };

  const _emitChange = () => {
    listeners.forEach(listener => listener());
  };

  /**
   * Writes are serialized per store, so a read-modify-write cannot interleave with another.
   *
   * `set` reads `cache`, awaits, then writes. Two calls issued in the same tick both read the same
   * `cache` before either writes, so the second silently discards the first: two `addMessage` calls
   * in one tick persisted one message, and two `setProvider` calls persisted one provider - losing
   * an API key with no error. Callers fire these un-awaited from event handlers, so same-tick pairs
   * are the normal case rather than an edge one.
   */
  const set = async (valueOrUpdate: ValueOrUpdate<D>) => {
    const write = (writeQueues.get(key) ?? Promise.resolve()).then(async () => {
      if (!initedCache) {
        cache = await get();
        initedCache = true;
      }
      const next = await updateCache(valueOrUpdate, cache);

      // Persist first, then advance the cache. Assigning `cache` before the write meant a rejected
      // write (serialization failure, quota, I/O) left the cache - and every `getSnapshot()`
      // consumer reading it - holding data that never reached disk, which the next update would
      // then build on and write back.
      await chrome?.storage[storageEnum].set({ [key]: serialize(next) });
      cache = next;
      _emitChange();
    });

    // A rejected write must not wedge the queue for every later write, so the chain follows the
    // settled promise while the caller still sees the rejection.
    writeQueues.set(
      key,
      write.catch(() => undefined),
    );

    return write;
  };

  const subscribe = (listener: () => void) => {
    listeners = [...listeners, listener];

    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  };

  const getSnapshot = () => {
    return cache;
  };

  get().then(data => {
    // A `set` racing this initial read already populated the cache and persisted its value.
    // Overwriting it here would resurrect the pre-write state in memory.
    if (initedCache) return;

    cache = data;
    initedCache = true;
    _emitChange();
  });

  // Listener for live updates from the browser
  async function _updateFromStorageOnChanged(changes: { [key: string]: chrome.storage.StorageChange }) {
    // Check if the key we are listening for is in the changes object
    if (changes[key] === undefined) return;

    // `?? fallback` mirrors `get()`. Without it a `chrome.storage.remove(key)` or `.clear()` -
    // a settings reset, an external cleanup - set the cache to `undefined`, and every `useStorage`
    // consumer then dereferenced it mid-render.
    const valueOrUpdate: ValueOrUpdate<D> = deserialize(changes[key].newValue) ?? fallback;

    if (cache === valueOrUpdate) return;

    cache = await updateCache(valueOrUpdate, cache);

    _emitChange();
  }

  // Register listener for live updates for our storage area
  if (liveUpdate) {
    chrome?.storage[storageEnum].onChanged.addListener(_updateFromStorageOnChanged);
  }

  return {
    get,
    set,
    getSnapshot,
    subscribe,
  };
}
