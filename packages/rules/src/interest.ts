import { daysBetween, type CivilDate } from './civil-date.ts';
import type { ClockResult, EventFact, RuleVersion } from './types.ts';

export interface InterestRateRow {
  jurisdiction: 'ON';
  effectiveFrom: CivilDate;
  effectiveTo: CivilDate | null;
  /** Annual rate as a decimal fraction string with up to 4 places, e.g. "0.0400". */
  annualRate: string;
  source: string;
}

function rateToTenThousandths(rate: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,4}))?$/.exec(rate);
  if (!m) throw new RangeError(`bad rate: ${rate}`);
  return BigInt(m[1]!) * 10_000n + BigInt((m[2] ?? '').padEnd(4, '0'));
}

/**
 * Simple interest: amount x rate x days / 365, integer cents, half-up rounding once at the end
 * (TRD 5.1). Arithmetic only: whether a customer-facing amount may be shown is decided by
 * `interestStatement`, which withholds it while L-09 is open.
 */
export function simpleInterestCents(principalCents: number, annualRate: string, days: number): number {
  if (!Number.isSafeInteger(principalCents) || principalCents < 0) throw new RangeError('principal must be integer cents');
  if (!Number.isInteger(days) || days < 0) throw new RangeError('days must be a non-negative integer');
  const num = BigInt(principalCents) * rateToTenThousandths(annualRate) * BigInt(days);
  const den = 365n * 10_000n;
  const q = num / den;
  const rem = num % den;
  return Number(rem * 2n >= den ? q + 1n : q);
}

export type InterestStatement =
  | { status: 'withheld'; flags: string[]; reason: string }
  | { status: 'refused'; flags: string[]; reason: string };

/**
 * Interest statement for one CLK-16 portion. In B1 it can never produce an amount: the CLK-16 rule
 * row carries `pending_question = L-09` (which rate applies before any proceeding), so the amount
 * is withheld. It is refused outright when the due date is not `computed` or a trigger is
 * estimated (UT-14, MH-08).
 */
export function interestStatement(
  clk16: ClockResult,
  versions: RuleVersion[],
  events: EventFact[],
): InterestStatement {
  if (clk16.clockCode !== 'CLK-16') throw new Error('interestStatement needs a CLK-16 result');
  if (clk16.state !== 'computed' || clk16.statutoryDate === null) {
    return { status: 'refused', flags: clk16.flags, reason: 'Interest runs only from a computed due date (CLK-17)' };
  }
  const estimated = events.filter((e) => clk16.triggerEventIds.includes(e.id) && e.certainty !== 'confirmed');
  if (estimated.length > 0) {
    return { status: 'refused', flags: clk16.flags, reason: 'A trigger date is estimated; confirm it before an interest statement' };
  }
  const row = versions
    .find((v) => v.code === clk16.ruleVersionCode)
    ?.clocks.find((c) => c.clockCode === 'CLK-16');
  if (!row || row.pendingQuestion) {
    return {
      status: 'withheld',
      flags: [...new Set([...clk16.flags, row?.pendingQuestion ?? 'L-09'])],
      reason: `Interest amount withheld pending ${row?.pendingQuestion ?? 'L-09'}`,
    };
  }
  // Unreachable while every version carries L-09; kept explicit rather than computing silently.
  return { status: 'withheld', flags: clk16.flags, reason: 'No signed rate rule' };
}

export function interestDays(from: CivilDate, toInclusive: CivilDate): number {
  return daysBetween(from, toInclusive) + 1;
}
