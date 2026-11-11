import { addDays, dayOfWeek, makeDate, type CivilDate } from './civil-date.ts';

/**
 * Holidays for counting under the Legislation Act, 2006 s. 88 [S: SRC-04], text read on e-Laws on
 * 2026-11-11: s. 88(2) Sunday, New Year's Day, Family Day, Good Friday, Easter Monday, Victoria Day,
 * Canada Day, Labour Day, Thanksgiving Day, Remembrance Day, Christmas Day, Boxing Day, and any
 * day proclaimed by the Governor General or Lieutenant Governor; s. 88(3) New Year's Day on a
 * Sunday adds the following Monday; s. 88(4) when July 1 is a Sunday, Canada Day falls on July 2;
 * s. 88(5) Christmas Day on a Saturday adds the following Monday, on a Sunday the following
 * Tuesday. Civic Holiday is NOT a holiday under s. 88. Saturday is not a holiday.
 * Proclaimed days (para. 12) cannot be generated: the operator adds them as rows.
 *
 * The engine never derives holidays itself: it receives the holiday table rows and the years
 * that table covers. `ontarioHolidayRows` only generates rows for seeding that table.
 */
export interface HolidayRow {
  jurisdiction: 'ON';
  day: CivilDate;
  name: string;
  source: string;
}

export const HOLIDAY_SOURCE = 'Legislation Act, 2006, S.O. 2006, c. 21, Sched. F, s. 88(2)-(5) (SRC-04), read on e-Laws 2026-11-11';

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
  const newYear = makeDate(year, 1, 1);
  const july1 = makeDate(year, 7, 1);
  const christmas = makeDate(year, 12, 25);
  const rows: Array<[CivilDate, string]> = [
    [newYear, "New Year's Day (s. 88(2) para. 2)"],
    [nthWeekday(year, 2, 1, 3), 'Family Day (s. 88(2) para. 2.1)'],
    [addDays(easter, -2), 'Good Friday (s. 88(2) para. 3)'],
    [addDays(easter, 1), 'Easter Monday (s. 88(2) para. 4)'],
    [victoriaDay(year), 'Victoria Day (s. 88(2) para. 5)'],
    // s. 88(4): when July 1 is a Sunday, Canada Day falls on July 2.
    dayOfWeek(july1) === 0 ? [makeDate(year, 7, 2), 'Canada Day (s. 88(4), July 1 a Sunday)'] : [july1, 'Canada Day (s. 88(2) para. 6)'],
    [nthWeekday(year, 9, 1, 1), 'Labour Day (s. 88(2) para. 7)'],
    [nthWeekday(year, 10, 1, 2), 'Thanksgiving Day (s. 88(2) para. 8)'],
    [makeDate(year, 11, 11), 'Remembrance Day (s. 88(2) para. 9)'],
    [christmas, 'Christmas Day (s. 88(2) para. 10)'],
    [makeDate(year, 12, 26), 'Boxing Day (s. 88(2) para. 11)'],
  ];
  if (dayOfWeek(newYear) === 0) rows.push([makeDate(year, 1, 2), "Monday after New Year's Day on a Sunday (s. 88(3))"]);
  if (dayOfWeek(christmas) === 6) rows.push([makeDate(year, 12, 27), 'Monday after Christmas Day on a Saturday (s. 88(5))']);
  if (dayOfWeek(christmas) === 0) rows.push([makeDate(year, 12, 27), 'Tuesday after Christmas Day on a Sunday (s. 88(5))']);
  return rows
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, name]) => ({ jurisdiction: 'ON', day, name, source: HOLIDAY_SOURCE }));
}

/** Years the engine may count in: holiday rows exist for every one of them (B1-003). */
export function yearOf(d: CivilDate): number {
  return Number(d.slice(0, 4));
}

export type HolidaySet = ReadonlySet<string>;

export class HolidayCoverageError extends Error {
  constructor(readonly year: number) {
    super(`holiday table does not cover ${year}`);
  }
}

/** A holiday test outside the covered years fails closed rather than treating the day as ordinary. */
export function isHolidayCovered(d: CivilDate, holidays: HolidaySet, coveredYears: ReadonlySet<number>): boolean {
  if (!coveredYears.has(yearOf(d))) throw new HolidayCoverageError(yearOf(d));
  return isHoliday(d, holidays);
}

export function extendPastHolidaysCovered(d: CivilDate, holidays: HolidaySet, coveredYears: ReadonlySet<number>): CivilDate {
  let x = d;
  for (let i = 0; i < 14 && isHolidayCovered(x, holidays, coveredYears); i++) x = addDays(x, 1);
  return x;
}

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
