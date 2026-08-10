import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { memoryStore, MemoryScope, MAX_MEMORY_ENTRIES, MAX_MEMORY_LENGTH } from '../lib/memory/memoryStore';

describe('memoryStore', () => {
  beforeEach(async () => {
    await memoryStore.setEnabled(true);
    await memoryStore.forgetAll();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('remember', () => {
    it('stores a global fact and recalls it on any host', async () => {
      await memoryStore.remember('prefers metric units', MemoryScope.GLOBAL);
      const recalled = await memoryStore.recall('example.test');
      expect(recalled.map(entry => entry.content)).toEqual(['prefers metric units']);
    });

    it('recalls a site fact only on its own host', async () => {
      await memoryStore.remember('aisle seat', MemoryScope.SITE, 'airline.test');
      expect(await memoryStore.recall('airline.test')).toHaveLength(1);
      expect(await memoryStore.recall('other.test')).toHaveLength(0);
    });

    // www.x.com and X.com are the same site to a user, and splitting them would silently lose recall
    it('treats www and casing as the same host', async () => {
      await memoryStore.remember('aisle seat', MemoryScope.SITE, 'WWW.Airline.test');
      expect(await memoryStore.recall('airline.test')).toHaveLength(1);
    });

    it('refuses a site fact with no host, since it could never be recalled', async () => {
      expect(await memoryStore.remember('orphan', MemoryScope.SITE, '')).toBeNull();
      expect(await memoryStore.getAll()).toHaveLength(0);
    });

    it('ignores empty and whitespace-only content', async () => {
      expect(await memoryStore.remember('   ', MemoryScope.GLOBAL)).toBeNull();
      expect(await memoryStore.getAll()).toHaveLength(0);
    });

    it('truncates an over-long fact rather than letting it crowd out the rest', async () => {
      const entry = await memoryStore.remember('x'.repeat(MAX_MEMORY_LENGTH + 50), MemoryScope.GLOBAL);
      expect(entry?.content).toHaveLength(MAX_MEMORY_LENGTH);
    });

    it('writes nothing while memory is turned off', async () => {
      await memoryStore.setEnabled(false);
      expect(await memoryStore.remember('should not persist', MemoryScope.GLOBAL)).toBeNull();
      expect(await memoryStore.getAll()).toHaveLength(0);
    });
  });

  describe('deduplication', () => {
    // repeated observations of the same preference would otherwise stack up as near-duplicates
    it('updates in place instead of storing the same fact twice', async () => {
      await memoryStore.remember('prefers dark mode', MemoryScope.GLOBAL);
      await memoryStore.remember('prefers dark mode', MemoryScope.GLOBAL);
      expect(await memoryStore.getAll()).toHaveLength(1);
    });

    it('matches regardless of casing', async () => {
      await memoryStore.remember('Prefers Dark Mode', MemoryScope.GLOBAL);
      await memoryStore.remember('prefers dark mode', MemoryScope.GLOBAL);
      expect(await memoryStore.getAll()).toHaveLength(1);
    });

    it('keeps the same fact separate per scope and host', async () => {
      await memoryStore.remember('free shipping', MemoryScope.GLOBAL);
      await memoryStore.remember('free shipping', MemoryScope.SITE, 'a.test');
      await memoryStore.remember('free shipping', MemoryScope.SITE, 'b.test');
      expect(await memoryStore.getAll()).toHaveLength(3);
    });
  });

  describe('eviction', () => {
    it('caps the store, since every entry costs context on every run', async () => {
      for (let i = 0; i < MAX_MEMORY_ENTRIES + 10; i++) {
        await memoryStore.remember(`fact number ${i}`, MemoryScope.GLOBAL);
      }
      expect(await memoryStore.getAll()).toHaveLength(MAX_MEMORY_ENTRIES);
    });

    it('evicts the least recently used, not the oldest', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

      // the first fact is also the oldest, so only recency can save it
      const first = await memoryStore.remember('the first fact', MemoryScope.GLOBAL);
      for (let i = 1; i < MAX_MEMORY_ENTRIES; i++) {
        await memoryStore.remember(`filler fact ${i}`, MemoryScope.GLOBAL);
      }

      vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
      await memoryStore.markUsed([first!.id]);

      vi.setSystemTime(new Date('2026-06-02T00:00:00Z'));
      await memoryStore.remember('one too many', MemoryScope.GLOBAL);

      const remaining = await memoryStore.getAll();
      expect(remaining).toHaveLength(MAX_MEMORY_ENTRIES);
      expect(remaining.some(entry => entry.content === 'the first fact')).toBe(true);
      expect(remaining.some(entry => entry.content === 'filler fact 1')).toBe(false);
    });
  });

  describe('forgetting', () => {
    it('forgets a single entry and leaves the others', async () => {
      const kept = await memoryStore.remember('keep me', MemoryScope.GLOBAL);
      const dropped = await memoryStore.remember('drop me', MemoryScope.GLOBAL);
      await memoryStore.forget(dropped!.id);

      const remaining = await memoryStore.getAll();
      expect(remaining.map(entry => entry.id)).toEqual([kept!.id]);
    });

    it('forgets everything without disabling memory', async () => {
      await memoryStore.remember('a fact', MemoryScope.GLOBAL);
      await memoryStore.forgetAll();
      expect(await memoryStore.getAll()).toHaveLength(0);
      expect(await memoryStore.isEnabled()).toBe(true);
    });
  });

  describe('recall', () => {
    it('recalls nothing while memory is turned off, without deleting anything', async () => {
      await memoryStore.remember('still stored', MemoryScope.GLOBAL);
      await memoryStore.setEnabled(false);

      expect(await memoryStore.recall('example.test')).toHaveLength(0);
      // the switch must be reversible, so the entries have to survive it
      expect(await memoryStore.getAll()).toHaveLength(1);
    });
  });
});
