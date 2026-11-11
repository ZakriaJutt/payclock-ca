/** C1 item 1: the API never shows a firm 35-day date while EV-01 is unknown; it shows the next step. */
import { describe, expect, it } from 'vitest';
import { EV01_NEXT_STEP, presentDeadline } from '../../src/queries.ts';

type Row = Parameters<typeof presentDeadline>[0];
const row = (over: Partial<Row>): Row => ({
  id: 'd-1', clockCode: 'CLK-17', variant: '', invoiceId: 'inv-1', subcontractId: 'sc-1', state: 'not_computable',
  statutoryDate: null, bound: 'exact', path: 'H', actByDate: null, windowEndDate: null, amountCents: 4_320_000,
  missingFacts: ['EV-01'], flags: ['L-01'], withheld: [], notes: [], triggerEventIds: [], isCurrent: true,
  computationRunId: 'run-1', ...over,
}) as Row;

describe('UT-20 API part (C1 item 1): presentDeadline next step', () => {
  it('EV-01 missing: no date, label asks to confirm the proper-invoice date, request template and where to record the reply', () => {
    const p = presentDeadline(row({}));
    expect(p.statutory_date).toBeNull();
    expect(p.label).toBe("not computable: confirm the GC's proper-invoice date");
    expect(p.next_step).toEqual(EV01_NEXT_STEP);
    expect(p.next_step).toMatchObject({ template_code: 'ev01_date_request', record_reply: { path: '/api/v1/events', event_type: 'EV-01' } });
  });

  it('a computed date or a rights clock carries no EV-01 step', () => {
    expect(presentDeadline(row({ state: 'computed', statutoryDate: '2026-11-12', missingFacts: [], path: 'C' })).next_step).toBeNull();
    expect(presentDeadline(row({ clockCode: 'CLK-09', variant: 'b', invoiceId: null, missingFacts: ['EV-07'] })).next_step).toBeNull();
  });
});
