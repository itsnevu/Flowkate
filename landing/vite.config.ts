import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The landing site ships as a plain static bundle, so `base: './'` keeps every
// asset URL relative and the built output works from a subpath as well as root.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      // One HTML entry per language. The localized pages import the same
      // src/main.ts, so every locale shares one JS/CSS bundle and the only
      // per-language weight is the HTML itself.
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        'pt-BR': resolve(import.meta.dirname, 'pt-BR/index.html'),
        'zh-TW': resolve(import.meta.dirname, 'zh-TW/index.html'),
        // Vercel serves dist/404.html for any unmatched path on a static deployment.
        notFound: resolve(import.meta.dirname, '404.html'),
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
