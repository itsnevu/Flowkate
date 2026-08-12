/** Values shared by the panel shell and the pieces it renders. */

export const X_URL = 'https://x.com/flowkite';

// TODO: point this at the landing site once it is deployed.
// Anchor must track the README heading: it is "## Install", so the fragment is #install.
export const QUICK_START_URL = 'https://github.com/itsnevu/Flowkite?tab=readme-ov-file#install';

/**
 * Sentinel content for the transient "working on it" row. It is matched by value in two
 * places — the appender replaces the previous one, and history never persists it — so it
 * has to be a single shared constant rather than two equal literals.
 */
export const PROGRESS_MESSAGE = 'Showing progress...';
