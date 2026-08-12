/** Values shared by the panel shell and the pieces it renders. */

export const X_URL = 'https://x.com/flowkite';

// The landing site, now that it is deployed. Anchor must track the section id in
// landing/index.html, which is `id="quickstart"` - renaming that section breaks this link
// silently, because a missing fragment just lands the reader at the top of the page.
export const QUICK_START_URL = 'https://flowkate.vercel.app/#quickstart';

/**
 * Sentinel content for the transient "working on it" row. It is matched by value in two
 * places — the appender replaces the previous one, and history never persists it — so it
 * has to be a single shared constant rather than two equal literals.
 */
export const PROGRESS_MESSAGE = 'Showing progress...';
