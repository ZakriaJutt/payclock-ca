/** C1 corrections (2026-11-11): unknown upstream date, lien perfection from the last preservation
 * day (s. 36(2)), partial payment and a received notice of non-payment. */
import { describe, expect, it } from 'vitest';
import { EV01_ACTIONS, EV01_CONFIRM_NOTE } from '../src/index.ts';
import { PRIME, all, clock, ev, run } from './fixtures.ts';

const NET = 4_320_000;

describe('UT-20 (C1 item 1): EV-01 unknown never yields a 35-day date', () => {
  for (const [label, ev01] of [['recorded as unknown', [ev('EV-01', null)]], ['not recorded', []]] as const) {
    it(`EV-01 ${label}: no EV-01-based date; each payment clock asks to confirm the GC's proper-invoice date`, () => {
      const out = run([...PRIME(), ...ev01, ev('EV-07', '2026-09-18')]);
      for (const code of ['CLK-04', 'CLK-05', 'CLK-08', 'CLK-16', 'CLK-17'] as const) {
        const r = clock(out, code);
        expect(r.statutoryDate).toBeNull();
        expect(r.state).toBe('not_computable');
        expect(r.missingFacts).toContain('EV-01');
        expect(r.notes).toContain(EV01_CONFIRM_NOTE);
        expect(r.suggestedActions).toEqual(expect.arrayContaining([...EV01_ACTIONS]));
      }
      // Rights clocks are unaffected and carry no EV-01 request.
      expect(clock(out, 'CLK-09', 'b')).toMatchObject({ state: 'computed', statutoryDate: '2026-11-17' });
      expect(clock(out, 'CLK-09', 'b').suggestedActions).not.toContain('ev01_date_request');
    });
  }

  it('EV-01 known: no request is suggested', () => {
    const out = run([...PRIME(), ev('EV-01', '2026-10-08')]);
    for (const r of out.results) expect(r.suggestedActions).not.toContain('ev01_date_request');
    expect(clock(out, 'CLK-17')).toMatchObject({ path: 'C', state: 'computed', statutoryDate: '2026-11-12' });
  });

  it('path G (owner payment known, EV-01 unknown): "no later than" EV-04 + 7, plus the EV-01 request', () => {
    const g = clock(run([...PRIME(), ev('EV-04', '2026-11-02')]), 'CLK-17');
    expect(g).toMatchObject({ path: 'G', state: 'provisional', bound: 'no_later_than', statutoryDate: '2026-11-09' });
    expect(g.suggestedActions).toEqual(expect.arrayContaining([...EV01_ACTIONS]));
  });
});

describe('UT-21 (C1 item 3): CLK-10 counts 90 days from the last day the lien could be preserved (s. 36(2))', () => {
  it('earliest trigger EV-10 before last supply: CLK-09b 2026-10-30, CLK-10b 2027-01-28 (not EV-07 + 150 = 2027-02-27)', () => {
    const out = run([...PRIME(), ev('EV-10', '2026-08-31'), ev('EV-07', '2026-09-30')]);
    expect(clock(out, 'CLK-09', 'b')).toMatchObject({ state: 'computed', statutoryDate: '2026-10-30' });
    const p = clock(out, 'CLK-10', 'b');
    expect(p).toMatchObject({ state: 'computed', statutoryDate: '2027-01-28' });
    expect(p.statutoryDate).not.toBe('2027-02-27');
  });

  it('certificate published 2026-09-10: CLK-09a 2026-11-09, CLK-10a 2027-02-07 from that day, not from any invoice', () => {
    const out = run([
      ...PRIME(), ev('EV-19', '2026-09-05'), ev('EV-08', '2026-09-10'), ev('EV-07', '2026-10-15'),
      ev('EV-01', '2026-10-08'),
    ]);
    expect(clock(out, 'CLK-09', 'a')).toMatchObject({ state: 'computed', statutoryDate: '2026-11-09' });
    expect(clock(out, 'CLK-10', 'a')).toMatchObject({ state: 'computed', statutoryDate: '2027-02-07' });
    // Supply after substantial performance: the second lien counts from last supply 2026-10-15.
    expect(clock(out, 'CLK-09', 'b').statutoryDate).toBe('2026-12-14');
    expect(clock(out, 'CLK-10', 'b').statutoryDate).toBe('2027-03-14');
  });

  it('no preservation day computable: no perfection day either', () => {
    const out = run([...PRIME()]);
    expect(clock(out, 'CLK-10', 'b')).toMatchObject({ state: 'not_computable', statutoryDate: null });
  });
});

describe('UT-22 (C1 item 5): expected outputs for partial payment and a received notice of non-payment', () => {
  it('partial payment within time, EV-01 known: paid part EV-04 + 7 (path B), unpaid part EV-01 + 35 (path C)', () => {
    const out = run([...PRIME(), ev('EV-01', '2026-10-08'), ev('EV-02', '2026-10-08'), ev('EV-04', '2026-11-02', { amountCents: 2_592_000 })]);
    const portions = all(out, 'CLK-17');
    expect(portions.find((p) => p.path === 'B')).toMatchObject({ amountCents: 2_592_000, statutoryDate: '2026-11-09', state: 'computed' });
    expect(portions.find((p) => p.path === 'C')).toMatchObject({ amountCents: NET - 2_592_000, statutoryDate: '2026-11-12', state: 'computed' });
  });

  it('partial payment, EV-01 unknown: paid part "no later than" EV-04 + 7 (G); unpaid part not computable (H) with the EV-01 request', () => {
    const out = run([...PRIME(), ev('EV-04', '2026-11-02', { amountCents: 2_592_000 })]);
    const portions = all(out, 'CLK-17');
    expect(portions).toHaveLength(2);
    expect(portions.find((p) => p.path === 'G')).toMatchObject({ amountCents: 2_592_000, bound: 'no_later_than', statutoryDate: '2026-11-09' });
    const h = portions.find((p) => p.path === 'H')!;
    expect(h).toMatchObject({ amountCents: NET - 2_592_000, state: 'not_computable', statutoryDate: null });
    expect(h.suggestedActions).toContain('ev01_date_request');
  });

  it('Form 1.2 received, day given 2026-10-28, EV-01 unknown: CLK-06 2026-11-18 computes; no due date; L-05; EV-01 requested', () => {
    const out = run([...PRIME(), ev('EV-05', '2026-10-28', { noticeForm: '1.2', receivedOn: '2026-10-29' })]);
    expect(clock(out, 'CLK-06')).toMatchObject({ state: 'computed', statutoryDate: '2026-11-18' });
    const due = clock(out, 'CLK-17');
    expect(due).toMatchObject({ state: 'not_computable', statutoryDate: null });
    expect(due.flags).toContain('L-05');
    expect(due.suggestedActions).toContain('ev01_date_request');
    expect(clock(out, 'CLK-16').statutoryDate).toBeNull();
  });

  it('Form 1.2 given in time, EV-01 known: suspended (path D), never overdue, CLK-06 watched', () => {
    const out = run([...PRIME(), ev('EV-01', '2026-10-08'), ev('EV-05', '2026-10-28', { noticeForm: '1.2', receivedOn: '2026-10-29' })]);
    expect(clock(out, 'CLK-17')).toMatchObject({ path: 'D', state: 'not_applicable', statutoryDate: null });
    expect(clock(out, 'CLK-06').statutoryDate).toBe('2026-11-18');
  });
});
