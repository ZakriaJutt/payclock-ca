import { addDays, dayOfWeek, makeDate, type CivilDate } from './civil-date.ts';

/**
 * Holidays for counting under the Legislation Act, 2006 s. 88(2) [S: SRC-04]: Sunday plus the
 * listed days. Saturday is not a holiday. The engine never derives holidays itself: it receives
 * the holiday table (data rows with a source). `ontarioHolidayRows` only generates candidate rows
 * for seeding that table; observed-day substitutions (a listed day falling on a weekend) are NOT
 * generated because their text was not re-read on 2026-11-11 (gap recorded in the
 * verification report).
 */
export interface HolidayRow {
  jurisdiction: 'ON';
  day: CivilDate;
  name: string;
  source: string;
}

export const HOLIDAY_SOURCE =
  'Legislation Act, 2006, S.O. 2006, c. 21, Sched. F, s. 88(2) (SRC-04); listed days only, observed-day substitutions not encoded';

function nthWeekday(year: number, month: number, weekday: number, n: number): CivilDate {
  let d = makeDate(year, month, 1);
  while (dayOfWeek(d) !== weekday) d = addDays(d, 1);
  return addDays(d, 7 * (n - 1));
}

/** Anonymous Gregorian algorithm for Easter Sunday. */
function easterSunday(year: number): CivilDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return makeDate(year, month, day);
}

function victoriaDay(year: number): CivilDate {
  // The Monday before May 25.
  let d = makeDate(year, 5, 24);
  while (dayOfWeek(d) !== 1) d = addDays(d, -1);
  return d;
}

export function ontarioHolidayRows(year: number): HolidayRow[] {
  const easter = easterSunday(year);
  const rows: Array<[CivilDate, string]> = [
    [makeDate(year, 1, 1), "New Year's Day"],
    [nthWeekday(year, 2, 1, 3), 'Family Day'],
    [addDays(easter, -2), 'Good Friday'],
    [addDays(easter, 1), 'Easter Monday'],
    [victoriaDay(year), 'Victoria Day'],
    [makeDate(year, 7, 1), 'Canada Day'],
    [nthWeekday(year, 8, 1, 1), 'Civic Holiday'],
    [nthWeekday(year, 9, 1, 1), 'Labour Day'],
    [nthWeekday(year, 10, 1, 2), 'Thanksgiving Day'],
    [makeDate(year, 11, 11), 'Remembrance Day'],
    [makeDate(year, 12, 25), 'Christmas Day'],
    [makeDate(year, 12, 26), 'Boxing Day'],
  ];
  return rows.map(([day, name]) => ({ jurisdiction: 'ON', day, name, source: HOLIDAY_SOURCE }));
}

export type HolidaySet = ReadonlySet<string>;

export function isHoliday(d: CivilDate, holidays: HolidaySet): boolean {
  return dayOfWeek(d) === 0 || holidays.has(d);
}

/** A limit expiring on a holiday extends to the next day that is not a holiday (s. 89(1)). */
export function extendPastHolidays(d: CivilDate, holidays: HolidaySet): CivilDate {
  let x = d;
  // Bounded: no run of more than a few consecutive holidays exists; guard anyway.
  for (let i = 0; i < 14 && isHoliday(x, holidays); i++) x = addDays(x, 1);
  return x;
}
