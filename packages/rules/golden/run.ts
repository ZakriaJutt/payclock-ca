/** Golden-case runner shared by `scripts/golden-verify.ts` and the UT-12 test. Pure: takes parsed JSON. */
import { civil, compute, ontarioHolidayRows, RULE_VERSIONS, type EventFact, type EventType } from '../src/index.ts';

interface GoldenEvent { type: EventType; on: string | null; form?: '1.2' | '1.3'; amount?: number }
interface GoldenExpect { clock: string; variant?: string; date?: string; act_by?: string; state?: string; bound?: string; path?: string }
interface GoldenCase { id: string; events: GoldenEvent[]; expect: GoldenExpect[] }
export interface GoldenFile { source: string; base_events: GoldenEvent[]; cases: GoldenCase[] }

const HOL = [2025, 2026, 2027, 2028].flatMap((y) => ontarioHolidayRows(y)).map((h) => h.day);

export function runGolden(file: GoldenFile): { passed: number; failures: string[] } {
  const failures: string[] = [];
  let passed = 0;
  for (const c of file.cases) {
    const events: EventFact[] = [...file.base_events, ...c.events].map((e, i) => ({
      id: `${c.id}-${i}`,
      type: e.type,
      invoiceId: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06'].includes(e.type) ? 'inv' : null,
      seriesKey: 'main',
      occurredOn: e.on === null ? null : civil(e.on),
      receivedOn: null,
      certainty: e.on === null ? 'unknown' : 'confirmed',
      amountCents: e.amount ?? null,
      noticeForm: e.form ?? null,
    }));
    const out = compute({
      project: { premisesLeased: 'no', leaseFirstEnteredOn: null, municipalInterest: 'no' },
      subcontract: { id: 'sc', hasSubSubs: true },
      invoices: [{ id: 'inv', amountCents: 4_800_000, holdbackCents: 480_000 }],
      events,
      ruleVersions: RULE_VERSIONS,
      holidays: HOL,
    });
    const diffs: string[] = [];
    for (const x of c.expect) {
      const r = out.results.find((y) => y.clockCode === x.clock && y.variant === (x.variant ?? ''));
      if (!r) {
        diffs.push(`${x.clock}${x.variant ?? ''}: missing`);
        continue;
      }
      const check = (name: string, want: string | undefined, got: string | null) => {
        if (want !== undefined && want !== got) diffs.push(`${x.clock}${x.variant ?? ''} ${name}: want ${want} got ${got}`);
      };
      check('date', x.date, r.statutoryDate);
      check('act_by', x.act_by, r.actByDate);
      check('state', x.state, r.state);
      check('bound', x.bound, r.bound);
      check('path', x.path, r.path);
    }
    if (diffs.length) failures.push(`${c.id}: ${diffs.join('; ')}`);
    else passed++;
  }
  return { passed, failures };
}
