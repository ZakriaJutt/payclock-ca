import { civil, type CivilDate } from './civil-date.ts';
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
}

/**
 * Transition regime from the prime-contract date (EV-11), the procurement start (EV-12) and the
 * premises facts (Decision.md 4.4, Construction Act s. 87.3). An unknown selecting fact that could
 * change the answer yields `family = null` with L-06: never a default (MH-03). The subcontract's
 * own date selects nothing.
 */
export function selectRegime(ev11: FactStatus, ev12: FactStatus, project: ProjectFacts): RegimeResult {
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
