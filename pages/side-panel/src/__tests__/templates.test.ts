import { describe, it, expect } from 'vitest';
import { findPlaceholders, nextPlaceholder } from '../templates';

/**
 * The token grammar is the contract three surfaces share: the composer's fill-in flow, the
 * bookmark chip's template badge, and the seeded starter prompts in storage. What counts as a
 * slot — and, just as much, what must never count as one — is pinned here.
 */
describe('findPlaceholders', () => {
  it('finds a single slot with its span and name', () => {
    const text = 'Compare the price of {product} across shops';
    expect(findPlaceholders(text)).toEqual([{ start: 21, end: 30, name: 'product' }]);
  });

  it('finds several slots in document order', () => {
    const names = findPlaceholders('Book a {room type} for {number of nights} nights').map(s => s.name);
    expect(names).toEqual(['room type', 'number of nights']);
  });

  it('allows names in any script', () => {
    expect(findPlaceholders('Cari harga {nama produk} dan {個數}').map(s => s.name)).toEqual(['nama produk', '個數']);
  });

  it('returns spans that slice back out of the text', () => {
    const text = 'a {b} c {d}';
    for (const span of findPlaceholders(text)) {
      expect(text.slice(span.start, span.end)).toBe(`{${span.name}}`);
    }
  });

  it('does not treat JSON fragments as slots', () => {
    // A quote or colon opens the token, so it fails the "starts with a letter or digit" rule.
    expect(findPlaceholders('send {"amount": 5} and {}')).toEqual([]);
  });

  it('does not match across lines, nested braces, or empty tokens', () => {
    expect(findPlaceholders('{a\nb}')).toEqual([]);
    expect(findPlaceholders('{}')).toEqual([]);
    expect(findPlaceholders('{{a}}').map(s => s.name)).toEqual(['a']);
  });

  it('caps the name length so a braced paragraph is not a slot', () => {
    expect(findPlaceholders(`{${'a'.repeat(41)}}`)).toEqual([]);
    expect(findPlaceholders(`{${'a'.repeat(40)}}`)).toHaveLength(1);
  });

  it('finds nothing in slot-free text', () => {
    expect(findPlaceholders('plain text, no slots')).toEqual([]);
  });
});

describe('nextPlaceholder', () => {
  const text = 'find {a} then {b} then {c}';
  // spans: {a} 5..8, {b} 14..17, {c} 23..26

  it('returns null when there are no slots', () => {
    expect(nextPlaceholder('no slots', 0)).toBeNull();
  });

  it('moves forward to the first slot at or after the caret', () => {
    expect(nextPlaceholder(text, 0)?.name).toBe('a');
    expect(nextPlaceholder(text, 9)?.name).toBe('b');
  });

  it('steps over the currently selected slot rather than reselecting it', () => {
    // A selected slot puts the caret at its end; from {a}'s end the next stop is {b}.
    expect(nextPlaceholder(text, 8)?.name).toBe('b');
  });

  it('wraps forward from past the last slot', () => {
    expect(nextPlaceholder(text, 23)?.name).toBe('c');
    expect(nextPlaceholder(text, 24)?.name).toBe('a');
    expect(nextPlaceholder(text, text.length)?.name).toBe('a');
  });

  it('moves backwards to the last slot ending at or before the caret', () => {
    // A selected slot puts the anchor at its start; from {c}'s start the previous stop is {b}.
    expect(nextPlaceholder(text, 23, true)?.name).toBe('b');
    expect(nextPlaceholder(text, 18, true)?.name).toBe('b');
  });

  it('wraps backwards from before the first slot', () => {
    expect(nextPlaceholder(text, 0, true)?.name).toBe('c');
    expect(nextPlaceholder(text, 5, true)?.name).toBe('c');
  });
});
