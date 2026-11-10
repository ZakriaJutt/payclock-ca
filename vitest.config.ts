import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['packages/rules/test/**/*.test.ts', 'packages/platform/test/**/*.test.ts'] } },
      {
        test: {
          name: 'integration',
          include: ['packages/db/test/**/*.test.ts', 'packages/domain/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
