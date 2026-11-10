import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import pg from 'pg';
import * as schema from './schema.ts';

/**
 * ORM parity check (schema.md section 9, R-08): compares the Drizzle model with a database built
 * from the migrations. Compared: tables, columns (type, nullability, default present), primary
 * keys, unique constraints, foreign keys, check constraints and indexes by name, row-level
 * security enabled and forced, and policy names. Expressions are not compared textually.
 */
const norm = (t: string) => t.replace(/\s+/g, '').toLowerCase();

export async function ormParity(connectionString: string): Promise<string[]> {
  const tables = (Object.values(schema) as unknown[]).filter((v): v is PgTable => v instanceof PgTable);
  const client = new pg.Client({ connectionString });
  await client.connect();
  const diffs: string[] = [];
  try {
    const dbTables = (
      await client.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        `select relname, relrowsecurity, relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' and relname <> 'schema_migrations'`,
      )
    ).rows;
    const ormNames = new Set(tables.map((t) => getTableConfig(t).name));
    for (const t of dbTables) if (!ormNames.has(t.relname)) diffs.push(`table ${t.relname}: in database, not in ORM`);

    for (const table of tables) {
      const cfg = getTableConfig(table);
      const name = cfg.name;
      const dbt = dbTables.find((t) => t.relname === name);
      if (!dbt) {
        diffs.push(`table ${name}: in ORM, not in database`);
        continue;
      }
      const cols = (
        await client.query<{ attname: string; type: string; notnull: boolean; hasdef: boolean; identity: string }>(
          `select a.attname, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as notnull, a.atthasdef as hasdef, a.attidentity as identity
           from pg_attribute a where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped`,
          [name],
        )
      ).rows;
      for (const c of cfg.columns) {
        const d = cols.find((x) => x.attname === c.name);
        if (!d) {
          diffs.push(`${name}.${c.name}: in ORM, not in database`);
          continue;
        }
        if (norm(c.getSQLType()) !== norm(d.type)) diffs.push(`${name}.${c.name}: type ORM ${c.getSQLType()} vs database ${d.type}`);
        if (c.notNull !== d.notnull) diffs.push(`${name}.${c.name}: not null ORM ${c.notNull} vs database ${d.notnull}`);
        const ormDefault = c.hasDefault;
        const dbDefault = d.hasdef || d.identity !== '';
        if (Boolean(ormDefault) !== dbDefault && !(c.generatedIdentity && dbDefault)) {
          diffs.push(`${name}.${c.name}: default ORM ${Boolean(ormDefault)} vs database ${dbDefault}`);
        }
      }
      for (const d of cols) if (!cfg.columns.some((c) => c.name === d.attname)) diffs.push(`${name}.${d.attname}: in database, not in ORM`);

      const cons = (
        await client.query<{ conname: string; contype: string }>(`select conname, contype from pg_constraint where conrelid = $1::regclass`, [name])
      ).rows;
      const want = new Map<string, string>();
      for (const u of cfg.uniqueConstraints) want.set(u.getName() ?? '', 'u');
      for (const f of cfg.foreignKeys) want.set(f.getName(), 'f');
      for (const k of cfg.checks) want.set(k.name ?? '', 'c');
      for (const p of cfg.primaryKeys) want.set(p.getName(), 'p');
      const hasColumnPk = cfg.columns.some((c) => c.primary);
      for (const [n, type] of want) {
        if (!cons.some((c) => c.conname === n && c.contype === type)) diffs.push(`${name}: constraint ${n} (${type}) in ORM, not in database`);
      }
      for (const c of cons) {
        if (c.contype === 'p' && hasColumnPk) continue;
        if (!want.has(c.conname)) diffs.push(`${name}: constraint ${c.conname} (${c.contype}) in database, not in ORM`);
      }

      const idx = (
        await client.query<{ indexname: string }>(
          `select i.relname as indexname from pg_index x join pg_class i on i.oid = x.indexrelid
           where x.indrelid = $1::regclass and not exists (select 1 from pg_constraint k where k.conindid = x.indexrelid)`,
          [name],
        )
      ).rows.map((r) => r.indexname);
      const ormIdx = cfg.indexes.map((i) => i.config.name!);
      for (const n of ormIdx) if (!idx.includes(n)) diffs.push(`${name}: index ${n} in ORM, not in database`);
      for (const n of idx) if (!ormIdx.includes(n)) diffs.push(`${name}: index ${n} in database, not in ORM`);

      if (cfg.enableRLS !== dbt.relrowsecurity) diffs.push(`${name}: RLS enabled ORM ${cfg.enableRLS} vs database ${dbt.relrowsecurity}`);
      if (cfg.enableRLS && !dbt.relforcerowsecurity) diffs.push(`${name}: RLS enabled but not forced in database`);
      const pols = (await client.query<{ polname: string }>(`select polname from pg_policy where polrelid = $1::regclass`, [name])).rows.map((r) => r.polname);
      const ormPols = cfg.policies.map((p) => p.name);
      for (const n of ormPols) if (!pols.includes(n)) diffs.push(`${name}: policy ${n} in ORM, not in database`);
      for (const n of pols) if (!ormPols.includes(n)) diffs.push(`${name}: policy ${n} in database, not in ORM`);
    }
  } finally {
    await client.end();
  }
  return diffs;
}
