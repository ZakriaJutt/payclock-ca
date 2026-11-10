import { and, eq, inArray, isNull, tables, type Tx } from '@payclock/db';
import { torontoToday } from '@payclock/platform';
import {
  addDays, civil, compute, ENGINE_VERSION, sha256Hex, RIGHTS_CLOCK_CODES,
  type CivilDate, type ClockResult, type EventFact, type EventType,
} from '@payclock/rules';
import type { Actor } from './actor.ts';
import { audit } from './audit.ts';
import { loadRules } from './rules-data.ts';

type Cause = 'new_event' | 'correction' | 'rule_version' | 'holiday_table' | 'import';

export interface RecomputeRequest {
  projectId: string;
  scopeType: 'project' | 'subcontract' | 'invoice';
  scopeId: string;
  cause: Cause;
  causeEventId: string | null;
  /** Which subcontracts to recompute; all of the project when omitted. */
  subcontractIds?: string[];
}

export interface RecomputeResult {
  runId: string;
  factVersion: number;
  changed: number;
}

type DbEvent = typeof tables.event.$inferSelect;

export function toFact(e: DbEvent): EventFact {
  return {
    id: e.id,
    type: e.eventType as EventType,
    invoiceId: e.scopeType === 'invoice' ? e.scopeId : null,
    seriesKey: e.seriesKey,
    occurredOn: e.occurredOn ? civil(e.occurredOn) : null,
    receivedOn: e.receivedOn ? civil(e.receivedOn) : null,
    certainty: e.certainty,
    amountCents: e.amountCents,
    noticeForm: e.noticeForm,
  };
}

/** Everything the engine needs for one project, read inside the caller's transaction. */
export async function loadProjectFacts(tx: Tx, projectId: string) {
  const [project] = await tx.select().from(tables.project).where(eq(tables.project.id, projectId));
  if (!project) return null;
  const subcontracts = await tx.select().from(tables.subcontract).where(eq(tables.subcontract.projectId, projectId));
  const subIds = subcontracts.map((s) => s.id);
  const invoices = subIds.length ? await tx.select().from(tables.invoice).where(inArray(tables.invoice.subcontractId, subIds)) : [];
  const scopeIds = [projectId, ...subIds, ...invoices.map((i) => i.id)];
  const events = await tx
    .select()
    .from(tables.event)
    .where(and(inArray(tables.event.scopeId, scopeIds), isNull(tables.event.supersededAt)));
  return { project, subcontracts, invoices, events };
}

export type ProjectFacts = NonNullable<Awaited<ReturnType<typeof loadProjectFacts>>>;

export interface ComputedScope {
  subcontractId: string;
  inputsHash: string;
  results: ClockResult[];
}

/** Pure part: run the engine for each subcontract of the project. */
export function computeProject(facts: ProjectFacts, rules: Awaited<ReturnType<typeof loadRules>>, subcontractIds?: string[]): ComputedScope[] {
  const out: ComputedScope[] = [];
  for (const sc of facts.subcontracts) {
    if (subcontractIds && !subcontractIds.includes(sc.id)) continue;
    const invoices = facts.invoices.filter((i) => i.subcontractId === sc.id);
    const invoiceIds = new Set(invoices.map((i) => i.id));
    const events = facts.events
      .filter((e) => e.scopeType === 'project' || (e.scopeType === 'subcontract' && e.scopeId === sc.id) || (e.scopeType === 'invoice' && invoiceIds.has(e.scopeId)))
      .map(toFact);
    const res = compute({
      project: {
        premisesLeased: facts.project.premisesLeased,
        leaseFirstEnteredOn: facts.project.leaseFirstEnteredOn ? civil(facts.project.leaseFirstEnteredOn) : null,
        municipalInterest: facts.project.municipalInterest,
      },
      subcontract: { id: sc.id, hasSubSubs: sc.hasSubSubs },
      invoices: invoices.map((i) => ({ id: i.id, amountCents: i.amountCents, holdbackCents: i.holdbackCents })),
      events,
      ruleVersions: rules.versions,
      holidays: rules.holidays,
    });
    out.push({ subcontractId: sc.id, inputsHash: res.inputsHash, results: res.results });
  }
  return out;
}

const key = (subcontractId: string, invoiceId: string | null, clock: string, variant: string) => `${subcontractId}|${invoiceId ?? ''}|${clock}|${variant}`;

/** Reminder series (MH-07): rights clocks 14/7/3/0 days before act-by and 5/2/0 before the last
 * day; payment due date and 3 days after. Only future send days are scheduled. */
function reminderPlan(r: ClockResult): Array<{ kind: typeof tables.reminder.$inferInsert.kind; sendOn: CivilDate }> {
  if (!r.statutoryDate || (r.state !== 'computed' && r.state !== 'provisional')) return [];
  if (RIGHTS_CLOCK_CODES.has(r.clockCode)) {
    const plan: Array<{ kind: typeof tables.reminder.$inferInsert.kind; sendOn: CivilDate }> = [];
    if (r.actByDate) {
      for (const [kind, n] of [['actby_d14', 14], ['actby_d7', 7], ['actby_d3', 3], ['actby_d0', 0]] as const) plan.push({ kind, sendOn: addDays(r.actByDate, -n) });
    }
    for (const [kind, n] of [['last_d5', 5], ['last_d2', 2], ['last_d0', 0]] as const) plan.push({ kind, sendOn: addDays(r.statutoryDate, -n) });
    return plan;
  }
  if (r.clockCode === 'CLK-17') return [{ kind: 'due', sendOn: r.statutoryDate }, { kind: 'due_plus3', sendOn: addDays(r.statutoryDate, 3) }];
  return [];
}

/**
 * Write a computation: one computation_run, supersede the replaced current deadlines, insert the
 * new ones, cancel scheduled reminders of superseded deadlines, schedule new reminders, raise
 * flags, and an urgent reminder when a rights act-by date moved earlier to within 14 days.
 * Must run inside the transaction that wrote the facts (AD-04), with the project row locked.
 */
export async function writeComputation(
  tx: Tx,
  actor: Actor | null,
  tenantId: string,
  req: RecomputeRequest,
  computed: ComputedScope[],
  factVersionRead: number,
  clockIds: Map<string, string>,
  correlationId: string,
): Promise<RecomputeResult> {
  const runHash = sha256Hex(computed.map((c) => `${c.subcontractId}:${c.inputsHash}`).sort().join(','));
  const [run] = await tx
    .insert(tables.computationRun)
    .values({
      tenantId,
      scopeType: req.scopeType,
      scopeId: req.scopeId,
      cause: req.cause,
      causeEventId: req.causeEventId,
      factVersionRead,
      inputsHash: Buffer.from(runHash, 'hex'),
      engineVersion: ENGINE_VERSION,
      status: 'succeeded',
      createdBy: actor?.userId ?? null,
    })
    .returning({ id: tables.computationRun.id });
  const runId = run!.id;
  const today = civil(torontoToday());
  let changed = 0;

  for (const scope of computed) {
    const current = await tx
      .select()
      .from(tables.deadline)
      .where(and(eq(tables.deadline.subcontractId, scope.subcontractId), eq(tables.deadline.isCurrent, true)));
    const oldByKey = new Map(current.map((d) => [key(d.subcontractId, d.invoiceId, d.clockCode, d.variant), d]));
    if (current.length) {
      await tx
        .update(tables.deadline)
        .set({ isCurrent: false, supersededByRunId: runId })
        .where(inArray(tables.deadline.id, current.map((d) => d.id)));
      await tx
        .update(tables.reminder)
        .set({ status: 'cancelled' })
        .where(and(inArray(tables.reminder.deadlineId, current.map((d) => d.id)), eq(tables.reminder.status, 'scheduled')));
    }
    for (const r of scope.results) {
      const ruleClockId = r.ruleVersionCode ? (clockIds.get(`${r.ruleVersionCode}|${r.clockCode}|${['CLK-03', 'CLK-06', 'CLK-07', 'CLK-14'].includes(r.clockCode) || (r.clockCode === 'CLK-16' || r.clockCode === 'CLK-17') ? '' : r.variant}`) ?? null) : null;
      const [d] = await tx
        .insert(tables.deadline)
        .values({
          tenantId,
          subcontractId: scope.subcontractId,
          invoiceId: r.invoiceId,
          clockCode: r.clockCode,
          variant: r.variant,
          ruleClockId,
          computationRunId: runId,
          state: r.state,
          statutoryDate: r.statutoryDate,
          bound: r.bound,
          path: r.path,
          actByDate: r.actByDate,
          windowEndDate: r.windowEndDate,
          amountCents: r.amountCents,
          missingFacts: r.missingFacts,
          flags: r.flags,
          withheld: r.withheld,
          notes: r.notes,
          triggerEventIds: r.triggerEventIds.filter((x: string) => /^[0-9a-f-]{36}$/.test(x)),
        })
        .returning({ id: tables.deadline.id });
      const deadlineId = d!.id;
      const old = oldByKey.get(key(scope.subcontractId, r.invoiceId, r.clockCode, r.variant));
      if (!old || old.statutoryDate !== r.statutoryDate || old.state !== r.state || old.bound !== r.bound) changed++;

      const plan = reminderPlan(r).filter((p) => p.sendOn >= today);
      const movedEarlier =
        RIGHTS_CLOCK_CODES.has(r.clockCode) && old?.actByDate && r.actByDate && r.actByDate < old.actByDate && r.actByDate <= addDays(today, 14);
      if (movedEarlier) plan.push({ kind: 'urgent_moved_earlier', sendOn: today });
      if (plan.length) {
        await tx.insert(tables.reminder).values(plan.map((p) => ({ tenantId, deadlineId, kind: p.kind, sendOn: p.sendOn, correlationId })));
      }
      if (r.flags.length) {
        await tx.insert(tables.flag).values(r.flags.map((code: string) => ({ tenantId, entityType: 'deadline', entityId: deadlineId, code, raisedByRunId: runId })));
      }
    }
  }
  if (actor) await audit(tx, actor, 'recomputation', 'computation_run', runId, undefined, { runHash, factVersionRead });
  return { runId, factVersion: factVersionRead, changed };
}

/** In-transaction recompute for a user write: lock the project, bump its fact version, compute, write. */
export async function recomputeInTx(tx: Tx, actor: Actor, req: RecomputeRequest): Promise<RecomputeResult> {
  const locked = await tx.raw.query<{ fact_version: number }>('update project set fact_version = fact_version + 1 where id = $1 returning fact_version', [req.projectId]);
  const factVersion = locked.rows[0]?.fact_version;
  if (factVersion === undefined) throw new Error('project vanished during recompute');
  const facts = await loadProjectFacts(tx, req.projectId);
  const rules = await loadRules(tx);
  const computed = computeProject(facts!, rules, req.subcontractIds);
  return writeComputation(tx, actor, actor.tenantId, req, computed, factVersion, rules.clockIds, actor.correlationId);
}
