import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { PROGRESS_MESSAGE, QUICK_START_URL, X_URL } from '../constants';

const SRC_DIR = fileURLToPath(new URL('..', import.meta.url));
const DEFINING_FILE = 'constants.ts';

/** Every TypeScript source under `src`, relative to it. */
function sourceFiles(dir = SRC_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [relative(SRC_DIR, full)] : [];
  });
}

describe('PROGRESS_MESSAGE', () => {
  /**
   * The sentinel is compared by value in three places — the appender that replaces the previous
   * progress row, the list that renders it as a spinner, and the handler that emits it. A second
   * copy of the literal would keep compiling and keep passing type-check, and the rows would
   * simply stop matching: stale spinners would pile up in the transcript.
   */
  it('is spelled out in exactly one file', () => {
    const offenders = sourceFiles().filter(
      file => file !== DEFINING_FILE && readFileSync(join(SRC_DIR, file), 'utf8').includes(PROGRESS_MESSAGE),
    );
    expect(offenders).toEqual([]);
  });

  it('is a non-empty string, so a message can never accidentally equal it', () => {
    expect(typeof PROGRESS_MESSAGE).toBe('string');
    expect(PROGRESS_MESSAGE.trim()).not.toBe('');
  });

  // Both consumers reach it through the module, not through a copied literal.
  it('is imported by every file that matches against it', () => {
    const consumers = sourceFiles().filter(file => {
      if (file === DEFINING_FILE) return false;
      return readFileSync(join(SRC_DIR, file), 'utf8').includes('PROGRESS_MESSAGE');
    });
    expect(consumers.length).toBeGreaterThan(0);
    for (const file of consumers) {
      const source = readFileSync(join(SRC_DIR, file), 'utf8');
      expect(`${file}: ${/import\s*\{[^}]*PROGRESS_MESSAGE[^}]*\}\s*from\s*'[^']*constants'/.test(source)}`).toBe(
        `${file}: true`,
      );
    }
  });
});

describe('outbound links', () => {
  it('are absolute https URLs', () => {
    for (const url of [X_URL, QUICK_START_URL]) {
      expect(() => new URL(url)).not.toThrow();
      expect(new URL(url).protocol).toBe('https:');
    }
  });

  // The anchor tracks `id="quickstart"` in landing/index.html. A fragment that no longer matches
  // any element does not error - it just drops the reader at the top of the page - so pin it here.
  it('points the quick start at the landing site quickstart section', () => {
    const url = new URL(QUICK_START_URL);
    expect(url.host).toBe('flowkate.vercel.app');
    expect(url.hash).toBe('#quickstart');
  });
});
