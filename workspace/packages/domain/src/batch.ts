import { eq, tables, type TenantDb } from '@payclock/db';
import { computeProject, loadProjectFacts, writeComputation, type ComputedScope } from './recompute.ts';
import { loadRules } from './rules-data.ts';

export type BatchOutcome = { status: 'written'; runId: string } | { status: 'discarded'; reason: string } | { status: 'unchanged' };

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
  hooks: { afterRead?: () => Promise<void> } = {},
): Promise<BatchOutcome> {
  const read = await db.withTenant(tenantId, async (tx) => {
    const facts = await loadProjectFacts(tx, projectId);
    if (!facts) return null;
    const rules = await loadRules(tx);
    return { factVersion: facts.project.factVersion, computed: computeProject(facts, rules), clockIds: rules.clockIds };
  });
  if (!read) return { status: 'discarded', reason: 'project not found for tenant' };
  await hooks.afterRead?.();
  return db.withTenant(tenantId, async (tx) => {
    const locked = await tx.raw.query<{ fact_version: number }>('select fact_version from project where id = $1 for update', [projectId]);
    const now = locked.rows[0]?.fact_version;
    if (now !== read.factVersion) return { status: 'discarded', reason: `fact_version moved from ${read.factVersion} to ${now}` } as const;
    if (await sameAsCurrent(tx, read.computed)) return { status: 'unchanged' } as const;
    const res = await writeComputation(
      tx, null, tenantId,
      { projectId, scopeType: 'project', scopeId: projectId, cause: 'rule_version', causeEventId: null },
      read.computed, read.factVersion, read.clockIds, correlationId,
    );
    return { status: 'written', runId: res.runId } as const;
  });
}

async function sameAsCurrent(tx: Parameters<Parameters<TenantDb['withTenant']>[1]>[0], computed: ComputedScope[]): Promise<boolean> {
  for (const scope of computed) {
    const current = await tx.select().from(tables.deadline).where(eq(tables.deadline.subcontractId, scope.subcontractId));
    const cur = current.filter((d) => d.isCurrent);
    if (cur.length !== scope.results.length) return false;
    for (const r of scope.results) {
      const d = cur.find((x) => x.clockCode === r.clockCode && x.variant === r.variant && x.invoiceId === r.invoiceId);
      if (!d || d.statutoryDate !== r.statutoryDate || d.state !== r.state || d.bound !== r.bound || d.actByDate !== r.actByDate) return false;
    }
  }
  return true;
}
