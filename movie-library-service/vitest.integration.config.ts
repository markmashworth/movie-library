import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/integration/**/*.test.ts'],
    // Give each integration test suite enough time to spin up a real server.
    testTimeout: 30_000,
    // Run integration suites sequentially so they don't compete for port 8080.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
