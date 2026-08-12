import { describe, it, expect } from 'vitest';
import favoritesStorage from '../lib/prompt/favorites';

/**
 * The starter prompts are written into the user's own storage on first read, where they become
 * ordinary rows: renameable, deletable, and indistinguishable from something the user saved. That
 * is a fine way to ship worked examples and a terrible way to ship anything else, so what may sit
 * in that list is worth pinning down.
 */
describe('favoritesStorage seeding', () => {
  it('seeds worked examples on a fresh install', async () => {
    const prompts = await favoritesStorage.getAllPrompts();

    expect(prompts.length).toBeGreaterThan(0);
    for (const prompt of prompts) {
      expect(prompt.title.trim()).not.toBe('');
      expect(prompt.content.trim()).not.toBe('');
    }
  });

  it('seeds nothing that asks the user to promote the project', async () => {
    const prompts = await favoritesStorage.getAllPrompts();
    const text = prompts
      .map(p => `${p.title} ${p.content}`)
      .join('\n')
      .toLowerCase();

    // A seeded prompt is not a marketing surface: it arrives wearing the user's own handwriting.
    // Matched as phrases, not words - "upvotes" is legitimate subject matter in a prompt about
    // ranking papers, and a bare word list would fail on it.
    for (const plug of ['star us', 'star the repo', 'give us a star', 'support us', 'follow us']) {
      expect(text).not.toContain(plug);
    }
    // and it must not point the agent at the project's own repository
    expect(text).not.toContain('github.com/itsnevu');
  });

  it('seeds only once, so a user who deletes them gets to keep them deleted', async () => {
    const seeded = await favoritesStorage.getAllPrompts();
    expect(seeded.length).toBeGreaterThan(0);

    for (const prompt of seeded) {
      await favoritesStorage.removePrompt(prompt.id);
    }

    expect(await favoritesStorage.getAllPrompts()).toEqual([]);
  });
});
