import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Import boundaries (T-2.1.1, TRD section 5). ESLint replaces rule options per matching block, so
 * each area gets exactly one `no-restricted-imports` definition:
 *  - everywhere: packages are imported by entry point only (no `@payclock/x/...` deep imports);
 *  - outside packages/db: no direct Postgres driver;
 *  - packages/platform: no React or Next;
 *  - packages/rules/src: only its own relative files; no clock, network, environment or floats.
 */
const deepImport = { group: ['@payclock/*/*'], message: 'Import packages by their entry point only (AGENTS.md section 5).' };
const noPg = { name: 'pg', message: 'Only packages/db talks to Postgres.' };
const noPgBoss = { name: 'pg-boss', message: 'Queue access lives once in packages/platform.' };

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-imports': ['error', { patterns: [deepImport], paths: [noPg, noPgBoss] }],
    },
  },
  {
    files: ['packages/db/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [deepImport], paths: [noPgBoss] }] },
  },
  {
    files: ['packages/platform/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [deepImport, { group: ['react', 'react-dom', 'next', 'next/*'], message: 'packages/platform has no React or Next imports.' }],
          paths: [noPg],
        },
      ],
    },
  },
  {
    files: ['packages/rules/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '^(?!\\.\\.?/)', message: 'packages/rules is pure: it may import only its own files.' }] },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'No network in packages/rules.' },
        { name: 'process', message: 'No environment access in packages/rules.' },
        { name: 'setTimeout', message: 'No timers in packages/rules.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'No clock in packages/rules: pass the date in.' },
        { selector: "MemberExpression[object.name='Date'][property.name='now']", message: 'No clock in packages/rules.' },
        { selector: 'Literal[raw=/^\\d+\\.\\d+$/]', message: 'No floating point in packages/rules (AD-11).' },
      ],
    },
  },
);
