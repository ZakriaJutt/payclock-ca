import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

/**
 * Linear, timestamped migration history (schema.md section 9). An applied migration is never
 * edited: a changed checksum fails. A new file that sorts before the last applied one fails
 * (out-of-order history, R-10).
 */
export const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url).pathname;
const NAME = /^\d{8}T\d{6}_[a-z0-9_]+\.sql$/;

export interface MigrationFile {
  version: string;
  file: string;
  sha256: string;
  sql: string;
}

export function listMigrations(dir = MIGRATIONS_DIR): MigrationFile[] {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) if (!NAME.test(f)) throw new Error(`migration name not timestamped: ${f}`);
  return files.map((file) => {
    const sql = readFileSync(join(dir, file), 'utf8');
    return { version: file.slice(0, 15), file, sha256: createHash('sha256').update(sql).digest('hex'), sql };
  });
}

export function checkOrder(files: MigrationFile[], applied: { version: string; sha256: string }[]): string[] {
  const problems: string[] = [];
  const byVersion = new Map(files.map((f) => [f.version, f]));
  const versions = files.map((f) => f.version);
  if (new Set(versions).size !== versions.length) problems.push('two migrations share a timestamp');
  for (const a of applied) {
    const f = byVersion.get(a.version);
    if (!f) problems.push(`applied migration ${a.version} is missing from the repository`);
    else if (f.sha256 !== a.sha256) problems.push(`applied migration ${f.file} was edited (checksum changed)`);
  }
  const last = applied.map((a) => a.version).sort().at(-1);
  if (last) {
    for (const f of files) {
      if (f.version < last && !applied.some((a) => a.version === f.version)) {
        problems.push(`migration ${f.file} sorts before the last applied (${last}): rebase it to a later timestamp`);
      }
    }
  }
  return problems;
}

export async function migrate(connectionString: string, log: (m: string) => void = () => undefined): Promise<string[]> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(`create table if not exists schema_migrations (
      version text primary key, file text not null, sha256 text not null, applied_at timestamptz not null default now())`);
    const { rows } = await client.query<{ version: string; sha256: string }>('select version, sha256 from schema_migrations');
    const files = listMigrations();
    const problems = checkOrder(files, rows);
    if (problems.length) throw new Error(`migration check failed:\n- ${problems.join('\n- ')}`);
    const applied: string[] = [];
    for (const f of files) {
      if (rows.some((r) => r.version === f.version)) continue;
      await client.query('begin');
      try {
        await client.query("set local lock_timeout = '5s'");
        await client.query(f.sql);
        await client.query('insert into schema_migrations (version, file, sha256) values ($1, $2, $3)', [f.version, f.file, f.sha256]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw new Error(`migration ${f.file} failed: ${(err as Error).message}`);
      }
      log(`applied ${f.file}`);
      applied.push(f.file);
    }
    return applied;
  } finally {
    await client.end();
  }
}
