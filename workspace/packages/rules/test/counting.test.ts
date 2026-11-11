import { describe, expect, it } from 'vitest';
import { addDays, civil, dayOfWeek, extendPastHolidays, isHoliday, ontarioHolidayRows } from '../src/index.ts';
import { HOLIDAYS, PRIME, clock, ev, run } from './fixtures.ts';

const set = new Set(HOLIDAYS);

describe('T-3.1.1 civil dates and holidays', () => {
  it('UT-01: EV-01 2026-10-08 (Thu) gives CLK-04 2026-11-12', () => {
    expect(dayOfWeek(civil('2026-10-08'))).toBe(4);
    const out = run([...PRIME(), ev('EV-01', '2026-10-08')]);
    const r = clock(out, 'CLK-04');
    expect(r.state).toBe('computed');
    expect(r.statutoryDate).toBe('2026-11-12');
  });

  it('UT-02: raw day Sunday 2026-11-08 extends to Monday 2026-11-09', () => {
    expect(addDays(civil('2026-10-04'), 35)).toBe('2026-11-08');
    expect(dayOfWeek(civil('2026-11-08'))).toBe(0);
    expect(clock(run([...PRIME(), ev('EV-01', '2026-10-04')]), 'CLK-04').statutoryDate).toBe('2026-11-09');
  });

  it('UT-03: raw day 2026-11-11 (Remembrance Day) extends to 2026-11-12', () => {
    expect(addDays(civil('2026-10-07'), 35)).toBe('2026-11-11');
    expect(isHoliday(civil('2026-11-11'), set)).toBe(true);
    expect(clock(run([...PRIME(), ev('EV-01', '2026-10-07')]), 'CLK-04').statutoryDate).toBe('2026-11-12');
  });

  it('UT-04: Saturday 2026-11-07 is not a holiday', () => {
    expect(dayOfWeek(civil('2026-11-07'))).toBe(6);
    expect(isHoliday(civil('2026-11-07'), set)).toBe(false);
    expect(clock(run([...PRIME(), ev('EV-01', '2026-10-03')]), 'CLK-04').statutoryDate).toBe('2026-11-07');
  });

  it('counts calendar days across month and year ends, trigger day excluded', () => {
    expect(addDays(civil('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(civil('2028-02-28'), 1)).toBe('2028-02-29');
    expect(addDays(civil('2026-09-15'), 90)).toBe('2026-12-14');
    expect(() => civil('2026-02-30')).toThrow();
  });

  it('extends across consecutive holidays (Christmas, Boxing Day on Saturday, Sunday)', () => {
    // 2026-12-25 Fri (holiday), 26 Sat (Boxing Day), 27 Sun -> Monday 28.
    expect(extendPastHolidays(civil('2026-12-25'), set)).toBe('2026-12-28');
  });

  it('holiday rows for 2026 and 2027 carry the fixture holidays and a source', () => {
    const r26 = ontarioHolidayRows(2026);
    const r27 = ontarioHolidayRows(2027);
    expect(r26.find((h) => h.name.startsWith('Remembrance Day'))?.day).toBe('2026-11-11');
    expect(r27.find((h) => h.name.startsWith('Family Day'))?.day).toBe('2027-02-15');
    expect(r26.find((h) => h.name.startsWith('Good Friday'))?.day).toBe('2026-04-03');
    expect(r26.every((h) => h.source.includes('s. 88(2)-(5)'))).toBe(true);
  });
});
