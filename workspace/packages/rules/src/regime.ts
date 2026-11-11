import { addDays, civil, type CivilDate } from './civil-date.ts';
import type { ProjectFacts, RegimeFamily } from './types.ts';

/** Status of one fact: not recorded, recorded with an unknown date, or known. */
export type FactStatus =
  | { status: 'absent' }
  | { status: 'unknown'; id: string }
  | { status: 'known'; id: string; date: CivilDate; estimated: boolean };

const T_2018_07_01 = civil('2018-07-01');
const T_2018_12_06 = civil('2018-12-06');
const T_2019_10_01 = civil('2019-10-01');

export interface RegimeResult {
  family: RegimeFamily | null;
  missingFacts: string[];
  flags: string[];
  reason: string;
  /** Ids of estimated EV-11 / EV-12 events the regime rests on (B1-004). */
  estimatedEventIds: string[];
}

type CoreResult = Omit<RegimeResult, 'estimatedEventIds'>;

/**
 * How far an estimated EV-11 or EV-12 may be wrong for the purpose of regime selection
 * `[P]` (Decision.md 4.4): if any date within this many days either side of the estimate would
 * select a different regime, the regime is undecided (L-06) until the date is confirmed.
 */
export const ESTIMATE_REACH_DAYS = 365;
const BOUNDARIES = ['2018-07-01', '2018-12-06', '2019-10-01'].map(civil);

function alternatives(f: FactStatus): FactStatus[] {
  if (f.status !== 'known' || !f.estimated) return [f];
  const lo = addDays(f.date, -ESTIMATE_REACH_DAYS);
  const hi = addDays(f.date, ESTIMATE_REACH_DAYS);
  const days = new Set<CivilDate>([lo, f.date, hi]);
  for (const b of BOUNDARIES) {
    if (b >= lo && b <= hi) {
      days.add(b);
      days.add(addDays(b, -1));
    }
  }
  return [...days].map((date) => ({ ...f, date }));
}

/**
 * Transition regime from the prime-contract date (EV-11), the procurement start (EV-12) and the
 * premises facts (Decision.md 4.4, Construction Act s. 87.3). An unknown selecting fact that could
 * change the answer yields `family = null` with L-06: never a default (MH-03). The subcontract's
 * own date selects nothing.
 */
export function selectRegime(ev11: FactStatus, ev12: FactStatus, project: ProjectFacts): RegimeResult {
  const base = coreRegime(ev11, ev12, project);
  const estimated = [ev11, ev12].flatMap((f) => (f.status === 'known' && f.estimated ? [f.id] : []));
  if (estimated.length === 0) return { ...base, estimatedEventIds: [] };
  // The regime is a step function of each date with steps only at BOUNDARIES, so checking the
  // ends of the reach and both sides of every boundary inside it is exhaustive.
  for (const a of alternatives(ev11)) {
    for (const b of alternatives(ev12)) {
      if (coreRegime(a, b, project).family !== base.family) {
        const missing = [ev11.status === 'known' && ev11.estimated ? 'EV-11' : null, ev12.status === 'known' && ev12.estimated ? 'EV-12' : null].filter((x): x is string => x !== null);
        return {
          family: null,
          missingFacts: missing,
          flags: ['L-06'],
          reason: `applicability unknown: an estimated ${missing.join(' / ')} within ${ESTIMATE_REACH_DAYS} days of a transition date could select another regime; confirm the date`,
          estimatedEventIds: estimated,
        };
      }
    }
  }
  return { ...base, estimatedEventIds: estimated };
}

function coreRegime(ev11: FactStatus, ev12: FactStatus, project: ProjectFacts): CoreResult {
  // Municipal interest (s. 87.3(3)) only changes the legacy regime, which is never computed.
  const flags: string[] = [];
  if (ev11.status === 'known' && ev11.date < T_2018_07_01) {
    return { family: 'ON-LEGACY', missingFacts: [], flags: ['L-06'], reason: 's. 87.3(1)(a): contract before 2018-07-01' };
  }
  if (ev12.status === 'known' && ev12.date < T_2018_07_01) {
    return { family: 'ON-LEGACY', missingFacts: [], flags: ['L-06'], reason: 's. 87.3(1)(b): procurement before 2018-07-01' };
  }
  const missing: string[] = [];
  if (ev11.status !== 'known') missing.push('EV-11');
  if (ev12.status !== 'known') missing.push('EV-12');
  if (ev11.status !== 'known' || ev12.status !== 'known') {
    return { family: null, missingFacts: missing, flags: ['L-06'], reason: 'applicability unknown' };
  }
  const inLeaseWindow = (d: CivilDate) => d >= T_2018_07_01 && d < T_2018_12_06;
  if (inLeaseWindow(ev11.date) || inLeaseWindow(ev12.date)) {
    if (project.premisesLeased === 'unknown') {
      return { family: null, missingFacts: ['premises_leased'], flags: ['L-06'], reason: 'applicability unknown: leased premises' };
    }
    if (project.premisesLeased === 'yes') {
      if (project.leaseFirstEnteredOn === null) {
        return { family: null, missingFacts: ['lease_first_entered_on'], flags: ['L-06'], reason: 'applicability unknown: lease date' };
      }
      if (project.leaseFirstEnteredOn < T_2018_07_01) {
        return { family: 'ON-LEGACY', missingFacts: [], flags: ['L-06'], reason: 's. 87.3(1)(c): leasehold before 2018-07-01' };
      }
    }
  }
  if (ev11.date < T_2019_10_01 || ev12.date < T_2019_10_01) {
    return { family: 'ON-NOPP', missingFacts: [], flags, reason: 's. 87.3(4): contract or procurement before 2019-10-01' };
  }
  return { family: 'POST-2019', missingFacts: [], flags, reason: 'contract and procurement on or after 2019-10-01' };
}
