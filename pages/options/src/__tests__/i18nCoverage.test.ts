import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import enMessages from '../../../../packages/i18n/locales/en/messages.json';
import ptMessages from '../../../../packages/i18n/locales/pt_BR/messages.json';
import zhMessages from '../../../../packages/i18n/locales/zh_TW/messages.json';

/**
 * Guards the two ways a pane can end up shipping untranslated, both of which the Analytics pane
 * hit at once: it was written with no `t()` call in it at all, and the tab that opens it carried a
 * bare English string in the TABS array. Neither shows up in type-checking, lint or any render
 * test — `t()` is not required by a type, and a string literal is a perfectly good label.
 *
 * `MessageKey` is an intersection of all three locales' key sets, so type-checking does reject a
 * key that only English defines — but only once something uses it, and the error it prints is the
 * whole 450-key union with the missing name buried in it. The parity checks here fail before that,
 * and name the keys that still need translating.
 *
 * The locale files are read as data rather than through `@extension/i18n`, because the generated
 * runtime resolves against whichever table the last build embedded; the JSON is the source.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..');
const REPO = resolve(HERE, '..', '..', '..', '..');

const LOCALES = {
  pt_BR: ptMessages,
  zh_TW: zhMessages,
} as Record<string, Record<string, { message: string }>>;

const en = enMessages as Record<string, { message: string }>;

/** Every prefix the key convention in CLAUDE.md defines. A literal starting with one of these is
 *  a message key, so it has to resolve; anything else is an ordinary string. */
const KEY_PREFIX = /^(app|bg|exec|act|errors|options|chat|nav|permissions)_/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map(entry => join(entry.parentPath ?? entry.path, entry.name))
    .filter(path => !path.includes('__tests__'));
}

describe('locale coverage', () => {
  const enKeys = Object.keys(en);

  it.each(Object.keys(LOCALES))('%s carries exactly the keys English defines', locale => {
    const keys = Object.keys(LOCALES[locale]);
    // Reported as key lists rather than counts: a failure should name what to translate.
    expect(enKeys.filter(key => !(key in LOCALES[locale]))).toEqual([]);
    expect(keys.filter(key => !(key in en))).toEqual([]);
  });

  it.each(Object.keys(LOCALES))('%s leaves no message empty', locale => {
    const blank = Object.entries(LOCALES[locale])
      .filter(([, entry]) => entry.message.trim() === '')
      .map(([key]) => key);
    expect(blank).toEqual([]);
  });
});

describe('the options page', () => {
  it('uses no message key that English does not define', () => {
    const unresolved: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, 'utf8');
      for (const [, literal] of source.matchAll(/'([A-Za-z0-9_]+)'/g)) {
        if (KEY_PREFIX.test(literal) && !(literal in en)) {
          unresolved.push(`${relative(REPO, file)}: ${literal}`);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });

  it('labels every tab through t(), never with a bare string', () => {
    const source = readFileSync(join(SRC, 'Options.tsx'), 'utf8');
    // Asserted first so the check below cannot pass by matching nothing at all.
    expect(source).toMatch(/label: t\(/);
    expect(source.match(/label:\s*['"`]/g) ?? []).toEqual([]);
  });
});
