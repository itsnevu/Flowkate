/** Values shared by the panel shell and the pieces it renders. */

// @Flowkiteai, confirmed by the owner - x.com/flowkite belongs to an unrelated account.
export const X_URL = 'https://x.com/Flowkiteai';

// The landing site, now that it is deployed. Anchor must track the section id in
// landing/index.html, which is `id="quickstart"` - renaming that section breaks this link
// silently, because a missing fragment just lands the reader at the top of the page.
// The host must exist as a domain on the Vercel project before this ships.
export const QUICK_START_URL = 'https://www.flowkite.xyz/#quickstart';
