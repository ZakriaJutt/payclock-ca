import { eq, tables, type TenantDb } from '@payclock/db';
import { computeProject, loadProjectFacts, ruleClockIdFor, writeComputation, type ComputedScope } from './recompute.ts';
import { currentGens, loadRules, type Gens } from './rules-data.ts';

export type BatchOutcome = ({ status: 'written'; runId: string } | { status: 'discarded'; reason: string } | { status: 'unchanged' }) & { gens?: Gens };

/**
 * `recompute.batch` (TRD 8.4): read facts at fact_version v, compute outside the write, then commit
 * only if the project's fact_version is still v (compare-and-set, R-01). Otherwise the result is
 * discarded and the caller requeues. A delivery whose inputs equal the current deadlines' run is a
 * no-op, so a duplicate delivery changes nothing.
 */
export async function recomputeBatch(
  db: TenantDb,
  tenantId: string,
  projectId: string,
  correlationId: string,
  hooks: { afterRead?: () => Promise<void>; cause?: 'rule_version' | 'holiday_table' } = {},
): Promise<BatchOutcome> {
  const read = await db.withTenant(tenantId, async (tx) => {
    const facts = await loadProjectFacts(tx, projectId);
    if (!facts) return null;
    const rules = await loadRules(tx);
    return { factVersion: facts.project.factVersion, computed: computeProject(facts, rules), clockIds: rules.clockIds, gens: rules.gens };
  });
  if (!read) return { status: 'discarded', reason: 'project not found for tenant' };
  await hooks.afterRead?.();
  return db.withTenant(tenantId, async (tx) => {
    const locked = await tx.raw.query<{ fact_version: number }>('select fact_version from project where id = $1 for update', [projectId]);
    const now = locked.rows[0]?.fact_version;
    if (now !== read.factVersion) return { status: 'discarded', reason: `fact_version moved from ${read.factVersion} to ${now}` } as const;
    const g = await currentGens(tx);
    if (g.rulesGen !== read.gens.rulesGen || g.holidayGen !== read.gens.holidayGen) return { status: 'discarded', reason: 'rules generation moved during recompute' } as const;
    if (await sameAsCurrent(tx, read.computed, read.clockIds, read.gens)) return { status: 'unchanged', gens: read.gens } as const;
    const res = await writeComputation(
      tx, null, tenantId,
      { projectId, scopeType: 'project', scopeId: projectId, cause: hooks.cause ?? 'rule_version', causeEventId: null },
      read.computed, read.factVersion, read.clockIds, correlationId, read.gens,
    );
    return { status: 'written', runId: res.runId, gens: read.gens } as const;
  });
}

/** Same dates AND the same rule rows: a deadline on a retired rule revision is never "unchanged". */
async function sameAsCurrent(tx: Parameters<Parameters<TenantDb['withTenant']>[1]>[0], computed: ComputedScope[], clockIds: Map<string, string>, gens: Gens): Promise<boolean> {
  for (const scope of computed) {
    const current = await tx.select().from(tables.deadline).where(eq(tables.deadline.subcontractId, scope.subcontractId));
    const cur = current.filter((d) => d.isCurrent);
    // A deadline computed under an older rule or holiday generation is never "unchanged".
    const runIds = [...new Set(cur.map((d) => d.computationRunId))];
    if (runIds.length) {
      const runs = await tx.raw.query<{ rules_gen: number; holiday_gen: number }>('select rules_gen, holiday_gen from computation_run where id = any($1)', [runIds]);
      if (runs.rows.some((r) => r.rules_gen !== gens.rulesGen || r.holiday_gen !== gens.holidayGen)) return false;
    }
    if (cur.length !== scope.results.length) return false;
    for (const r of scope.results) {
      const d = cur.find((x) => x.clockCode === r.clockCode && x.variant === r.variant && x.invoiceId === r.invoiceId);
      if (!d || d.statutoryDate !== r.statutoryDate || d.state !== r.state || d.bound !== r.bound || d.actByDate !== r.actByDate) return false;
      if (d.ruleClockId !== ruleClockIdFor(r, clockIds)) return false;
    }
  }
  return true;
}
