import { describe, it, expect } from 'vitest';
import { isUrlAllowed } from '../util';

/**
 * `isUrlAllowed` is the only gate between a model-chosen URL and `chrome.tabs.update`,
 * `chrome.tabs.create` and `page.goto`. The model's choice can be steered by the page it is
 * reading, so these are adversarial inputs rather than typos.
 *
 * With both lists empty - the default - everything below the firewall section is skipped, so the
 * scheme check is the entire policy for most installs.
 */
describe('isUrlAllowed - scheme policy', () => {
  it.each([
    ['plain javascript', 'javascript:alert(1)'],
    ['tab inside the scheme', 'java\tscript:alert(1)'],
    ['newline inside the scheme', 'java\nscript:alert(1)'],
    ['carriage return inside the scheme', 'java\rscript:alert(1)'],
    ['leading whitespace', '   javascript:alert(1)'],
    ['uppercased', 'JAVASCRIPT:alert(1)'],
    ['data', 'data:text/html,<script>alert(1)</script>'],
    ['file', 'file:///etc/passwd'],
    ['vbscript', 'vbscript:msgbox(1)'],
    ['chrome', 'chrome://settings'],
    ['chrome-extension', 'chrome-extension://abcdef/page.html'],
    ['chrome-untrusted', 'chrome-untrusted://terminal'],
    ['devtools', 'devtools://devtools/bundled/inspector.html'],
    ['websocket', 'ws://evil.test/socket'],
    ['secure websocket', 'wss://evil.test/socket'],
    ['blob', 'blob:https://evil.test/1e6f-0d2c'],
    ['filesystem', 'filesystem:https://evil.test/temporary/payload'],
    ['view-source', 'view-source:file:///etc/passwd'],
    ['about, other than blank', 'about:srcdoc'],
  ])('refuses %s even with the firewall off', (_label, url) => {
    // The whitespace variants are the reason this is a protocol check and not a prefix match:
    // trim() leaves whitespace inside the scheme, and the URL parser then removes it.
    expect(isUrlAllowed(url, [], [])).toBe(false);
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['not a URL at all', 'not a url'],
    ['scheme-relative', '//evil.test/path'],
  ])('refuses %s', (_label, url) => {
    expect(isUrlAllowed(url, [], [])).toBe(false);
  });

  it('allows about:blank, which unattended runs start from', () => {
    expect(isUrlAllowed('about:blank', [], [])).toBe(true);
    // Still allowed once a firewall is configured, since it is not a site.
    expect(isUrlAllowed('about:blank', ['example.com'], [])).toBe(true);
  });

  it('allows ordinary http and https', () => {
    expect(isUrlAllowed('https://example.com/path?q=1', [], [])).toBe(true);
    expect(isUrlAllowed('http://localhost:11434/api', [], [])).toBe(true);
  });

  it('refuses the Chrome Web Store, which cannot be scripted', () => {
    expect(isUrlAllowed('https://chromewebstore.google.com/detail/x', [], [])).toBe(false);
    expect(isUrlAllowed('https://chromewebstore.google.com./detail/x', [], [])).toBe(false);
  });
});

describe('isUrlAllowed - allow and deny lists', () => {
  it('denies a listed domain and its subdomains', () => {
    expect(isUrlAllowed('https://evil.com/x', [], ['evil.com'])).toBe(false);
    expect(isUrlAllowed('https://sub.evil.com/x', [], ['evil.com'])).toBe(false);
  });

  it('does not let a trailing dot spell around a deny entry', () => {
    // "evil.com." is a valid fully-qualified name that Chrome resolves normally.
    expect(isUrlAllowed('https://evil.com./x', [], ['evil.com'])).toBe(false);
  });

  it('does not treat a suffix match as a domain match', () => {
    expect(isUrlAllowed('https://notevil.com/x', [], ['evil.com'])).toBe(true);
  });

  it('reads the host from the parser, not from the text around it', () => {
    // The real host of each of these is evil.com; only the text looks allowed.
    expect(isUrlAllowed('https://good.com@evil.com/', ['good.com'], [])).toBe(false);
    expect(isUrlAllowed('https://good.com.evil.com/', ['good.com'], [])).toBe(false);
    expect(isUrlAllowed('https://evil.com/?r=good.com', ['good.com'], [])).toBe(false);
  });

  it('restricts to the allow list once one is set', () => {
    expect(isUrlAllowed('https://good.com/x', ['good.com'], [])).toBe(true);
    expect(isUrlAllowed('https://other.com/x', ['good.com'], [])).toBe(false);
  });

  it('lets deny win over allow for the same domain', () => {
    expect(isUrlAllowed('https://both.com/x', ['both.com'], ['both.com'])).toBe(false);
  });

  it('is not fooled by more than one trailing dot', () => {
    // Stripping a single trailing dot left `evil.com..` naming the denied host but matching nothing.
    expect(isUrlAllowed('https://evil.com../x', [], ['evil.com'])).toBe(false);
    expect(isUrlAllowed('https://chromewebstore.google.com../detail/x', [], [])).toBe(false);
    // ...and the same asymmetry refused a host the user had explicitly allowed.
    expect(isUrlAllowed('https://good.com../x', ['good.com'], [])).toBe(true);
  });

  it('lets a deny entry outrank an allow entry that is more specific', () => {
    // Two different strings, so the options UI holds both. The allow check used to run first and
    // return true before the domain deny list was consulted at all.
    expect(isUrlAllowed('https://sub.evil.com', ['sub.evil.com'], ['evil.com'])).toBe(false);
    expect(isUrlAllowed('https://sub.evil.com/path', ['sub.evil.com'], ['evil.com'])).toBe(false);
  });

  it('keeps refusing dangerous schemes when an allow list is configured', () => {
    expect(isUrlAllowed('javascript:alert(1)', ['example.com'], [])).toBe(false);
    expect(isUrlAllowed('file:///etc/passwd', ['example.com'], [])).toBe(false);
  });
});
