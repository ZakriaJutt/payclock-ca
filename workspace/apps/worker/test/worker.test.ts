import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createLogger, MissingTenantError } from '@payclock/platform';
import { recomputeBatchHandler } from '../src/handlers.ts';
import { appDb } from '../../../tests/helpers.ts';

const db = appDb();
afterAll(() => db.close());
const root = resolve(new URL('../../..', import.meta.url).pathname);

/** Static import graph from a module, resolving @payclock/* to package entry points. */
function importGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^\s*(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
      const spec = m[1]!;
      if (spec.startsWith('.')) visit(resolve(dirname(file), spec));
      else if (spec.startsWith('@payclock/')) visit(resolve(root, 'packages', spec.slice('@payclock/'.length), 'src/index.ts'));
      else seen.add(`pkg:${spec}`);
    }
  };
  visit(entry);
  return seen;
}

describe('worker (IT-01 job part, IT-14 partial)', () => {
  it('a job without a tenant fails without reading data', async () => {
    const handler = recomputeBatchHandler(db, createLogger({ service: 't', sink: () => undefined }));
    await expect(handler({ data: { project_id: '00000000-0000-4000-8000-000000000000' } })).rejects.toBeInstanceOf(MissingTenantError);
  });

  it('the worker entry point imports no web-framework or apps/web module', () => {
    const graph = [...importGraph(resolve(root, 'apps/worker/src/main.ts'))];
    expect(graph.some((f) => f.includes('/apps/web/'))).toBe(false);
    expect(graph.filter((f) => /^pkg:(next|react|react-dom|express|fastify)(\/|$)/.test(f))).toEqual([]);
    expect(graph.some((f) => f.endsWith('packages/domain/src/index.ts'))).toBe(true);
  });

  it('the worker starts alone and reports ready', async () => {
    const child = spawn(resolve(root, 'node_modules/.bin/tsx'), ['apps/worker/src/main.ts'], { cwd: root, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const ready = await new Promise<boolean>((res) => {
      const timer = setTimeout(() => res(false), 20_000);
      child.stdout.on('data', (d: Buffer) => {
        if (d.toString().includes('worker.ready')) {
          clearTimeout(timer);
          res(true);
        }
      });
      child.on('exit', () => res(false));
    });
    child.kill('SIGTERM');
    expect(ready).toBe(true);
  });
});

describe('worker drain loop (B1-005)', () => {
  it('starts, passes once without error, and stops', async () => {
    const { startDrainLoop } = await import('../src/drain.ts');
    const lines: string[] = [];
    const stop = startDrainLoop(db, createLogger({ service: 't', sink: (l) => lines.push(l) }), 60_000);
    await new Promise((r) => setTimeout(r, 500));
    stop();
    expect(lines.some((l) => l.includes('recompute.pending.error'))).toBe(false);
  });
});
