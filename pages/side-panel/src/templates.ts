/**
 * Template placeholders in saved prompts.
 *
 * A pinned prompt whose content contains `{slot}` tokens is a template: selecting it drops the
 * text into the composer, which then walks the user through the slots (first slot selected,
 * Tab to the next, send held until none remain).
 *
 * The token grammar is deliberately narrow — a name that starts with a letter or digit, in any
 * script, up to 40 chars of word-ish characters — so prose braces and JSON fragments
 * (`{"a": 1}`, `{}`) never light up as slots someone is forced to fill.
 */

export interface PlaceholderSpan {
  /** Index of the opening brace. */
  start: number;
  /** Index just past the closing brace. */
  end: number;
  /** The name between the braces. */
  name: string;
}

// Built with the constructor because this workspace type-checks at an ES5 target, which rejects
// the `u` flag in regex *literals* at compile time; the flag itself is fine in every browser the
// extension can run in. \p{L}\p{N}: any letter or digit, so slot names work in any script.
const PLACEHOLDER = new RegExp(String.raw`\{([\p{L}\p{N}][\p{L}\p{N} _-]{0,39})\}`, 'gu');

/** Every placeholder in `text`, in document order. */
export function findPlaceholders(text: string): PlaceholderSpan[] {
  const spans: PlaceholderSpan[] = [];
  for (const match of text.matchAll(PLACEHOLDER)) {
    const start = match.index ?? 0;
    spans.push({ start, end: start + match[0].length, name: match[1] });
  }
  return spans;
}

/**
 * The placeholder the caret should jump to from position `from`, wrapping around the ends so
 * repeated jumps cycle. Forward means the first slot starting at or after the caret; backwards
 * means the last slot ending at or before it — both chosen so a currently-selected slot is
 * stepped over rather than reselected.
 */
export function nextPlaceholder(text: string, from: number, backwards = false): PlaceholderSpan | null {
  const spans = findPlaceholders(text);
  if (spans.length === 0) {
    return null;
  }
  if (backwards) {
    for (let i = spans.length - 1; i >= 0; i--) {
      if (spans[i].end <= from) {
        return spans[i];
      }
    }
    return spans[spans.length - 1];
  }
  for (const span of spans) {
    if (span.start >= from) {
      return span;
    }
  }
  return spans[0];
}
