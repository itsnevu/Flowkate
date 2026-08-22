import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import enMessages from '../../../../packages/i18n/locales/en/messages.json';
import ptMessages from '../../../../packages/i18n/locales/pt_BR/messages.json';
import zhMessages from '../../../../packages/i18n/locales/zh_TW/messages.json';

/**
 * Guards the ways a pane can end up shipping untranslated, all of which the Analytics pane hit at
 * once: it was written with no `t()` call in it at all, its copy sat in the markup as English
 * literals, and the tab that opened it carried a bare string in the TABS array. None of that shows
 * up in type-checking, lint or any render test — `t()` is not required by a type, and a string
 * literal is a perfectly good label.
 *
 * `MessageKey` is an intersection of all three locales' key sets, so type-checking does reject a
 * key that only English defines — but only once something uses it, and the error it prints is the
 * whole key union with the missing name buried in it. The parity checks here fail before that, and
 * name the keys that still need translating.
 *
 * The locale files are read as data rather than through `@extension/i18n`, because the generated
 * runtime resolves against whichever table the last build embedded; the JSON is the source. The
 * source scans cover the side panel as well as this page: the locale tables are shared, and a
 * single place to enforce them beats two copies of the same logic. `pnpm -F options test` is
 * therefore what fails when the side panel grows an untranslated component.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..');
const REPO = resolve(HERE, '..', '..', '..', '..');
const PAGE_ROOTS = [resolve(REPO, 'pages/options/src'), resolve(REPO, 'pages/side-panel/src')];

const LOCALES = {
  pt_BR: ptMessages,
  zh_TW: zhMessages,
} as Record<string, Record<string, { message: string }>>;

const en = enMessages as Record<string, { message: string }>;

/** Every prefix the key convention in CLAUDE.md defines. A literal starting with one of these is
 *  a message key, so it has to resolve; anything else is an ordinary string. */
const KEY_PREFIX = /^(app|bg|exec|act|errors|options|chat|nav|permissions)_/;

/** JSX text that sits directly inside a tag: `>like this</`. Deliberately narrow — a looser match
 *  reads TypeScript generics (`useState<Row[]>([])`) as markup and drowns the signal. */
const JSX_TEXT = />\s*([A-Za-z][^<>{}=;()]*?)\s*<\//g;

/** The product name is the same word in every language, so it is not a translation failure. */
const NOT_COPY = new Set(['Flowkite']);

/** Components that render no copy of their own, and so cannot call `t()`:
 *  - `controls.tsx`, `SelectChevron.tsx` — presentational primitives; their callers pass the text
 *  - `index.tsx` — mount points, no markup beyond the root element
 *  - `LiveStatusStrip.tsx` — renders `status.text`, which arrives already localised
 *  Anything else with no `t()` call is a pane that forgot. */
const RENDERS_NO_COPY = new Set([
  'pages/options/src/index.tsx',
  'pages/options/src/components/controls.tsx',
  'pages/options/src/components/model-settings/SelectChevron.tsx',
  'pages/side-panel/src/index.tsx',
  'pages/side-panel/src/components/LiveStatusStrip.tsx',
]);

function sourceFiles(dir: string, extension = /\.tsx?$/): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && extension.test(entry.name))
    .map(entry => join(entry.parentPath ?? entry.path, entry.name))
    .filter(path => !path.includes('__tests__'));
}

const components = PAGE_ROOTS.flatMap(root => sourceFiles(root, /\.tsx$/));

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

describe('the pages', () => {
  it('use no message key that English does not define', () => {
    const unresolved: string[] = [];
    for (const file of PAGE_ROOTS.flatMap(root => sourceFiles(root))) {
      const source = readFileSync(file, 'utf8');
      for (const [, literal] of source.matchAll(/'([A-Za-z0-9_]+)'/g)) {
        if (KEY_PREFIX.test(literal) && !(literal in en)) {
          unresolved.push(`${relative(REPO, file)}: ${literal}`);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });

  it('render no copy straight from the markup', () => {
    const hardcoded: string[] = [];
    for (const file of components) {
      const source = readFileSync(file, 'utf8');
      for (const [, text] of source.matchAll(JSX_TEXT)) {
        const copy = text.replace(/\s+/g, ' ').trim();
        if (copy.length > 1 && !NOT_COPY.has(copy)) {
          hardcoded.push(`${relative(REPO, file)}: ${copy}`);
        }
      }
    }
    expect(hardcoded).toEqual([]);
  });

  it('give every component that shows copy a way to translate it', () => {
    // The Analytics pane's actual failure: 187 lines of markup, not one `t()` in the file.
    const silent = components
      .map(file => relative(REPO, file))
      .filter(file => !RENDERS_NO_COPY.has(file))
      .filter(file => !/\bt\(/.test(readFileSync(join(REPO, file), 'utf8')));
    expect(silent).toEqual([]);
  });
});

describe('the options page', () => {
  it('labels every tab through t(), never with a bare string', () => {
    const source = readFileSync(join(SRC, 'Options.tsx'), 'utf8');
    // Asserted first so the check below cannot pass by matching nothing at all.
    expect(source).toMatch(/label: t\(/);
    expect(source.match(/label:\s*['"`]/g) ?? []).toEqual([]);
  });
});
