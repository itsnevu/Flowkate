import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const srcDir = resolve(__dirname, 'src');

/**
 * Separate from `vite.config.mts` on purpose: that one runs through `withPageConfig`, which
 * pulls in the HMR plugin and a build-only output target that tests have no use for. The two
 * things tests do need from it are mirrored here — the `@src` alias, and JSX compiled with the
 * automatic runtime so `.tsx` sources import without a React namespace in scope.
 *
 * Environment stays the default `node`: everything covered here is pure logic or a component
 * called as a plain function, so no DOM implementation is required.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@src': srcDir,
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
});
