/**
 * `make dev`: one local start command (T-2.1.2), services run directly (no Docker on this machine).
 * Checks Postgres, applies migrations, loads draft rules and the synthetic seed, starts the API
 * (API_PORT, 8104) and the worker, and prints "ready" only when /readyz reports every dependency
 * healthy. Any unhealthy dependency or early exit stops with a non-zero code naming it.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { TenantDb } from '@payclock/db';
import { loadConfig } from '@payclock/platform';
import { loadEnvFile } from './env.ts';

const root = new URL('..', import.meta.url).pathname;
loadEnvFile('.env.local');
const config = loadConfig();
const fail = (what: string, detail = ''): never => {
  console.error(`NOT READY: ${what} unhealthy ${detail}`.trim());
  process.exit(1);
};

const probe = new TenantDb(config.DATABASE_URL, 1);
if (!(await probe.ping())) fail('database', `(${new URL(config.DATABASE_URL).host})`);
await probe.close();

const tsx = `${root}node_modules/.bin/tsx`;
for (const script of ['packages/db/src/migrate-cli.ts', 'scripts/seed-synthetic.ts']) {
  const r = spawnSync(tsx, [script], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) fail(script);
}
const env = { ...process.env };

const children: Array<[string, ChildProcess]> = [];
let workerReady = false;
for (const [name, entry] of [['web', 'apps/web/src/server.ts'], ['worker', 'apps/worker/src/main.ts']] as const) {
  const child = spawn(tsx, [entry], { cwd: root, env, stdio: ['ignore', 'pipe', 'inherit'] });
  child.stdout!.on('data', (d: Buffer) => {
    const text = d.toString();
    if (name === 'worker' && text.includes('worker.ready')) workerReady = true;
    process.stdout.write(text.split('\n').filter(Boolean).map((l) => `[${name}] ${l}\n`).join(''));
  });
  child.on('exit', (code) => fail(name, `(exited with ${code})`));
  children.push([name, child]);
}
const shutdown = () => {
  for (const [, c] of children) c.removeAllListeners('exit').kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const deadline = Date.now() + 30_000;
for (;;) {
  try {
    const res = await fetch(`http://127.0.0.1:${config.API_PORT}/readyz`);
    const body = (await res.json()) as { checks: Record<string, boolean | null> };
    if (res.ok && workerReady) {
      console.log(`ready: api http://127.0.0.1:${config.API_PORT} (checks ${JSON.stringify(body.checks)}), worker running`);
      break;
    }
    if (!res.ok && Date.now() > deadline) fail(Object.entries(body.checks).filter(([, v]) => v === false).map(([k]) => k).join(', ') || 'api');
  } catch {
    if (Date.now() > deadline) fail('api', '(no response on /readyz)');
  }
  if (Date.now() > deadline) fail(workerReady ? 'api' : 'worker');
  await new Promise((r) => setTimeout(r, 300));
}
if (process.argv.includes('--check')) shutdown();
