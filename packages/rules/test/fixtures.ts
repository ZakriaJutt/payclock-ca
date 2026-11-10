/** Synthetic fixtures (execution-plan.md section 7): Northline Electric Ltd. (sub), contractor
 * Harbourgate Builders Inc., project Lakeshore Clinic Fit-out, prime contract 2026-02-10,
 * procurement start 2025-11-03, invoice INV-1042 CAD 48,000 with CAD 4,800 holdback. */
import {
  RULE_VERSIONS, civil, compute, ontarioHolidayRows,
  type ClockCode, type ClockResult, type ComputeInput, type ComputeOutput, type EventFact, type EventType,
} from '../src/index.ts';

export const HOLIDAYS = [2025, 2026, 2027, 2028].flatMap((y) => ontarioHolidayRows(y)).map((h) => h.day);
export const INV = 'inv-1042';

let seq = 0;
export function ev(
  type: EventType,
  on: string | null,
  extra: Partial<Omit<EventFact, 'type' | 'occurredOn' | 'receivedOn'>> & { receivedOn?: string | null } = {},
): EventFact {
  seq += 1;
  const invoiceScoped = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06'].includes(type);
  return {
    id: extra.id ?? `ev-${seq.toString().padStart(4, '0')}`,
    type,
    invoiceId: invoiceScoped ? (extra.invoiceId ?? INV) : null,
    seriesKey: extra.seriesKey ?? 'main',
    occurredOn: on === null ? null : civil(on),
    receivedOn: extra.receivedOn ? civil(extra.receivedOn) : null,
    certainty: extra.certainty ?? (on === null ? 'unknown' : 'confirmed'),
    amountCents: extra.amountCents ?? null,
    noticeForm: extra.noticeForm ?? null,
  };
}

export const PRIME = (): EventFact[] => [ev('EV-11', '2026-02-10'), ev('EV-12', '2025-11-03')];

export function input(events: EventFact[], over: Partial<ComputeInput> = {}): ComputeInput {
  return {
    project: { premisesLeased: 'no', leaseFirstEnteredOn: null, municipalInterest: 'no' },
    subcontract: { id: 'sc-1', hasSubSubs: true },
    invoices: [{ id: INV, amountCents: 4_800_000, holdbackCents: 480_000 }],
    events,
    ruleVersions: RULE_VERSIONS,
    holidays: HOLIDAYS,
    ...over,
  };
}

export function run(events: EventFact[], over: Partial<ComputeInput> = {}): ComputeOutput {
  return compute(input(events, over));
}

export function clock(out: ComputeOutput, code: ClockCode, variant = '', invoiceId: string | null | undefined = undefined): ClockResult {
  const hits = out.results.filter(
    (r) => r.clockCode === code && r.variant === variant && (invoiceId === undefined || r.invoiceId === invoiceId),
  );
  if (hits.length !== 1) {
    throw new Error(`expected one ${code}${variant} result, got ${hits.length}: ${out.results.filter((r) => r.clockCode === code).map((r) => r.variant).join(',')}`);
  }
  return hits[0]!;
}

export function all(out: ComputeOutput, code: ClockCode): ClockResult[] {
  return out.results.filter((r) => r.clockCode === code);
}
