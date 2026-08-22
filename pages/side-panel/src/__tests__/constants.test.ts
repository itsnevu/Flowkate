import { describe, it, expect } from 'vitest';
import { QUICK_START_URL, X_URL } from '../constants';

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
    expect(url.host).toBe('www.flowkite.xyz');
    expect(url.hash).toBe('#quickstart');
  });
});
