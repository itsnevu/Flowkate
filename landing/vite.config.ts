import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

/**
 * Rewrite the error page's asset URLs to root-absolute.
 *
 * Vercel serves dist/404.html for every unmatched path, at whatever depth the
 * bad URL happened to have. `base: './'` is right for the real pages — each one
 * always sits at its own known path — but wrong for this one: a broken link at
 * /a/b/c would resolve `./assets/style.css` against /a/b/, and the error page
 * would arrive with no stylesheet and no mark. Only 404.html needs this.
 */
const rootAbsolute404 = (): Plugin => ({
  name: 'flowkite:root-absolute-404',
  transformIndexHtml: {
    // After Vite has injected and base-rewritten the asset tags, so there is
    // something to rewrite.
    order: 'post',
    handler(html, ctx) {
      if (!ctx.path.endsWith('404.html')) return html;
      // Deliberately narrow: only `./`-prefixed hrefs/srcs, so absolute links
      // and external URLs on the page are left exactly as authored.
      return html.replace(/(href|src)="\.\//g, '$1="/');
    },
  },
});

// The landing site ships as a plain static bundle, so `base: './'` keeps every
// asset URL relative and the built output works from a subpath as well as root.
export default defineConfig({
  base: './',
  plugins: [rootAbsolute404()],
  build: {
    target: 'es2022',
    rollupOptions: {
      // One HTML entry per language. The localized pages import the same
      // src/main.ts, so every locale shares one JS/CSS bundle and the only
      // per-language weight is the HTML itself.
      //
      // Relative paths on purpose (resolved against the project root): this
      // workspace ships no @types/node, so `node:path` / `import.meta.dirname`
      // type-check locally only by borrowing the monorepo's types — and then
      // fail on Vercel, where only landing/ is installed.
      input: {
        main: 'index.html',
        'pt-BR': 'pt-BR/index.html',
        'zh-TW': 'zh-TW/index.html',
        // Vercel serves dist/404.html for any unmatched path on a static deployment.
        notFound: '404.html',
      },
      output: {
        // three.js is by far the heaviest dependency; give it its own chunk so
        // the copy/motion code can be cached and re-shipped independently.
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
