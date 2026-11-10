import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/** T-2.1.1 acceptance: lint fails on a deep import and on packages/rules importing anything external. */
const eslint = new ESLint({ cwd: new URL('../../..', import.meta.url).pathname });

async function errors(code: string, filePath: string): Promise<string[]> {
  const [res] = await eslint.lintText(code, { filePath });
  return (res?.messages ?? []).filter((m) => m.severity === 2).map((m) => m.ruleId ?? 'parse');
}

describe('import boundaries', () => {
  it('rejects a deep import from an app', async () => {
    expect(await errors("import { x } from '@payclock/rules/src/engine.ts';\nexport const y = x;\n", 'apps/web/src/x.ts')).toContain('no-restricted-imports');
  });
  it('rejects packages/rules importing a node module or another package', async () => {
    expect(await errors("import { readFileSync } from 'node:fs';\nexport const f = readFileSync;\n", 'packages/rules/src/x.ts')).toContain('no-restricted-imports');
    expect(await errors("import { config } from '@payclock/platform';\nexport const c = config;\n", 'packages/rules/src/x.ts')).toContain('no-restricted-imports');
  });
  it('rejects a clock and floating point inside packages/rules', async () => {
    expect(await errors('export const t = Date.now();\n', 'packages/rules/src/x.ts')).toContain('no-restricted-syntax');
    expect(await errors('export const r = 0.04;\n', 'packages/rules/src/x.ts')).toContain('no-restricted-syntax');
  });
  it('rejects React in packages/platform and pg outside packages/db', async () => {
    expect(await errors("import React from 'react';\nexport const R = React;\n", 'packages/platform/src/x.ts')).toContain('no-restricted-imports');
    expect(await errors("import pg from 'pg';\nexport const P = pg;\n", 'packages/domain/src/x.ts')).toContain('no-restricted-imports');
  });
  it('allows an entry-point import and relative imports inside rules', async () => {
    expect(await errors("import { compute } from '@payclock/rules';\nexport const c = compute;\n", 'apps/web/src/x.ts')).toEqual([]);
    expect(await errors("import { civil } from './civil-date.ts';\nexport const c = civil;\n", 'packages/rules/src/x.ts')).toEqual([]);
  });
});
