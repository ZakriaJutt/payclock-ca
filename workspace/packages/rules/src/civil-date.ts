/**
 * Civil dates (America/Toronto calendar days) as ISO strings `YYYY-MM-DD`.
 * No timestamps, no time zones, no floating point (AD-11). Arithmetic goes through a
 * day ordinal computed with UTC calendar maths, which has no daylight-saving effect.
 */
export type CivilDate = string & { readonly __civilDate: unique symbol };

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function civil(value: string): CivilDate {
  const m = ISO.exec(value);
  if (!m) throw new RangeError(`not a civil date: ${value}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ord = Date.UTC(y, mo - 1, d) / 86_400_000;
  if (fromOrdinal(ord) !== value) throw new RangeError(`not a calendar day: ${value}`);
  return value as CivilDate;
}

export function isCivilDate(value: unknown): value is CivilDate {
  if (typeof value !== 'string') return false;
  try {
    civil(value);
    return true;
  } catch {
    return false;
  }
}

function toOrdinal(d: CivilDate): number {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, day) / 86_400_000;
}

function fromOrdinal(ord: number): CivilDate {
  const dt = new Date(ord * 86_400_000);
  const y = dt.getUTCFullYear().toString().padStart(4, '0');
  const m = (dt.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = dt.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}` as CivilDate;
}

/** `n` calendar days after `d`; the day `d` itself is excluded (Legislation Act s. 89(3), (5)). */
export function addDays(d: CivilDate, n: number): CivilDate {
  if (!Number.isInteger(n)) throw new RangeError('day count must be an integer');
  return fromOrdinal(toOrdinal(d) + n);
}

export function daysBetween(from: CivilDate, to: CivilDate): number {
  return toOrdinal(to) - toOrdinal(from);
}

/** 0 = Sunday ... 6 = Saturday. */
export function dayOfWeek(d: CivilDate): number {
  return new Date(toOrdinal(d) * 86_400_000).getUTCDay();
}

export function compare(a: CivilDate, b: CivilDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(dates: readonly CivilDate[]): CivilDate {
  if (dates.length === 0) throw new RangeError('minDate of nothing');
  return dates.reduce((m, d) => (d < m ? d : m));
}

export function makeDate(year: number, month: number, day: number): CivilDate {
  return fromOrdinal(Date.UTC(year, month - 1, day) / 86_400_000);
}
