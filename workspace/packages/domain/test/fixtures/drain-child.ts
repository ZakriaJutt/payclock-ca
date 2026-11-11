/**
 * Child process for the crash-resume test: a worker drain that stops at a chosen point and waits
 * to be killed (SIGKILL by the parent test). Usage: `tsx drain-child.ts <mid-read|after-row> <n>`.
 * `mid-read`: stop inside row n's recompute, after its read and before its write.
 * `after-row`: stop after row n's outcome has been recorded, with later rows claimed but untouched.
 */
import { TenantDb } from '@payclock/db';
import { drainPending } from '@payclock/domain';
import { loadEnvFile } from '../../../../scripts/env.ts';

loadEnvFile('.env.test');
const [mode, nArg] = process.argv.slice(2);
const n = Number(nArg);
const db = new TenantDb(process.env.DATABASE_URL!, 2);
const hang = (where: string) => {
  process.stdout.write(`PAUSED ${where}\n`);
  return new Promise<void>(() => undefined);
};
const report = await drainPending(db, '00000000-0000-4000-8000-0000000000c1', 500, {
  afterRead: mode === 'mid-read' ? async (_p, i) => { if (i === n) await hang(`mid-read ${i}`); } : undefined,
  afterRow: mode === 'after-row' ? async (_p, i) => { if (i === n) await hang(`after-row ${i}`); } : undefined,
});
process.stdout.write(`FINISHED ${JSON.stringify(report)}\n`);
await db.close();
