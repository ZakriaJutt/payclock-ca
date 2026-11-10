import { describe, expect, it } from 'vitest';
import { civil, interestDays, interestStatement, overdueStatus, RULE_VERSIONS, simpleInterestCents } from '../src/index.ts';
import { INV, PRIME, all, clock, ev, run } from './fixtures.ts';

const base = () => [...PRIME(), ev('EV-01', '2026-10-08'), ev('EV-02', '2026-10-08')];
const NET = 4_320_000;

describe('T-3.1.3 payment clocks and CLK-17 paths', () => {
  it('UT-05 path A: owner paid in full within time; CLK-17 2026-11-09', () => {
    const out = run([...base(), ev('EV-04', '2026-11-02')]);
    const due = clock(out, 'CLK-17');
    expect(due).toMatchObject({ path: 'A', state: 'computed', statutoryDate: '2026-11-09', amountCents: NET });
    expect(clock(out, 'CLK-03').statutoryDate).toBe('2026-11-09');
  });

  it('UT-05 path B: 60% paid within time; paid portion 2026-11-09, remainder 2026-11-12 under path C', () => {
    const out = run([...base(), ev('EV-04', '2026-11-02', { amountCents: 2_592_000 })]);
    const portions = all(out, 'CLK-17');
    expect(portions).toHaveLength(2);
    const paid = portions.find((p) => p.path === 'B')!;
    const rest = portions.find((p) => p.path === 'C')!;
    expect(paid).toMatchObject({ statutoryDate: '2026-11-09', amountCents: 2_592_000, state: 'computed' });
    expect(rest).toMatchObject({ statutoryDate: '2026-11-12', amountCents: 1_728_000, state: 'computed' });
  });

  it('UT-06: CLK-05 2026-10-27 from Form 1.1; without one 2026-11-12; CLK-06 2026-11-17', () => {
    const withOwnerNotice = run([...base(), ev('EV-03', '2026-10-20')]);
    expect(clock(withOwnerNotice, 'CLK-05')).toMatchObject({ statutoryDate: '2026-10-27', path: 'a' });
    const without = run([...base(), ev('EV-05', '2026-10-27', { noticeForm: '1.2', receivedOn: '2026-10-28' })]);
    expect(clock(without, 'CLK-05')).toMatchObject({ statutoryDate: '2026-11-12', path: 'b' });
    expect(clock(without, 'CLK-06').statutoryDate).toBe('2026-11-17');
  });

  it('UT-07: EV-01 unknown: payment clocks not computable naming EV-01; lien and adjudication still compute', () => {
    const out = run([...PRIME(), ev('EV-01', null), ev('EV-07', '2026-09-18')]);
    for (const code of ['CLK-03', 'CLK-04', 'CLK-05', 'CLK-16'] as const) {
      const r = clock(out, code);
      expect(r.state).toBe('not_computable');
      expect(r.missingFacts).toContain('EV-01');
      expect(r.statutoryDate).toBeNull();
    }
    expect(clock(out, 'CLK-17')).toMatchObject({ path: 'H', state: 'not_computable', missingFacts: ['EV-01'] });
    expect(clock(out, 'CLK-09', 'b')).toMatchObject({ state: 'computed', statutoryDate: '2026-11-17' });
    expect(clock(out, 'CLK-11')).toMatchObject({ state: 'computed', statutoryDate: '2026-12-17' });
    // No clock passes: no state means "fine".
    for (const r of out.results) expect(['computed', 'provisional', 'not_computable', 'not_applicable']).toContain(r.state);
  });

  it('UT-17 path C: late owner payment (day 30) does not restart 7 days; CLK-17 2026-11-12, CLK-16 2026-11-13', () => {
    const out = run([...base(), ev('EV-04', '2026-11-07')]);
    expect(clock(out, 'CLK-17')).toMatchObject({ path: 'C', statutoryDate: '2026-11-12', state: 'computed' });
    expect(clock(out, 'CLK-17').statutoryDate).not.toBe('2026-11-14');
    expect(clock(out, 'CLK-16')).toMatchObject({ state: 'computed', statutoryDate: '2026-11-13' });
    expect(clock(out, 'CLK-03').state).toBe('not_applicable');
  });

  it('UT-18 path E: Form 1.3 for the full amount; then for CAD 10,000 only', () => {
    const facts = [...base(), ev('EV-04', '2026-11-07')];
    const full = run([...facts, ev('EV-05', '2026-10-28', { noticeForm: '1.3', receivedOn: '2026-10-28', amountCents: NET })]);
    const e = clock(full, 'CLK-17');
    expect(e).toMatchObject({ path: 'E', state: 'not_applicable', statutoryDate: null });
    expect(e.flags).toContain('L-05');
    expect(clock(full, 'CLK-16').state).toBe('not_applicable');
    expect(overdueStatus(full.results, [], civil('2026-11-20'))[0]!.overdue).toBe(false);

    const partial = run([...facts, ev('EV-05', '2026-10-28', { noticeForm: '1.3', receivedOn: '2026-10-28', amountCents: 1_000_000 })]);
    const portions = all(partial, 'CLK-17');
    expect(portions.find((p) => p.path === 'C')).toMatchObject({ amountCents: 3_320_000, statutoryDate: '2026-11-12' });
    expect(portions.find((p) => p.path === 'E')).toMatchObject({ amountCents: 1_000_000, statutoryDate: null });
  });

  it('UT-19 path F: Form 1.2 received day 36, day given unknown: 2026-11-12 provisional, L-05, interest refused', () => {
    const out = run([...base(), ev('EV-04', '2026-11-07'), ev('EV-05', null, { noticeForm: '1.2', receivedOn: '2026-11-13' })]);
    const f = clock(out, 'CLK-17');
    expect(f).toMatchObject({ path: 'F', state: 'provisional', statutoryDate: '2026-11-12' });
    expect(f.flags).toContain('L-05');
    const clk16 = clock(out, 'CLK-16');
    expect(clk16.state).toBe('not_computable');
    expect(interestStatement(clk16, RULE_VERSIONS, []).status).toBe('refused');
    expect(overdueStatus(out.results, [], civil('2026-11-20'))[0]!.overdue).toBe(false);
  });

  it('UT-19 path D: Form 1.2 given in time suspends; CLK-06 2026-11-18; owner pays 2026-12-01 -> 2026-12-08', () => {
    const notice = ev('EV-05', '2026-10-28', { noticeForm: '1.2', receivedOn: '2026-10-29' });
    const suspended = run([...base(), notice]);
    expect(clock(suspended, 'CLK-17')).toMatchObject({ path: 'D', state: 'not_applicable', statutoryDate: null });
    expect(clock(suspended, 'CLK-16').state).toBe('not_applicable');
    expect(clock(suspended, 'CLK-06').statutoryDate).toBe('2026-11-18');
    const paid = run([...base(), notice, ev('EV-04', '2026-12-01')]);
    expect(clock(paid, 'CLK-17')).toMatchObject({ path: 'D', state: 'computed', statutoryDate: '2026-12-08' });
  });

  it('path G: EV-04 known, EV-01 unknown gives "no later than EV-04 + 7", provisional, never overdue', () => {
    const out = run([...PRIME(), ev('EV-04', '2026-11-02')]);
    const g = clock(out, 'CLK-17');
    expect(g).toMatchObject({ path: 'G', state: 'provisional', bound: 'no_later_than', statutoryDate: '2026-11-09', missingFacts: ['EV-01'] });
    expect(overdueStatus(out.results, [], civil('2026-12-31'))[0]!.overdue).toBe(false);
  });

  it('path H: neither EV-01 nor EV-04 gives not_computable with missing EV-01', () => {
    const out = run([...PRIME()]);
    expect(clock(out, 'CLK-17')).toMatchObject({ path: 'H', state: 'not_computable', missingFacts: ['EV-01'] });
  });

  it('within-time test with EV-02 unknown uses EV-01 and marks the result provisional', () => {
    const out = run([...PRIME(), ev('EV-01', '2026-10-08'), ev('EV-04', '2026-11-02')]);
    expect(clock(out, 'CLK-17')).toMatchObject({ path: 'A', state: 'provisional', statutoryDate: '2026-11-09' });
  });

  it('overdue only when computed, unpaid and after the extended due date', () => {
    const out = run([...base()]);
    expect(overdueStatus(out.results, [], civil('2026-11-12'))[0]!.overdue).toBe(false);
    expect(overdueStatus(out.results, [], civil('2026-11-13'))[0]!.overdue).toBe(true);
    const paid = [ev('EV-06', '2026-11-12', { amountCents: NET })];
    expect(overdueStatus(out.results, paid, civil('2026-11-20'))[0]!.overdue).toBe(false);
  });

  it('CLK-08 is EV-01 + 42 when the sub has sub-subs, not applicable without, not computable when unknown', () => {
    expect(clock(run(base()), 'CLK-08').statutoryDate).toBe('2026-11-19');
    expect(clock(run(base(), { subcontract: { id: 'sc-1', hasSubSubs: false } }), 'CLK-08').state).toBe('not_applicable');
    expect(clock(run(base(), { subcontract: { id: 'sc-1', hasSubSubs: null } }), 'CLK-08').missingFacts).toEqual(['has_sub_subs']);
  });

  it('Decision 4.5 example: EV-01 corrected 2026-10-01 (estimated) -> 2026-10-08 moves CLK-17 2026-11-05 -> 2026-11-12', () => {
    const before = run([...PRIME(), ev('EV-01', '2026-10-01', { certainty: 'estimated' })]);
    const b = clock(before, 'CLK-17');
    expect(b).toMatchObject({ statutoryDate: '2026-11-05', state: 'computed' });
    expect(b.estimatedEventIds).toHaveLength(1);
    const after = run([...PRIME(), ev('EV-01', '2026-10-08')]);
    expect(clock(after, 'CLK-17').statutoryDate).toBe('2026-11-12');
    expect(clock(after, 'CLK-05').statutoryDate).toBe('2026-11-12');
    expect(clock(after, 'CLK-08').statutoryDate).toBe('2026-11-19');
    expect(clock(after, 'CLK-16').statutoryDate).toBe('2026-11-13');
    expect(overdueStatus(after.results, [], civil('2026-11-10'))[0]!.overdue).toBe(false);
  });
});

describe('T-3.1.6 interest', () => {
  it('UT-09 arithmetic: CAD 43,200.00 for 30 days at a synthetic 4.00% is CAD 142.03', () => {
    expect(interestDays(civil('2026-11-13'), civil('2026-12-12'))).toBe(30);
    expect(simpleInterestCents(4_320_000, '0.0400', 30)).toBe(14_203);
  });

  it('UT-09 withholding: no customer-facing amount while the CLK-16 row carries pending_question L-09', () => {
    const out = run([...base()]);
    const clk16 = clock(out, 'CLK-16', '', INV);
    expect(clk16.state).toBe('computed');
    expect(clk16.withheld).toContainEqual({ output: 'interest_amount', question: 'L-09' });
    const row = RULE_VERSIONS.find((v) => v.code === 'ON-2026-01')!.clocks.find((c) => c.clockCode === 'CLK-16')!;
    expect(row.pendingQuestion).toBe('L-09');
    const stmt = interestStatement(clk16, RULE_VERSIONS, out.results.length ? [ev('EV-01', '2026-10-08', { id: clk16.triggerEventIds[0]! })] : []);
    expect(stmt.status).toBe('withheld');
    expect(stmt.flags).toContain('L-09');
    expect(JSON.stringify(stmt)).not.toMatch(/142|14203/);
  });

  it('UT-14: interest statement with EV-01 estimated is refused with a reason', () => {
    const e01 = ev('EV-01', '2026-10-08', { certainty: 'estimated' });
    const out = run([...PRIME(), e01, ev('EV-02', '2026-10-08')]);
    const stmt = interestStatement(clock(out, 'CLK-16'), RULE_VERSIONS, [e01]);
    expect(stmt).toMatchObject({ status: 'refused' });
    expect(stmt.reason).toMatch(/estimated/);
  });
});
