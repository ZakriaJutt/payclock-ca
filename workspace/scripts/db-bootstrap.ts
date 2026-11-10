/**
 * One-time local setup. Creates the non-superuser runtime role `payclock_app`
 * (NOSUPERUSER NOBYPASSRLS) if absent and writes git-ignored `.env.local` and `.env.test`.
 * Touches only PayClock's role and its two existing databases.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { TenantDb } from '@payclock/db';

const ROLE = 'payclock_app';
const root = new URL('..', import.meta.url).pathname;
const SUPER = process.env.PAYCLOCK_SUPERUSER ?? 'zakria';

function existingPassword(): string | null {
  const p = `${root}.env.local`;
  if (!existsSync(p)) return null;
  const m = /DATABASE_URL=postgres:\/\/payclock_app:([^@]+)@/.exec(readFileSync(p, 'utf8'));
  return m ? decodeURIComponent(m[1]!) : null;
}

const password = existingPassword() ?? randomBytes(18).toString('base64url');
const admin = new TenantDb(`postgres://${SUPER}@localhost:5432/payclock_dev`, 1);
const exists = await admin.pool.query('select 1 from pg_roles where rolname = $1', [ROLE]);
const lit = `'${password.replace(/'/g, "''")}'`;
if (exists.rowCount === 0) {
  await admin.pool.query(`create role ${ROLE} login nosuperuser nobypassrls nocreatedb nocreaterole noinherit password ${lit}`);
  console.log(`created role ${ROLE}`);
} else {
  await admin.pool.query(`alter role ${ROLE} login nosuperuser nobypassrls nocreatedb nocreaterole noinherit password ${lit}`);
  console.log(`role ${ROLE} exists; attributes re-asserted`);
}
for (const db of ['payclock_dev', 'payclock_test']) await admin.pool.query(`grant connect on database ${db} to ${ROLE}`);
await admin.close();

const env = (db: string, appEnv: string) =>
  [
    `APP_ENV=${appEnv}`,
    `DATABASE_URL=postgres://${ROLE}:${encodeURIComponent(password)}@localhost:5432/${db}`,
    `MIGRATOR_DATABASE_URL=postgres://${SUPER}@localhost:5432/${db}`,
    'API_PORT=8104',
    'APP_PUBLIC_URL=http://localhost:3104',
    'AUTH_MODE=fake',
    'LOG_LEVEL=info',
    '',
  ].join('\n');
writeFileSync(`${root}.env.local`, env('payclock_dev', 'local'), { mode: 0o600 });
writeFileSync(`${root}.env.test`, env('payclock_test', 'test'), { mode: 0o600 });
console.log('wrote .env.local and .env.test (git-ignored)');
