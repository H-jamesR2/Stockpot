import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    // Test files share one database and reseed it, so run them one at a time
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 120_000,
  },
});
