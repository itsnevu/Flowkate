import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // the storage layer reads globalThis.chrome at import time, so the fake must be installed first
    setupFiles: ['./vitest.setup.ts'],
  },
});
