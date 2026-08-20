import { describe, it, expect, vi } from 'vitest';
import { isIgnoredUrl } from '../page';

// Both refuse to load outside a real extension, and neither is reachable from the matcher.
vi.mock('webextension-polyfill', () => ({ default: {} }));
vi.mock('puppeteer-core/lib/esm/puppeteer/puppeteer-core-browser.js', () => ({
  connect: vi.fn(),
  ExtensionTransport: { connectTab: vi.fn() },
}));

/**
 * Which requests the page-settle wait is allowed to ignore.
 *
 * This is a correctness boundary, not a tidiness one. A request wrongly ignored is a request the
 * agent does not wait for, so it parses the DOM while the response that fills the page is still in
 * flight — and the parse succeeds, because the previous view is still mounted. The model is then
 * handed the old screen's elements renumbered as if they were the new page's.
 */
describe('isIgnoredUrl', () => {
  it.each([
    'https://www.google-analytics.com/collect',
    'https://example.com/analytics/event',
    'https://stats.g.doubleclick.net/j/collect',
    'https://example.com/telemetry',
    'https://example.com/api/heartbeat',
    'https://example.com/ping',
    'https://widget.intercom.io/widget/abc',
    'https://d111111abcdef8.cloudfront.net/app.js',
  ])('ignores background chatter: %s', url => {
    expect(isIgnoredUrl(url)).toBe(true);
  });

  /**
   * The reason the matcher stopped being `url.includes(pattern)`. Every one of these was dropped
   * from the wait by a bare substring test, and every one of them is a request the page renders
   * from — `ping` alone took out shopping sites, shipping APIs and map tiles.
   */
  it.each([
    ['https://shopping.com/search?q=kite', 'ping inside a hostname label'],
    ['https://example.com/api/shipping/rates', 'ping inside a path segment'],
    ['https://example.com/mapping/tiles/3/4.json', 'ping inside a longer word'],
    ['https://example.com/api/pingback-settings', 'ping as a prefix of a segment word'],
    ['https://metrics-dashboard.example.com/api/orders', 'metrics inside a longer host label'],
    ['https://example.com/products/beacons', 'beacon inside a longer segment'],
    ['https://example.com/api/search', 'nothing matching at all'],
  ])('waits for %s (%s)', url => {
    expect(isIgnoredUrl(url)).toBe(false);
  });

  it('matches a dotted pattern as a host suffix, never mid-string', () => {
    expect(isIgnoredUrl('https://abc.cloudfront.net/main.js')).toBe(true);
    // the pattern as a path, on someone else's host, is not that host
    expect(isIgnoredUrl('https://example.com/cloudfront.net/main.js')).toBe(false);
    // and a host that merely ends in the same letters is a different host
    expect(isIgnoredUrl('https://notcloudfront.net/main.js')).toBe(false);
  });

  it('splits hyphenated and underscored segments, so a whole word still counts', () => {
    expect(isIgnoredUrl('https://example.com/api/user-analytics-v2')).toBe(true);
    expect(isIgnoredUrl('https://example.com/api/tracking_pixel')).toBe(true);
  });

  it('keeps a scheme pattern anchored to the start', () => {
    expect(isIgnoredUrl('wss://example.com/socket')).toBe(true);
    expect(isIgnoredUrl('https://example.com/redirect?to=wss://other')).toBe(false);
  });

  it('treats anything unparseable as worth waiting for', () => {
    expect(isIgnoredUrl('not a url')).toBe(false);
    expect(isIgnoredUrl('')).toBe(false);
  });
});
