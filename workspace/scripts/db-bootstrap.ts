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

function existing(name: string): string | null {
  const p = `${root}.env.local`;
  if (!existsSync(p)) return null;
  const m = new RegExp(`^${name}=(.*)$`, 'm').exec(readFileSync(p, 'utf8'));
  return m ? m[1]!.trim() : null;
}
function existingPassword(): string | null {
  const url = existing('DATABASE_URL');
  const m = url ? /^postgres:\/\/payclock_app:([^@]+)@/.exec(url) : null;
  return m ? decodeURIComponent(m[1]!) : null;
}

const password = existingPassword() ?? randomBytes(18).toString('base64url');
const authKey = existing('AUTH_SECRET_KEY') ?? randomBytes(32).toString('base64');
// MinIO credentials are never in the repository: kept from .env.local or taken from the shell once.
const s3Key = existing('S3_ACCESS_KEY_ID') ?? process.env.S3_ACCESS_KEY_ID ?? '';
const s3Secret = existing('S3_SECRET_ACCESS_KEY') ?? process.env.S3_SECRET_ACCESS_KEY ?? '';
if (!s3Key || !s3Secret) console.warn('S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY not set: export the local MinIO values and run db:bootstrap again');
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

// Local-only values (Mailpit, MinIO); credentials come from the existing file or the shell.
const env = (db: string, appEnv: string) =>
  [
    `APP_ENV=${appEnv}`,
    `DATABASE_URL=postgres://${ROLE}:${encodeURIComponent(password)}@localhost:5432/${db}`,
    `MIGRATOR_DATABASE_URL=postgres://${SUPER}@localhost:5432/${db}`,
    'API_PORT=8104',
    'APP_PUBLIC_URL=http://localhost:3104',
    'AUTH_MODE=local',
    `AUTH_SECRET_KEY=${authKey}`,
    `PASSWORD_SCRYPT_LOG2N=${appEnv === 'test' ? 14 : 15}`,
    'SMTP_HOST=127.0.0.1',
    'SMTP_PORT=1025',
    'MAIL_FROM=PayClock <no-reply@payclock.localhost>',
    'MAILPIT_API_URL=http://127.0.0.1:8025/api/v1',
    'S3_ENDPOINT=http://127.0.0.1:9000',
    'S3_REGION=us-east-1',
    'S3_BUCKET=payclock-dev',
    `S3_ACCESS_KEY_ID=${s3Key}`,
    `S3_SECRET_ACCESS_KEY=${s3Secret}`,
    'S3_FORCE_PATH_STYLE=true',
    'FILE_SCANNER=local-signature',
    'LOG_LEVEL=info',
    '',
  ].join('\n');
writeFileSync(`${root}.env.local`, env('payclock_dev', 'local'), { mode: 0o600 });
writeFileSync(`${root}.env.test`, env('payclock_test', 'test'), { mode: 0o600 });
console.log('wrote .env.local and .env.test (git-ignored)');
