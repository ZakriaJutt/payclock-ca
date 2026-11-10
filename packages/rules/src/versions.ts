import { civil } from './civil-date.ts';
import type { RuleClock, RuleVersion, TriggerSpec } from './types.ts';

/**
 * Rule versions as data (AD-03), transcribed from Decision.md sections 4.2 to 4.4, which record
 * the e-Laws consolidation [S: SRC-01]. These rows are seeded into `rule_version` / `rule_clock`
 * as status `draft`: no lawyer has signed any version (L-01), so every result carries L-01.
 * An approved version is never edited; a change in law is a new version.
 */

const TERMINATION_FOR_LIEN = {
  termination_for_lien: { actual: 'EV-17', published: 'EV-18', in_time_days: 7 },
} as const;

function row(
  clockCode: RuleClock['clockCode'],
  variant: string,
  triggerSpec: TriggerSpec,
  offsetDays: number,
  sectionRef: string,
  opts: Partial<RuleClock> = {},
): RuleClock {
  return {
    clockCode,
    variant,
    triggerSpec,
    offsetDays,
    windowEndDays: null,
    extendOnHoliday: true,
    actByBufferDays: 0,
    pendingQuestion: null,
    sectionRef,
    computed: true,
    notComputedReason: null,
    ...opts,
  };
}

const RIGHTS = { extendOnHoliday: false, actByBufferDays: 10, pendingQuestion: 'L-09' } as const;

function paymentClocks(computed: boolean, reason: string | null): RuleClock[] {
  const o = computed ? {} : { computed: false, notComputedReason: reason };
  return [
    row('CLK-01', '', { trigger: 'EV-02' }, 28, '6.4(1)', o),
    row('CLK-02', '', { trigger: 'EV-02' }, 14, '6.4(2)', o),
    row('CLK-03', '', { trigger: 'EV-04' }, 7, '6.5(1), (2), (8)', o),
    row('CLK-04', '', { trigger: 'EV-01' }, 35, '6.5(4)', o),
    row('CLK-05', '', { earliest_of: ['EV-03', 'EV-01'] }, 7, '6.5(5)-(7)', o),
    row('CLK-06', '', { trigger: 'EV-05' }, 21, '6.5(5)(a)(iii)', o),
    row('CLK-07', '', { trigger: 'EV-06' }, 7, '6.6(1), (2), (5)(a)', o),
    row('CLK-08', '', { trigger: 'EV-01' }, 42, '6.6(5)(b), (8)', o),
    row('CLK-16', '', { derived_from: ['CLK-17'] }, 1, '6.9', {
      ...o,
      extendOnHoliday: false,
      pendingQuestion: 'L-09',
    }),
    row('CLK-17', '', { derived_from: ['CLK-03', 'CLK-04', 'EV-05'] }, 0, '6.5(1)-(8)', o),
  ];
}

function lienClocks(computed: boolean, reason: string | null): RuleClock[] {
  const o = computed ? {} : { computed: false, notComputedReason: reason };
  return [
    row('CLK-09', 'a', { earliest_of: ['EV-08', 'EV-07', 'EV-09', TERMINATION_FOR_LIEN, 'EV-10'] }, 60, '31(3)(a), (4), (6), (7)', { ...RIGHTS, ...o }),
    row('CLK-09', 'b', { earliest_of: ['EV-07', 'EV-09', TERMINATION_FOR_LIEN, 'EV-10'] }, 60, '31(3)(b), (4), (6), (7)', { ...RIGHTS, ...o }),
    row('CLK-10', 'a', { derived_from: ['CLK-09a'] }, 90, '36(2)', { ...RIGHTS, ...o }),
    row('CLK-10', 'b', { derived_from: ['CLK-09b'] }, 90, '36(2)', { ...RIGHTS, ...o }),
  ];
}

function adjudicationClock(computed: boolean, reason: string | null): RuleClock {
  return row(
    'CLK-11',
    '',
    { earliest_of: ['EV-09', 'EV-17', 'EV-10', 'EV-07'], ceiling_if_unknown: { 'EV-17': 'EV-18' } },
    90,
    '13.5(3), (3.1)',
    { ...RIGHTS, ...(computed ? {} : { computed: false, notComputedReason: reason }) },
  );
}

function holdbackClocks(computed: boolean, reason: string | null): RuleClock[] {
  const o = computed ? {} : { computed: false, notComputedReason: reason };
  return [
    row('CLK-13', 'form6', { anniversary_of: 'EV-11' }, 14, '26(2)', o),
    row('CLK-13', 'pay', { window_from: 'EV-13' }, 60, '26(3)-(4)', { ...o, windowEndDays: 74 }),
    row('CLK-14', '', { trigger: 'EV-14' }, 14, '26(5), 26(8)', o),
  ];
}

const NOT_OPENED_2019 = 'Rule text of this period was not opened by the author; lawyer required';

export const RULE_VERSIONS: RuleVersion[] = [
  {
    code: 'ON-LEGACY',
    family: 'ON-LEGACY',
    jurisdiction: 'ON',
    effectiveFrom: civil('1990-01-01'),
    effectiveTo: civil('2018-06-30'),
    status: 'draft',
    signoffId: null,
    legalSource: 'Construction Act as it read on 2018-06-29 (s. 87.3(1)); not opened',
    clocks: [],
  },
  {
    code: 'ON-NOPP',
    family: 'ON-NOPP',
    jurisdiction: 'ON',
    effectiveFrom: civil('2018-07-01'),
    effectiveTo: null,
    status: 'draft',
    signoffId: null,
    legalSource: 'Construction Act s. 87.3(4): no Part I.1 or II.1; lien clocks as amended (SRC-01)',
    clocks: [
      ...lienClocks(true, null),
      ...holdbackClocks(false, 'Holdback rules for this regime not encoded; lawyer required (L-07)'),
    ],
  },
  {
    code: 'ON-2019-10',
    family: 'POST-2019',
    jurisdiction: 'ON',
    effectiveFrom: civil('2019-10-01'),
    effectiveTo: civil('2025-12-31'),
    status: 'draft',
    signoffId: null,
    legalSource: 'Construction Act ss. 6.2, 6.4-6.9 as in force 2019-10-01 to 2025-12-31 (SRC-01)',
    clocks: [
      ...paymentClocks(true, null),
      ...lienClocks(false, NOT_OPENED_2019),
      adjudicationClock(false, NOT_OPENED_2019),
      ...holdbackClocks(false, NOT_OPENED_2019),
    ],
  },
  {
    code: 'ON-2026-01',
    family: 'POST-2019',
    jurisdiction: 'ON',
    effectiveFrom: civil('2026-01-01'),
    effectiveTo: null,
    status: 'draft',
    signoffId: null,
    legalSource:
      'Construction Act, e-Laws consolidation from 2026-01-01 (2024, c. 20, Sched. 4; 2025, c. 14, Sched. 2) (SRC-01)',
    clocks: [...paymentClocks(true, null), ...lienClocks(true, null), adjudicationClock(true, null), ...holdbackClocks(true, null)],
  },
];
