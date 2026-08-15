import { StorageEnum } from '../base/enums';
import { createStorage } from '../base/base';
import type { BaseStorage } from '../base/types';

/**
 * What a remembered fact is about. The scope decides when it is worth spending context on: a
 * site-scoped memory is only loaded once the agent is actually on that site.
 */
export enum MemoryScope {
  /** applies everywhere, e.g. "prefers metric units" */
  GLOBAL = 'global',
  /** applies to one site, e.g. "my seat preference on this airline is aisle" */
  SITE = 'site',
}

export interface MemoryEntry {
  id: number;
  /** the fact itself, in the user's own terms */
  content: string;
  scope: MemoryScope;
  /** host this applies to, e.g. `mail.google.com`; empty for global memories */
  host: string;
  createdAt: number;
  /** last time this memory was actually loaded into a task, for pruning what never gets used */
  lastUsedAt: number;
}

export interface MemoryStorageState {
  nextId: number;
  entries: MemoryEntry[];
  /** master switch — off means nothing is written and nothing is recalled */
  enabled: boolean;
}

/**
 * Cap on stored memories. Recall injects matching entries into every task's prompt, so an unbounded
 * store would quietly grow the cost of every single run. Oldest-unused is evicted first.
 */
export const MAX_MEMORY_ENTRIES = 100;
/** Cap per entry, to keep one runaway memory from crowding out the rest. */
export const MAX_MEMORY_LENGTH = 500;

const initialState: MemoryStorageState = {
  nextId: 1,
  entries: [],
  enabled: true,
};

/**
 * Deliberately StorageEnum.Local: memories stay on this machine and are never synced to a server or
 * across devices. Personal preferences are exactly the kind of data that should not leave the
 * browser, and being local-only is also what makes this defensible in an extension review.
 */
const storage: BaseStorage<MemoryStorageState> = createStorage('agent-memory', initialState, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

export interface MemoryStore {
  remember: (content: string, scope: MemoryScope, host?: string) => Promise<MemoryEntry | null>;
  forget: (id: number) => Promise<void>;
  forgetAll: () => Promise<void>;
  getAll: () => Promise<MemoryEntry[]>;
  /** Memories worth loading for a task on `host`: everything global plus that host's own. */
  recall: (host: string) => Promise<MemoryEntry[]>;
  /** Mark entries as used, so pruning keeps what the agent actually relies on. */
  markUsed: (ids: number[]) => Promise<void>;
  isEnabled: () => Promise<boolean>;
  setEnabled: (enabled: boolean) => Promise<void>;
}

async function read(): Promise<MemoryStorageState> {
  return (await storage.get()) ?? initialState;
}

/** Normalize a host so `www.x.com` and `X.com` do not become two separate memory buckets. */
function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

export const memoryStore: MemoryStore = {
  async remember(content: string, scope: MemoryScope, host = '') {
    const state = await read();
    if (!state.enabled) return null;

    const trimmed = content.trim().slice(0, MAX_MEMORY_LENGTH);
    if (!trimmed) return null;

    const normalizedHost = scope === MemoryScope.SITE ? normalizeHost(host) : '';
    // a site memory without a host would be recalled nowhere, so it is not worth storing
    if (scope === MemoryScope.SITE && !normalizedHost) return null;

    // updating in place keeps repeated observations from stacking up as near-duplicates
    const existing = state.entries.find(
      entry =>
        entry.scope === scope && entry.host === normalizedHost && entry.content.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      existing.lastUsedAt = Date.now();
      await storage.set(state);
      return existing;
    }

    const entry: MemoryEntry = {
      id: state.nextId,
      content: trimmed,
      scope,
      host: normalizedHost,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };

    const entries = [...state.entries, entry];
    // evict least-recently-used once over the cap
    if (entries.length > MAX_MEMORY_ENTRIES) {
      entries.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
      entries.splice(0, entries.length - MAX_MEMORY_ENTRIES);
    }

    await storage.set({ nextId: state.nextId + 1, entries, enabled: state.enabled });
    return entry;
  },

  async forget(id: number) {
    const state = await read();
    await storage.set({ ...state, entries: state.entries.filter(entry => entry.id !== id) });
  },

  async forgetAll() {
    const state = await read();
    await storage.set({ ...state, entries: [] });
  },

  async getAll() {
    const state = await read();
    return [...state.entries].sort((a, b) => b.createdAt - a.createdAt);
  },

  async recall(host: string) {
    const state = await read();
    if (!state.enabled) return [];
    const normalizedHost = normalizeHost(host);
    return state.entries.filter(
      entry =>
        entry.scope === MemoryScope.GLOBAL || (entry.scope === MemoryScope.SITE && entry.host === normalizedHost),
    );
  },

  async markUsed(ids: number[]) {
    if (ids.length === 0) return;
    const state = await read();
    const now = Date.now();
    for (const entry of state.entries) {
      if (ids.includes(entry.id)) entry.lastUsedAt = now;
    }
    await storage.set(state);
  },

  async isEnabled() {
    return (await read()).enabled;
  },

  async setEnabled(enabled: boolean) {
    const state = await read();
    await storage.set({ ...state, enabled });
  },
};

export default memoryStore;
