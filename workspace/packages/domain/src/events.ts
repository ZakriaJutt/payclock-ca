import { and, eq, isNull, tables, type Tx } from '@payclock/db';
import { EVENT_SCOPE, EVENT_TYPES, isCivilDate, SERIES_EVENT_TYPES, type EventType } from '@payclock/rules';
import { authorize, type Actor } from './actor.ts';
import { audit } from './audit.ts';
import { conflict, notFound, unprocessable, uuidField } from './errors.ts';
import { recomputeInTx, type RecomputeResult } from './recompute.ts';

type DbEvent = typeof tables.event.$inferSelect;
const CERTAINTY = ['confirmed', 'estimated', 'unknown'] as const;

export interface EventInput {
  scope_type: unknown;
  scope_id: unknown;
  type: unknown;
  occurred_on: unknown;
  certainty: unknown;
  received_on?: unknown;
  amount_cents?: unknown;
  notice_form?: unknown;
  series_key?: unknown;
  delivery_method?: unknown;
}

/** Resolve the project that owns a scope row (RLS hides other tenants' rows: they are not found). */
async function projectOf(tx: Tx, scopeType: string, scopeId: string): Promise<{ projectId: string; subcontractId: string | null }> {
  if (scopeType === 'project') {
    const [p] = await tx.select({ id: tables.project.id }).from(tables.project).where(eq(tables.project.id, scopeId));
    if (!p) throw notFound('project');
    return { projectId: p.id, subcontractId: null };
  }
  if (scopeType === 'subcontract') {
    const [s] = await tx.select().from(tables.subcontract).where(eq(tables.subcontract.id, scopeId));
    if (!s) throw notFound('subcontract');
    return { projectId: s.projectId, subcontractId: s.id };
  }
  const r = await tx.raw.query<{ project_id: string; subcontract_id: string }>(
    'select s.project_id, s.id as subcontract_id from invoice i join subcontract s on s.id = i.subcontract_id where i.id = $1',
    [scopeId],
  );
  if (!r.rows[0]) throw notFound('invoice');
  return { projectId: r.rows[0].project_id, subcontractId: r.rows[0].subcontract_id };
}

interface DateFields {
  occurredOn: string | null;
  certainty: (typeof CERTAINTY)[number];
  receivedOn: string | null;
  amountCents: number | null;
  noticeForm: '1.2' | '1.3' | null;
}

/** Unknown is a valid value; no date is ever defaulted (MH-02). */
function dateFields(type: EventType, input: Partial<EventInput>): DateFields {
  const certainty = input.certainty as DateFields['certainty'];
  if (!CERTAINTY.includes(certainty)) throw unprocessable('certainty must be confirmed, estimated or unknown', ['certainty']);
  const on = input.occurred_on ?? null;
  if (on !== null && !isCivilDate(on)) throw unprocessable('occurred_on must be YYYY-MM-DD or null', ['occurred_on']);
  if ((certainty === 'unknown') !== (on === null)) throw unprocessable('occurred_on is null exactly when certainty is unknown', ['occurred_on', 'certainty']);
  const received = input.received_on ?? null;
  if (received !== null && (type !== 'EV-05' || !isCivilDate(received))) throw unprocessable('received_on is a date and only for EV-05', ['received_on']);
  const amount = input.amount_cents ?? null;
  if (amount !== null && (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0)) throw unprocessable('amount_cents must be integer cents', ['amount_cents']);
  const form = input.notice_form ?? null;
  if (type === 'EV-05' ? form !== '1.2' && form !== '1.3' : form !== null) throw unprocessable('notice_form is 1.2 or 1.3 for EV-05 only', ['notice_form']);
  return { occurredOn: on as string | null, certainty, receivedOn: received as string | null, amountCents: amount as number | null, noticeForm: form as DateFields['noticeForm'] };
}

export async function addEvent(tx: Tx, actor: Actor, input: EventInput): Promise<{ event: DbEvent; recomputation: RecomputeResult }> {
  authorize(actor, 'write_events');
  const type = input.type as EventType;
  if (!EVENT_TYPES.includes(type)) throw unprocessable('unknown event type', ['type']);
  const scopeType = input.scope_type as string;
  if (EVENT_SCOPE[type] !== scopeType) throw unprocessable(`${type} belongs to scope ${EVENT_SCOPE[type]}`, ['scope_type']);
  const scopeId = uuidField(input.scope_id, 'scope_id');
  const seriesKey = input.series_key === undefined || input.series_key === null ? 'main' : String(input.series_key);
  if (!/^[a-z0-9-]{1,40}$/.test(seriesKey)) throw unprocessable('series_key must be short lowercase text', ['series_key']);
  if (seriesKey !== 'main' && !SERIES_EVENT_TYPES.has(type)) throw unprocessable(`${type} occurs once per scope`, ['series_key']);
  const fields = dateFields(type, input);
  const { projectId, subcontractId } = await projectOf(tx, scopeType, scopeId);
  // Lock the project row first: all fact writes for one project serialise here.
  await tx.raw.query('select 1 from project where id = $1 for update', [projectId]);
  const [existing] = await tx
    .select({ id: tables.event.id, version: tables.event.version })
    .from(tables.event)
    .where(and(eq(tables.event.scopeId, scopeId), eq(tables.event.eventType, type), eq(tables.event.seriesKey, seriesKey), isNull(tables.event.supersededAt)));
  if (existing) throw conflict('event_exists', 'this event is already recorded; correct it instead', { event_id: existing.id, version: existing.version });
  const [ev] = await tx
    .insert(tables.event)
    .values({
      tenantId: actor.tenantId,
      scopeType: scopeType as DbEvent['scopeType'],
      scopeId: scopeId,
      eventType: type,
      seriesKey,
      deliveryMethod: typeof input.delivery_method === 'string' ? input.delivery_method.slice(0, 40) : null,
      createdBy: actor.userId,
      ...fields,
    })
    .returning();
  await audit(tx, actor, 'event.create', 'event', ev!.id, undefined, ev);
  const recomputation = await recomputeInTx(tx, actor, {
    projectId,
    scopeType: scopeType as DbEvent['scopeType'],
    scopeId: scopeId,
    cause: 'new_event',
    causeEventId: ev!.id,
    subcontractIds: subcontractId ? [subcontractId] : undefined,
  });
  return { event: ev!, recomputation };
}

export interface CorrectionInput {
  occurred_on: unknown;
  certainty: unknown;
  reason: unknown;
  expected_version: unknown;
  received_on?: unknown;
  amount_cents?: unknown;
  notice_form?: unknown;
}

/**
 * Correction (MH-06, TRD 6.1): a new event version supersedes the old one, and every dependent
 * deadline is recomputed in the same transaction. Nothing is edited in place or deleted.
 * `fault` lets IT-03 inject a failure after the deadlines insert.
 */
export async function correctEvent(
  tx: Tx,
  actor: Actor,
  eventId: string,
  input: CorrectionInput,
  fault?: () => void,
): Promise<{ event: DbEvent; recomputation: RecomputeResult }> {
  authorize(actor, 'write_events');
  eventId = uuidField(eventId, 'event_id');
  if (typeof input.reason !== 'string' || input.reason.trim() === '') throw unprocessable('a correction needs a reason', ['reason']);
  if (typeof input.expected_version !== 'number') throw unprocessable('expected_version is required', ['expected_version']);
  const [found] = await tx.select().from(tables.event).where(eq(tables.event.id, eventId));
  if (!found) throw notFound('event');
  const { projectId, subcontractId } = await projectOf(tx, found.scopeType, found.scopeId);
  await tx.raw.query('select 1 from project where id = $1 for update', [projectId]);
  // Re-read the current version of this fact under the lock.
  const [current] = await tx
    .select()
    .from(tables.event)
    .where(and(eq(tables.event.scopeId, found.scopeId), eq(tables.event.eventType, found.eventType), eq(tables.event.seriesKey, found.seriesKey), isNull(tables.event.supersededAt)));
  if (!current || current.version !== input.expected_version || current.id !== eventId) {
    throw conflict('stale_version', 'the event was changed by someone else', {
      current: current ? { id: current.id, version: current.version, occurred_on: current.occurredOn, certainty: current.certainty } : null,
    });
  }
  const fields = dateFields(current.eventType as EventType, {
    occurred_on: input.occurred_on,
    certainty: input.certainty,
    received_on: input.received_on ?? current.receivedOn,
    amount_cents: input.amount_cents === undefined ? current.amountCents : input.amount_cents,
    notice_form: input.notice_form ?? current.noticeForm,
  });
  await tx.update(tables.event).set({ supersededAt: new Date().toISOString() }).where(eq(tables.event.id, current.id));
  const [ev] = await tx
    .insert(tables.event)
    .values({
      tenantId: actor.tenantId,
      scopeType: current.scopeType,
      scopeId: current.scopeId,
      eventType: current.eventType,
      seriesKey: current.seriesKey,
      deliveryMethod: current.deliveryMethod,
      documentId: current.documentId,
      version: current.version + 1,
      supersedesId: current.id,
      reason: input.reason.trim().slice(0, 500),
      createdBy: actor.userId,
      ...fields,
    })
    .returning();
  const recomputation = await recomputeInTx(tx, actor, {
    projectId,
    scopeType: current.scopeType,
    scopeId: current.scopeId,
    cause: 'correction',
    causeEventId: ev!.id,
    subcontractIds: subcontractId ? [subcontractId] : undefined,
  });
  fault?.();
  await audit(tx, actor, 'event.correct', 'event', ev!.id, current, ev);
  return { event: ev!, recomputation };
}
