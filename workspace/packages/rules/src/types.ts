import type { CivilDate } from './civil-date.ts';

export const EVENT_TYPES = [
  'EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10',
  'EV-11', 'EV-12', 'EV-13', 'EV-14', 'EV-15', 'EV-16', 'EV-17', 'EV-18', 'EV-19',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Which record an event belongs to. Fixed per type; the domain refuses any other scope. */
export const EVENT_SCOPE: Record<EventType, 'project' | 'subcontract' | 'invoice'> = {
  'EV-01': 'invoice', 'EV-02': 'invoice', 'EV-03': 'invoice', 'EV-04': 'invoice', 'EV-05': 'invoice',
  'EV-06': 'invoice', 'EV-07': 'subcontract', 'EV-08': 'project', 'EV-09': 'project',
  'EV-10': 'subcontract', 'EV-11': 'project', 'EV-12': 'project', 'EV-13': 'project',
  'EV-14': 'subcontract', 'EV-15': 'subcontract', 'EV-16': 'subcontract', 'EV-17': 'project',
  'EV-18': 'project', 'EV-19': 'project',
};

/** Event types that may occur more than once in one scope (distinguished by `seriesKey`). */
export const SERIES_EVENT_TYPES: ReadonlySet<EventType> = new Set(['EV-04', 'EV-05', 'EV-06', 'EV-14']);

export type Certainty = 'confirmed' | 'estimated' | 'unknown';
export type NoticeForm = '1.2' | '1.3';

/** One current (not superseded) fact. A recorded event with certainty `unknown` happened on a date
 * nobody knows; an event that is not recorded at all is treated as not having happened. */
export interface EventFact {
  id: string;
  type: EventType;
  /** invoice id for invoice-scope events; ignored otherwise. */
  invoiceId?: string | null;
  seriesKey?: string;
  occurredOn: CivilDate | null;
  /** EV-05 only: the day the sub received the notice. */
  receivedOn?: CivilDate | null;
  certainty: Certainty;
  /** EV-04: the part of this invoice's net amount the owner payment covers (null = all).
   *  EV-05: the amount the notice covers (null = all remaining). EV-06: amount received. */
  amountCents?: number | null;
  noticeForm?: NoticeForm | null;
}

export type ClockCode =
  | 'CLK-01' | 'CLK-02' | 'CLK-03' | 'CLK-04' | 'CLK-05' | 'CLK-06' | 'CLK-07' | 'CLK-08'
  | 'CLK-09' | 'CLK-10' | 'CLK-11' | 'CLK-12' | 'CLK-13' | 'CLK-14' | 'CLK-15' | 'CLK-16' | 'CLK-17';

export type LawyerFlag =
  | 'L-01' | 'L-02' | 'L-03' | 'L-04' | 'L-05' | 'L-06' | 'L-07' | 'L-08' | 'L-09' | 'L-10' | 'L-11';

/** Trigger specification stored in `rule_clock.trigger_spec`. It names event types explicitly;
 * there is no generic "termination" input. */
export type TriggerItem =
  | EventType
  | { termination_for_lien: { actual: 'EV-17'; published: 'EV-18'; in_time_days: number } };
export type TriggerSpec =
  | { trigger: EventType }
  | { earliest_of: TriggerItem[]; ceiling_if_unknown?: Partial<Record<EventType, EventType>> }
  | { derived_from: string[] }
  | { anniversary_of: EventType }
  | { window_from: EventType };

export interface RuleClock {
  clockCode: ClockCode;
  variant: string;
  triggerSpec: TriggerSpec;
  offsetDays: number;
  windowEndDays: number | null;
  extendOnHoliday: boolean;
  actByBufferDays: number;
  pendingQuestion: LawyerFlag | null;
  sectionRef: string;
  computed: boolean;
  notComputedReason: string | null;
}

export type RegimeFamily = 'ON-LEGACY' | 'ON-NOPP' | 'POST-2019';

export interface RuleVersion {
  code: string;
  family: RegimeFamily;
  jurisdiction: 'ON';
  effectiveFrom: CivilDate;
  effectiveTo: CivilDate | null;
  status: 'draft' | 'approved' | 'retired';
  signoffId: string | null;
  legalSource: string;
  clocks: RuleClock[];
}

export type ClockState = 'computed' | 'provisional' | 'not_computable' | 'not_applicable';
export type Bound = 'exact' | 'no_later_than';

export interface Withheld {
  output: 'extended_date' | 'interest_amount';
  question: LawyerFlag;
}

export interface ClockResult {
  clockCode: ClockCode;
  variant: string;
  /** null for subcontract-level (rights, holdback) clocks. */
  invoiceId: string | null;
  ruleVersionCode: string | null;
  sectionRef: string | null;
  state: ClockState;
  /** Payment duties: the holiday-extended day. Rights clocks: the un-extended day (L-09). */
  statutoryDate: CivilDate | null;
  bound: Bound;
  /** CLK-17: path A..H; CLK-05: branch a or b. */
  path: string | null;
  actByDate: CivilDate | null;
  windowEndDate: CivilDate | null;
  /** CLK-17 and CLK-16: the amount (integer cents) this portion covers. */
  amountCents: number | null;
  missingFacts: string[];
  flags: string[];
  withheld: Withheld[];
  triggerEventIds: string[];
  /** Trigger events whose certainty is `estimated`; shown wherever the date appears (MH-02). */
  estimatedEventIds: string[];
  notes: string[];
  suggestedActions: string[];
}

export interface ProjectFacts {
  premisesLeased: 'yes' | 'no' | 'unknown';
  leaseFirstEnteredOn: CivilDate | null;
  municipalInterest: 'yes' | 'no' | 'unknown';
}

export interface InvoiceFacts {
  id: string;
  amountCents: number;
  holdbackCents: number;
}

export interface ComputeInput {
  project: ProjectFacts;
  subcontract: { id: string; hasSubSubs: boolean | null };
  invoices: InvoiceFacts[];
  /** Current events of the project, the subcontract and its invoices. */
  events: EventFact[];
  ruleVersions: RuleVersion[];
  /** Holiday table rows for ON (days only); Sundays are always holidays. */
  holidays: readonly CivilDate[];
  /** Years the holiday table covers. A count or extension landing outside them is not computed
   * (B1-003). When omitted, the years that have at least one holiday row are taken as covered. */
  holidayYears?: readonly number[];
}

export interface ComputeOutput {
  engineVersion: string;
  regime: { family: RegimeFamily | null; missingFacts: string[]; flags: string[]; reason: string; estimatedEventIds: string[] };
  inputsHash: string;
  results: ClockResult[];
}
