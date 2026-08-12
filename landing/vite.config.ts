import { defineConfig } from 'vite';

// The landing site ships as a plain static bundle, so `base: './'` keeps every
// asset URL relative and the built output works from a subpath as well as root.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
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
