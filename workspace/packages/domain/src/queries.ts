import { and, eq, inArray, tables, type Tx } from '@payclock/db';
import { authorize, type Actor } from './actor.ts';
import { notFound, uuidField } from './errors.ts';

type Deadline = typeof tables.deadline.$inferSelect;

/** Public shape of a deadline: dates with their certainty, never a bare "OK". */
export function presentDeadline(d: Deadline) {
  return {
    id: d.id,
    clock: d.clockCode,
    variant: d.variant,
    invoice_id: d.invoiceId,
    state: d.state,
    statutory_date: d.statutoryDate,
    bound: d.bound,
    label: d.statutoryDate ? `${d.bound === 'no_later_than' ? 'no later than ' : ''}${d.statutoryDate}` : d.state === 'not_applicable' ? 'not applicable' : 'not computable',
    path: d.path,
    act_by_date: d.actByDate,
    window_end_date: d.windowEndDate,
    amount_cents: d.amountCents,
    missing_facts: d.missingFacts,
    flags: d.flags,
    withheld: d.withheld,
    notes: d.notes,
    trigger_event_ids: d.triggerEventIds,
    is_current: d.isCurrent,
    computation_run_id: d.computationRunId,
  };
}

export async function getInvoice(tx: Tx, actor: Actor, invoiceId: string) {
  authorize(actor, 'read');
  invoiceId = uuidField(invoiceId, 'invoice_id');
  const [inv] = await tx.select().from(tables.invoice).where(eq(tables.invoice.id, invoiceId));
  if (!inv) throw notFound('invoice');
  const [sc] = await tx.select().from(tables.subcontract).where(eq(tables.subcontract.id, inv.subcontractId));
  const events = await tx
    .select()
    .from(tables.event)
    .where(inArray(tables.event.scopeId, [inv.id, inv.subcontractId, sc!.projectId]));
  const deadlines = await tx
    .select()
    .from(tables.deadline)
    .where(and(eq(tables.deadline.subcontractId, inv.subcontractId), eq(tables.deadline.isCurrent, true)));
  const relevant = deadlines.filter((d) => d.invoiceId === null || d.invoiceId === inv.id);
  return {
    invoice: { id: inv.id, number: inv.number, amount_cents: inv.amountCents, holdback_cents: inv.holdbackCents, status: inv.status, fact_version: inv.factVersion, subcontract_id: inv.subcontractId },
    events: events
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((e) => ({
        id: e.id, type: e.eventType, scope_type: e.scopeType, series_key: e.seriesKey, occurred_on: e.occurredOn, received_on: e.receivedOn,
        certainty: e.certainty, amount_cents: e.amountCents, notice_form: e.noticeForm, version: e.version,
        superseded: e.supersededAt !== null, supersedes_id: e.supersedesId, entered_by_operator: e.enteredByOperator,
      })),
    deadlines: relevant
      .sort((a, b) => `${a.clockCode}${a.variant}`.localeCompare(`${b.clockCode}${b.variant}`))
      .map(presentDeadline),
  };
}

/** S-09 diff: per deadline old and new date, rule version, cause event, user, time (Decision 4.5). */
export async function getRecomputation(tx: Tx, actor: Actor, runId: string) {
  authorize(actor, 'read');
  runId = uuidField(runId, 'recomputation_id');
  const [run] = await tx.select().from(tables.computationRun).where(eq(tables.computationRun.id, runId));
  if (!run) throw notFound('recomputation');
  const created = await tx.select().from(tables.deadline).where(eq(tables.deadline.computationRunId, runId));
  const replaced = await tx.select().from(tables.deadline).where(eq(tables.deadline.supersededByRunId, runId));
  const k = (d: Deadline) => `${d.subcontractId}|${d.invoiceId ?? ''}|${d.clockCode}|${d.variant}`;
  const oldBy = new Map(replaced.map((d) => [k(d), d]));
  const ruleIds = [...new Set(created.map((d) => d.ruleClockId).filter((x): x is string => x !== null))];
  const versions = ruleIds.length
    ? await tx.raw.query<{ id: string; code: string }>('select c.id, v.code from rule_clock c join rule_version v on v.id = c.rule_version_id where c.id = any($1)', [ruleIds])
    : { rows: [] as { id: string; code: string }[] };
  const codeOf = new Map(versions.rows.map((r) => [r.id, r.code]));
  const rank = (d: { clock: string; movement: string }) => (d.movement === 'earlier' ? 0 : d.movement === 'later' ? 2 : d.movement === 'unchanged' ? 3 : 1) * 100 + (['CLK-09', 'CLK-10', 'CLK-11'].includes(d.clock) ? 0 : 50);
  const changes = created.map((n) => {
    const o = oldBy.get(k(n));
    const movement =
      !o ? 'new' : o.statutoryDate === n.statutoryDate && o.state === n.state && o.bound === n.bound ? 'unchanged'
      : o.statutoryDate && n.statutoryDate ? (n.statutoryDate < o.statutoryDate ? 'earlier' : n.statutoryDate > o.statutoryDate ? 'later' : 'changed')
      : 'changed';
    return {
      clock: n.clockCode, variant: n.variant, invoice_id: n.invoiceId, subcontract_id: n.subcontractId,
      old_date: o?.statutoryDate ?? null, old_state: o?.state ?? null, old_bound: o?.bound ?? null, old_act_by: o?.actByDate ?? null,
      new_date: n.statutoryDate, new_state: n.state, new_bound: n.bound, new_act_by: n.actByDate,
      rule_version: n.ruleClockId ? codeOf.get(n.ruleClockId) ?? null : null,
      old_deadline_id: o?.id ?? null, new_deadline_id: n.id, movement,
    };
  });
  changes.sort((a, b) => rank(a) - rank(b) || `${a.clock}${a.variant}`.localeCompare(`${b.clock}${b.variant}`));
  return {
    id: run.id, cause: run.cause, cause_event_id: run.causeEventId, created_by: run.createdBy, created_at: run.createdAt,
    fact_version_read: run.factVersionRead, engine_version: run.engineVersion, status: run.status, changes,
  };
}
