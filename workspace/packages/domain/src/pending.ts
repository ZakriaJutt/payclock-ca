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

export interface DrainHooks {
  /** Called after each claimed row has been recorded (test seam for the crash-resume test). */
  afterRow?: (projectId: string, index: number) => Promise<void>;
  /** Called between a row's recompute read and its write (test seam: abort mid-batch). */
  afterRead?: (projectId: string, index: number) => Promise<void>;
}

/**
 * Process open rows once each (oldest first). Errors are recorded on the row, never thrown.
 * The table is under row-level security: rows are claimed through `claim_recompute_pending`
 * (identifiers only) and each outcome is written inside that row's own tenant transaction. A row
 * is closed only if its generation is still the one this recompute covered, so a change landing
 * between recompute and close leaves the row open.
 */
export async function drainPending(app: TenantDb, correlationId: string, limit = 500, hooks: DrainHooks = {}): Promise<DrainReport> {
  const out: DrainReport = { done: 0, failed: [], remaining: 0 };
  let rows: Array<{ id: string; tenant_id: string; project_id: string; cause: 'rule_version' | 'holiday_table'; rules_gen: number; holiday_gen: number }>;
  try {
    rows = (await app.pool.query('select * from claim_recompute_pending($1)', [limit])).rows;
  } catch (e) {
    return { done: 0, failed: [{ projectId: '*', error: (e as Error).message.slice(0, 200) }], remaining: -1 };
  }
  const note = (row: (typeof rows)[number], msg: string) =>
    app.withTenant(row.tenant_id, (tx) => tx.raw.query('update recompute_pending set last_error = $2 where id = $1', [row.id, msg]));
  let i = 0;
  for (const row of rows) {
    try {
      const idx = i;
      let result = await recomputeBatch(app, row.tenant_id, row.project_id, correlationId, {
        cause: row.cause === 'holiday_table' ? 'holiday_table' : 'rule_version',
        afterRead: hooks.afterRead ? () => hooks.afterRead!(row.project_id, idx) : undefined,
      });
      for (let k = 0; k < 2 && result.status === 'discarded' && !result.reason.startsWith('project not found'); k++) {
        result = await recomputeBatch(app, row.tenant_id, row.project_id, correlationId, { cause: 'rule_version' });
      }
      const gens = result.gens;
      const covers = gens && gens.rulesGen >= row.rules_gen && gens.holidayGen >= row.holiday_gen;
      if ((result.status === 'written' || result.status === 'unchanged') && covers) {
        const closed = await app.withTenant(row.tenant_id, (tx) =>
          tx.raw.query(
            'update recompute_pending set done_at = now(), last_error = null where id = $1 and done_at is null and rules_gen <= $2 and holiday_gen <= $3',
            [row.id, gens.rulesGen, gens.holidayGen],
          ));
        if (closed.rowCount) out.done++;
        else {
          await note(row, 'rules changed again; will retry');
          out.failed.push({ projectId: row.project_id, error: 'rules changed again; will retry' });
        }
      } else {
        const why = result.status === 'discarded' ? result.reason : 'rules changed again; will retry';
        await note(row, why);
        out.failed.push({ projectId: row.project_id, error: why });
      }
    } catch (e) {
      const msg = (e as Error).message.slice(0, 200);
      await note(row, msg).catch(() => undefined);
      out.failed.push({ projectId: row.project_id, error: msg });
    }
    await hooks.afterRow?.(row.project_id, i);
    i++;
  }
  out.remaining = Number((await app.pool.query('select open_recompute_pending_count() as n')).rows[0].n);
  return out;
}
