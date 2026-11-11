import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['packages/rules/test/**/*.test.ts', 'packages/platform/test/**/*.test.ts', 'packages/domain/test/unit/**/*.test.ts', 'apps/web/test/unit/**/*.test.ts'] } },
      {
        test: {
          name: 'integration',
          globalSetup: ['tests/global-setup.ts'],
          include: ['tests/**/*.test.ts', 'packages/db/test/**/*.test.ts', 'packages/domain/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
          exclude: ['**/node_modules/**', 'packages/domain/test/unit/**', 'apps/web/test/unit/**'],
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
