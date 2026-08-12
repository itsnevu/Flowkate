import { describe, it, expect } from 'vitest';
import { redactSecrets, redactSecretsDeep } from '../utils';

describe('redactSecrets', () => {
  it('replaces every occurrence, not just the first', () => {
    expect(redactSecrets('s3cr3t and s3cr3t', { pw: 's3cr3t' })).toBe('<secret>pw</secret> and <secret>pw</secret>');
  });

  it('leaves a message without the secret untouched', () => {
    expect(redactSecrets('nothing to see', { pw: 's3cr3t' })).toBe('nothing to see');
  });

  describe('treats secret values as literal text, never as a pattern', () => {
    // A password of `a+b` compiled into a RegExp would also match `aab`, redacting text the user
    // never asked to hide - and quietly telling them their password appeared where it did not.
    it('does not let a quantifier match text the user never typed', () => {
      expect(redactSecrets('a+b and aab', { pw: 'a+b' })).toBe('<secret>pw</secret> and aab');
    });

    it('does not let a wildcard swallow the whole message', () => {
      expect(redactSecrets('keep .* keep', { pw: '.*' })).toBe('keep <secret>pw</secret> keep');
    });

    // `new RegExp('(')` throws; a literal search must simply find nothing.
    it('survives a value that would be an invalid pattern', () => {
      expect(redactSecrets('an ( here', { pw: '(' })).toBe('an <secret>pw</secret> here');
    });
  });

  describe('treats the placeholder name as literal text too', () => {
    // A string replacement would expand `$&` into the matched secret, printing it back out.
    it('emits a $& in a placeholder name literally', () => {
      expect(redactSecrets('value s3cr3t', { '$&': 's3cr3t' })).toBe('value <secret>$&</secret>');
    });

    it('emits a $1 in a placeholder name literally', () => {
      expect(redactSecrets('value s3cr3t', { $1: 's3cr3t' })).toBe('value <secret>$1</secret>');
    });
  });

  it('replaces the longest value first, so a shorter secret cannot break a longer one apart', () => {
    expect(redactSecrets('abcdef', { short: 'abc', long: 'abcdef' })).toBe('<secret>long</secret>');
  });

  it('replaces the longest value first regardless of key order', () => {
    expect(redactSecrets('abcdef', { long: 'abcdef', short: 'abc' })).toBe('<secret>long</secret>');
  });

  it('skips empty values, which would otherwise match at every position', () => {
    const result = redactSecrets('hello s3cr3t', { empty: '', pw: 's3cr3t' });
    expect(result).toBe('hello <secret>pw</secret>');
    expect(result).not.toContain('empty');
  });

  it('is a no-op with no secrets configured', () => {
    expect(redactSecrets('hello s3cr3t', {})).toBe('hello s3cr3t');
  });
});

describe('redactSecretsDeep', () => {
  const secrets = { pw: 's3cr3t' };

  it('redacts strings nested inside objects and arrays', () => {
    const input = { action: [{ input_text: { index: 1, text: 'type s3cr3t now' } }] };
    expect(redactSecretsDeep(input, secrets)).toEqual({
      action: [{ input_text: { index: 1, text: 'type <secret>pw</secret> now' } }],
    });
  });

  it('rebuilds the containers rather than mutating the value it was given', () => {
    const inner = { index: 1, text: 'type s3cr3t now' };
    const input = { action: [{ input_text: inner }] };
    const output = redactSecretsDeep(input, secrets) as typeof input;

    expect(inner.text).toBe('type s3cr3t now');
    expect(output).not.toBe(input);
    expect(output.action).not.toBe(input.action);
    expect(output.action[0].input_text).not.toBe(inner);
  });

  it('passes non-string leaves through unchanged', () => {
    const input = { count: 3, flag: false, nothing: null, missing: undefined };
    expect(redactSecretsDeep(input, secrets)).toEqual(input);
  });

  it('redacts a bare string', () => {
    expect(redactSecretsDeep('s3cr3t', secrets)).toBe('<secret>pw</secret>');
  });

  it('redacts every string in an array of strings', () => {
    expect(redactSecretsDeep(['s3cr3t', 'safe', 's3cr3t'], secrets)).toEqual([
      '<secret>pw</secret>',
      'safe',
      '<secret>pw</secret>',
    ]);
  });
});
