/**
 * Permanent regressions for the B1 round-1 code review (`_coordination/review/payclock-ca-b1-round1.md`).
 * Expected values from the Legislation Act, 2006 ss. 88-89 and the Construction Act, read on e-Laws
 * on 2026-11-11.
 */
import { describe, expect, it } from 'vitest';
import { civil, firstAnniversaryForTest, isHoliday, ontarioHolidayRows } from './review-helpers.ts';
import { HOLIDAYS, PRIME, clock, ev, run } from './fixtures.ts';

const set: ReadonlySet<string> = new Set<string>(HOLIDAYS);

describe('B1-001 Civic Holiday is not a holiday under s. 88(2)', () => {
  it('no Civic Holiday row in any year; 2026-08-03 is an ordinary Monday', () => {
    for (let y = 2018; y <= 2040; y++) expect(ontarioHolidayRows(y).some((h) => /civic/i.test(h.name))).toBe(false);
    expect(isHoliday(civil('2026-08-03'), set)).toBe(false);
  });
  it('August due date: EV-01 2026-06-29 -> CLK-17 2026-08-03, CLK-16 2026-08-04', () => {
    const out = run([...PRIME(), ev('EV-01', '2026-06-29')]);
    expect(clock(out, 'CLK-17')).toMatchObject({ path: 'C', statutoryDate: '2026-08-03', state: 'computed' });
    expect(clock(out, 'CLK-16').statutoryDate).toBe('2026-08-04');
  });
  it('Form 1.2 deadline: CLK-05(b) 2026-08-03; a Form 1.2 given 2026-08-04 is late (path F, L-05), not suspending', () => {
    const out = run([...PRIME(), ev('EV-01', '2026-06-29'), ev('EV-05', '2026-08-04', { noticeForm: '1.2' })]);
    expect(clock(out, 'CLK-05').statutoryDate).toBe('2026-08-03');
    const due = clock(out, 'CLK-17');
    expect(due.path).toBe('F');
    expect(due.flags).toContain('L-05');
    const inTime = run([...PRIME(), ev('EV-01', '2026-06-29'), ev('EV-05', '2026-08-03', { noticeForm: '1.2' })]);
    expect(clock(inTime, 'CLK-17').path).toBe('D');
  });
});

describe('B1-002 observed days of s. 88(3)-(5)', () => {
  it('generates the substitute days', () => {
    expect(set.has('2027-12-27')).toBe(true); // Christmas 2027 Saturday -> Monday (s. 88(5))
    expect(set.has('2022-12-27')).toBe(true); // Christmas 2022 Sunday -> Tuesday (s. 88(5))
    expect(set.has('2023-01-02')).toBe(true); // New Year's Day 2023 Sunday -> Monday (s. 88(3))
    expect(set.has('2029-07-02')).toBe(true); // July 1 2029 Sunday -> Canada Day July 2 (s. 88(4))
    expect(set.has('2028-01-03')).toBe(false); // New Year's Day 2028 is a Saturday: no substitute
  });
  it('EV-01 2027-11-22 (+35 = 2027-12-27) -> CLK-17 2027-12-28', () => {
    expect(clock(run([...PRIME(), ev('EV-01', '2027-11-22')]), 'CLK-17').statutoryDate).toBe('2027-12-28');
  });
  it('rights clock ending 2027-12-27 shows the un-extended day with the L-09 withheld note', () => {
    const b = clock(run([...PRIME(), ev('EV-07', '2027-10-28')]), 'CLK-09', 'b');
    expect(b.statutoryDate).toBe('2027-12-27');
    expect(b.withheld).toContainEqual({ output: 'extended_date', question: 'L-09' });
    expect(JSON.stringify(b)).not.toContain('2027-12-28');
  });
});

describe('B1-003 no computed date outside the holiday table coverage', () => {
  const only = (years: number[]) => ({ holidays: years.flatMap((y) => ontarioHolidayRows(y)).map((h) => h.day), holidayYears: years });
  it('contract 2020, EV-01 2024-05-27 with a 2025-2028 table: not computable naming the year', () => {
    const out = run([ev('EV-11', '2020-03-02'), ev('EV-12', '2020-01-15'), ev('EV-01', '2024-05-27')], only([2025, 2026, 2027, 2028]));
    const due = clock(out, 'CLK-17');
    expect(due.state).toBe('not_computable');
    expect(due.statutoryDate).toBeNull();
    expect(due.missingFacts).toContain('holiday_table:2024');
    expect(clock(out, 'CLK-16').state).toBe('not_computable');
  });
  it('with the year covered the statute day is given: 2024-07-01 Canada Day -> 2024-07-02', () => {
    const out = run([ev('EV-11', '2020-03-02'), ev('EV-12', '2020-01-15'), ev('EV-01', '2024-05-27')]);
    expect(clock(out, 'CLK-17').statutoryDate).toBe('2024-07-02');
  });
  it('EV-01 2029-04-16 (+35 = Victoria Day 2029-05-21): uncovered -> not computable; covered -> 2029-05-22', () => {
    expect(clock(run([...PRIME(), ev('EV-01', '2029-04-16')], only([2026, 2027, 2028])), 'CLK-17').state).toBe('not_computable');
    expect(clock(run([...PRIME(), ev('EV-01', '2029-04-16')]), 'CLK-17').statutoryDate).toBe('2029-05-22');
  });
  it('rights clocks fail closed too, and CLK-10 follows', () => {
    const out = run([...PRIME(), ev('EV-07', '2028-11-15')], only([2026, 2027, 2028]));
    expect(clock(out, 'CLK-09', 'b').state).toBe('not_computable'); // last day 2029-01-14
    expect(clock(out, 'CLK-10', 'b').state).toBe('not_computable');
    expect(clock(out, 'CLK-11').state).toBe('not_computable');
  });
  it('an empty holiday table computes nothing', () => {
    const out = run([...PRIME(), ev('EV-01', '2026-10-08'), ev('EV-07', '2026-09-18')], { holidays: [], holidayYears: [] });
    expect(out.results.filter((r) => r.statutoryDate !== null)).toEqual([]);
  });
});

describe('B1-004 estimated regime-selecting dates', () => {
  it('estimated EV-11/EV-12 just before 2019-10-01: regime undecided (L-06), not "not applicable"', () => {
    const out = run([ev('EV-11', '2019-09-28', { certainty: 'estimated' }), ev('EV-12', '2019-09-01', { certainty: 'estimated' }), ev('EV-07', '2026-10-20'), ev('EV-01', '2026-10-01')]);
    expect(out.regime.family).toBeNull();
    for (const r of out.results) {
      expect(r.state).toBe('not_computable');
      expect(r.flags).toEqual(expect.arrayContaining(['L-06', 'REGIME_ESTIMATED']));
      expect(r.estimatedEventIds.length).toBe(2);
    }
  });
  it('estimated 2019-10-02 dates: undecided as well', () => {
    const out = run([ev('EV-11', '2019-10-02', { certainty: 'estimated' }), ev('EV-12', '2019-10-02', { certainty: 'estimated' }), ev('EV-07', '2026-09-30')]);
    expect(out.regime.family).toBeNull();
    expect(clock(out, 'CLK-11').state).toBe('not_computable');
  });
  it('an estimate far from every boundary selects the regime but every result carries the estimate', () => {
    const e11 = ev('EV-11', '2026-02-10', { certainty: 'estimated' });
    const out = run([e11, ev('EV-12', '2025-11-03'), ev('EV-07', '2026-09-18')]);
    expect(out.regime.family).toBe('POST-2019');
    for (const r of out.results) {
      expect(r.flags).toContain('REGIME_ESTIMATED');
      expect(r.estimatedEventIds).toContain(e11.id);
    }
    expect(clock(out, 'CLK-11')).toMatchObject({ statutoryDate: '2026-12-17', state: 'computed' });
  });
  it('an estimated EV-11 whose reach cannot change the regime (EV-12 confirmed before 2019-10-01) keeps ON-NOPP, marked', () => {
    const out = run([ev('EV-11', '2019-12-01', { certainty: 'estimated' }), ev('EV-12', '2019-08-01')]);
    // EV-11 within reach of 2018-12-06? 2019-12-01 - 365 = 2018-12-01 < 2018-12-06: the lease window is in reach,
    // but premises are not leased, so every alternative gives ON-NOPP.
    expect(out.regime.family).toBe('ON-NOPP');
    expect(clock(out, 'CLK-11').flags).toContain('REGIME_ESTIMATED');
  });
});

describe('B1-006 L-01 on every result while rule versions are unsigned', () => {
  it('applicability unknown and not-applicable results carry L-01', () => {
    const unknown = run([ev('EV-11', '2020-01-01'), ev('EV-12', null)]);
    expect(unknown.results.every((r) => r.flags.includes('L-01'))).toBe(true);
    const nopp = run([ev('EV-11', '2019-09-30'), ev('EV-12', '2019-09-01'), ev('EV-07', '2026-09-30'), ev('EV-01', '2026-09-01')]);
    expect(nopp.results.every((r) => r.flags.includes('L-01'))).toBe(true);
    expect(clock(nopp, 'CLK-11').state).toBe('not_applicable');
  });
});

describe('B1-009 29 February anniversary (Legislation Act s. 89(7))', () => {
  it('EV-11 2028-02-29: first anniversary 2029-02-28, Form 6 by 2029-03-14', () => {
    expect(firstAnniversaryForTest(civil('2028-02-29'))).toBe('2029-02-28');
    expect(firstAnniversaryForTest(civil('2031-02-28'))).toBe('2032-02-28');
    const f = clock(run([ev('EV-11', '2028-02-29'), ev('EV-12', '2028-01-10')]), 'CLK-13', 'form6');
    expect(f).toMatchObject({ state: 'computed', statutoryDate: '2029-03-14' });
    expect(f.notes.join(' ')).toMatch(/s\. 89\(7\)/);
  });
});
