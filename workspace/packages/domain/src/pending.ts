import type { TenantDb, Tx } from '@payclock/db';
import { recomputeBatch } from './batch.ts';

/**
 * Durable recompute queue (B1-005). Rows are written in the SAME transaction as the rule or
 * holiday change; the worker (and every rules sync) drains them, retrying until each is done.
 * Draining is idempotent: a project whose stored dates already match the rules in force is
 * marked done without a write.
 */
export async function enqueueAllProjects(tx: Tx, cause: 'rule_version' | 'holiday_table'): Promise<number> {
  const r = await tx.raw.query(
    `insert into recompute_pending (tenant_id, project_id, cause, rules_gen, holiday_gen)
     select p.tenant_id, p.id, $1, g.rules_gen, g.holiday_gen from project p cross join rules_generation g where g.jurisdiction = 'ON'
     on conflict (project_id) where done_at is null
     do update set cause = excluded.cause, rules_gen = excluded.rules_gen, holiday_gen = excluded.holiday_gen`,
    [cause],
  );
  return r.rowCount ?? 0;
}

/** Queue every project with a current deadline computed under an older generation (database
 * function, so it also works from the worker's tenant-scoped role). */
export async function enqueueStale(tx: Tx): Promise<number> {
  const r = await tx.raw.query<{ n: number }>('select enqueue_stale_recomputes() as n');
  return r.rows[0]?.n ?? 0;
}

export interface DrainReport {
  done: number;
  failed: Array<{ projectId: string; error: string }>;
  remaining: number;
}

/** Process open rows once each (oldest first). Errors are recorded on the row, never thrown. */
export async function drainPending(app: TenantDb, correlationId: string, limit = 500): Promise<DrainReport> {
  const out: DrainReport = { done: 0, failed: [], remaining: 0 };
  let rows: Array<{ id: string; tenant_id: string; project_id: string; cause: 'rule_version' | 'holiday_table'; rules_gen: number; holiday_gen: number }>;
  try {
    rows = (await app.pool.query(
      `update recompute_pending set attempts = attempts + 1
       where id in (select id from recompute_pending where done_at is null order by created_at limit $1 for update skip locked)
       returning id, tenant_id, project_id, cause, rules_gen, holiday_gen`,
      [limit],
    )).rows;
  } catch (e) {
    return { done: 0, failed: [{ projectId: '*', error: (e as Error).message.slice(0, 200) }], remaining: -1 };
  }
  for (const row of rows) {
    try {
      let result = await recomputeBatch(app, row.tenant_id, row.project_id, correlationId, { cause: row.cause === 'holiday_table' ? 'holiday_table' : 'rule_version' });
      for (let i = 0; i < 2 && result.status === 'discarded' && !result.reason.startsWith('project not found'); i++) {
        result = await recomputeBatch(app, row.tenant_id, row.project_id, correlationId, { cause: 'rule_version' });
      }
      const covers = result.gens && result.gens.rulesGen >= row.rules_gen && result.gens.holidayGen >= row.holiday_gen;
      if ((result.status === 'written' || result.status === 'unchanged') && covers) {
        await app.pool.query('update recompute_pending set done_at = now(), last_error = null where id = $1', [row.id]);
        out.done++;
      } else {
        const why = result.status === 'discarded' ? result.reason : 'rules changed again; will retry';
        await app.pool.query('update recompute_pending set last_error = $2 where id = $1', [row.id, why]);
        out.failed.push({ projectId: row.project_id, error: why });
      }
    } catch (e) {
      const msg = (e as Error).message.slice(0, 200);
      await app.pool.query('update recompute_pending set last_error = $2 where id = $1', [row.id, msg]).catch(() => undefined);
      out.failed.push({ projectId: row.project_id, error: msg });
    }
  }
  out.remaining = Number((await app.pool.query('select count(*) from recompute_pending where done_at is null')).rows[0].count);
  return out;
}
