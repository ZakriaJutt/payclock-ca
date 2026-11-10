import { addDays, civil, minDate, type CivilDate } from './civil-date.ts';
import { extendPastHolidays, isHoliday } from './holidays.ts';
import { selectRegime, type FactStatus, type RegimeResult } from './regime.ts';
import { canonicalJson, sha256Hex } from './sha256.ts';
import type {
  ClockCode, ClockResult, ComputeInput, ComputeOutput, EventFact, EventType, InvoiceFacts,
  RuleClock, RuleVersion, TriggerItem, TriggerSpec,
} from './types.ts';

export const ENGINE_VERSION = 'payclock-rules 0.1.0';

const DAY_2026_01_01 = civil('2026-01-01');
const RIGHTS_CLOCKS: ReadonlySet<ClockCode> = new Set(['CLK-09', 'CLK-10', 'CLK-11']);
const PAYMENT_CLOCKS: readonly ClockCode[] = [
  'CLK-01', 'CLK-02', 'CLK-03', 'CLK-04', 'CLK-05', 'CLK-06', 'CLK-07', 'CLK-08', 'CLK-17', 'CLK-16',
];

function blank(clockCode: ClockCode, variant: string, invoiceId: string | null): ClockResult {
  return {
    clockCode, variant, invoiceId, ruleVersionCode: null, sectionRef: null,
    state: 'not_computable', statutoryDate: null, bound: 'exact', path: null, actByDate: null,
    windowEndDate: null, amountCents: null, missingFacts: [], flags: [], withheld: [],
    triggerEventIds: [], estimatedEventIds: [], notes: [], suggestedActions: [],
  };
}

function uniq<T>(xs: Iterable<T>): T[] {
  return [...new Set(xs)];
}

interface Candidate {
  date: CivilDate;
  ids: string[];
  estimatedIds: string[];
  ceiling: boolean;
}

interface TriggerOutcome {
  candidates: Candidate[];
  missing: string[];
  flags: string[];
  notes: string[];
  notComputed: string | null;
}

class Engine {
  private readonly holidays: Set<string>;
  private readonly results: ClockResult[] = [];
  private regime!: RegimeResult;

  constructor(private readonly input: ComputeInput) {
    this.holidays = new Set(input.holidays);
  }

  // ---------- facts ----------

  private eventsOf(type: EventType, invoiceId: string | null = null): EventFact[] {
    return this.input.events
      .filter((e) => e.type === type && (invoiceId === null || e.invoiceId === invoiceId))
      .sort((a, b) => (a.seriesKey ?? 'main').localeCompare(b.seriesKey ?? 'main') || a.id.localeCompare(b.id));
  }

  private fact(type: EventType, invoiceId: string | null = null): FactStatus {
    const evs = this.eventsOf(type, invoiceId);
    const ev = evs.find((e) => (e.seriesKey ?? 'main') === 'main') ?? evs[0];
    return toStatus(ev);
  }

  // ---------- versions ----------

  private versionFor(governing: CivilDate | null): RuleVersion | null {
    const family = this.regime.family;
    if (family === null) return null;
    const candidates = this.input.ruleVersions.filter((v) => v.family === family && v.status !== 'retired');
    if (governing !== null) {
      const hit = candidates.find(
        (v) => v.effectiveFrom <= governing && (v.effectiveTo === null || governing <= v.effectiveTo),
      );
      if (hit) return hit;
      if (family === 'POST-2019') return null;
    }
    // No governing date (nothing to count from): latest version of the family, for traceability only.
    return [...candidates].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0] ?? null;
  }

  private row(version: RuleVersion | null, code: ClockCode, variant: string): RuleClock | null {
    return version?.clocks.find((c) => c.clockCode === code && c.variant === variant) ?? null;
  }

  /** Attach version and row; returns false when the row says "not computed". */
  private attach(r: ClockResult, version: RuleVersion | null, rowDef: RuleClock | null): boolean {
    if (version) {
      r.ruleVersionCode = version.code;
      if (version.status !== 'approved') r.flags.push('L-01');
    }
    if (!version || !rowDef) {
      r.state = 'not_computable';
      r.statutoryDate = null;
      r.bound = 'exact';
      r.actByDate = null;
      r.notes.push('No rule version covers this clock on its governing date; lawyer required');
      return false;
    }
    r.sectionRef = rowDef.sectionRef;
    if (!rowDef.computed) {
      r.state = 'not_computable';
      r.statutoryDate = null;
      r.bound = 'exact';
      r.actByDate = null;
      r.windowEndDate = null;
      r.notes.push(`Not computed: ${rowDef.notComputedReason ?? 'rule not encoded'}`);
      return false;
    }
    return true;
  }

  /** Count from a trigger day with the row's offset and its holiday rule. */
  private count(r: ClockResult, rowDef: RuleClock, trigger: CivilDate, offset = rowDef.offsetDays): CivilDate {
    const raw = addDays(trigger, offset);
    if (rowDef.extendOnHoliday) return extendPastHolidays(raw, this.holidays);
    if (rowDef.pendingQuestion && isHoliday(raw, this.holidays)) {
      // Rights clocks: the extended day depends on L-09 and is never output.
      r.withheld.push({ output: 'extended_date', question: rowDef.pendingQuestion });
      r.notes.push(`Last day falls on a holiday; may be one day later; ask your lawyer (${rowDef.pendingQuestion})`);
    }
    return raw;
  }

  private finishRights(r: ClockResult, rowDef: RuleClock): void {
    if (rowDef.pendingQuestion) r.flags.push(rowDef.pendingQuestion);
    if (r.state !== 'not_applicable') r.flags.push('L-04');
    if (r.statutoryDate && rowDef.actByBufferDays > 0) {
      r.actByDate = addDays(r.statutoryDate, -rowDef.actByBufferDays);
      r.notes.push(`Act-by date is ${rowDef.actByBufferDays} days before the last day; it is not statutory`);
    }
    if (r.bound === 'no_later_than') r.notes.push('No later than: may be earlier');
  }

  private push(r: ClockResult): ClockResult {
    r.flags = uniq(r.flags).sort();
    r.missingFacts = uniq(r.missingFacts);
    r.triggerEventIds = uniq(r.triggerEventIds).sort();
    r.estimatedEventIds = uniq(r.estimatedEventIds).sort();
    r.suggestedActions = uniq(r.suggestedActions);
    if (r.state !== 'computed' && r.state !== 'provisional') {
      r.statutoryDate = null;
      r.actByDate = null;
      r.windowEndDate = null;
      r.bound = 'exact';
    }
    this.results.push(r);
    return r;
  }

  // ---------- trigger evaluation ----------

  private simpleCandidate(type: EventType, out: TriggerOutcome, ceilingSource?: EventType): void {
    const f = this.fact(type);
    if (f.status === 'known') {
      out.candidates.push({ date: f.date, ids: [f.id], estimatedIds: f.estimated ? [f.id] : [], ceiling: false });
      return;
    }
    const ceiling = ceilingSource ? this.fact(ceilingSource) : ({ status: 'absent' } as FactStatus);
    // A recorded ceiling event implies the target happened (a notice of termination is published
    // "after a contract is terminated", s. 31(6)), so an absent target is then unknown, not absent.
    const occurredUnknown = f.status === 'unknown' || (ceilingSource !== undefined && ceiling.status !== 'absent');
    if (!occurredUnknown) return;
    out.missing.push(type);
    if (type === 'EV-17') {
      out.flags.push('L-11');
      out.notes.push('The actual termination date is missing and can only make this earlier');
    }
    if (ceiling.status === 'known') {
      const ids = f.status === 'unknown' ? [f.id, ceiling.id] : [ceiling.id];
      out.candidates.push({ date: ceiling.date, ids, estimatedIds: ceiling.estimated ? [ceiling.id] : [], ceiling: true });
    }
  }

  private terminationForLien(
    spec: { actual: 'EV-17'; published: 'EV-18'; in_time_days: number },
    out: TriggerOutcome,
  ): void {
    const actual = this.fact(spec.actual);
    const published = this.fact(spec.published);
    if (published.status === 'known' && published.date < DAY_2026_01_01) {
      out.flags.push('L-11');
      out.notComputed = 'Notice of termination published before 2026-01-01: the earlier s. 31(6)-(7) is not encoded (L-11)';
      return;
    }
    if (actual.status === 'known') {
      if (published.status === 'known') {
        const inTime = published.date >= actual.date && published.date <= addDays(actual.date, spec.in_time_days);
        if (inTime) {
          // s. 31(7): for s. 31 the termination date is the first publication date.
          out.candidates.push({
            date: published.date,
            ids: [actual.id, published.id],
            estimatedIds: [actual, published].flatMap((x) => (x.status === 'known' && x.estimated ? [x.id] : [])),
            ceiling: false,
          });
          return;
        }
        out.flags.push('L-11');
        out.notes.push('Form 8 not published within 7 days after termination: counted from the actual termination date');
        const date = minDate([actual.date, published.date]);
        out.candidates.push({ date, ids: [actual.id, published.id], estimatedIds: actual.estimated ? [actual.id] : [], ceiling: false });
        return;
      }
      out.flags.push('L-11');
      out.notes.push(
        published.status === 'unknown'
          ? 'Form 8 publication date unknown: counted from the actual termination date'
          : 'No Form 8 publication recorded: counted from the actual termination date',
      );
      out.candidates.push({ date: actual.date, ids: [actual.id], estimatedIds: actual.estimated ? [actual.id] : [], ceiling: false });
      return;
    }
    if (actual.status === 'unknown' || published.status !== 'absent') {
      out.missing.push('EV-17');
      out.flags.push('L-11');
      out.notes.push('The actual termination date is missing and can only make this earlier');
      if (published.status === 'known') {
        // Ceiling rule: publication is only an upper limit on the unknown termination date.
        const ids = actual.status === 'unknown' ? [actual.id, published.id] : [published.id];
        out.candidates.push({ date: published.date, ids, estimatedIds: published.estimated ? [published.id] : [], ceiling: true });
      }
    }
  }

  private evaluate(spec: TriggerSpec): TriggerOutcome {
    const out: TriggerOutcome = { candidates: [], missing: [], flags: [], notes: [], notComputed: null };
    if (!('earliest_of' in spec)) throw new Error('evaluate() handles earliest_of specs only');
    for (const item of spec.earliest_of as TriggerItem[]) {
      if (typeof item === 'string') this.simpleCandidate(item, out, spec.ceiling_if_unknown?.[item]);
      else this.terminationForLien(item.termination_for_lien, out);
    }
    return out;
  }

  /** Rights clock from an earliest-of trigger specification. */
  private rightsClock(code: 'CLK-09' | 'CLK-11', variant: string, extraMissing: string[], primary: EventType): ClockResult {
    const r = blank(code, variant, null);
    const specRow = this.row(this.versionFor(null), code, variant);
    if (!specRow) {
      this.attach(r, this.versionFor(null), null);
      return this.push(r);
    }
    const out = this.evaluate(specRow.triggerSpec);
    r.flags.push(...out.flags);
    r.notes.push(...out.notes);
    const missing = uniq([...out.missing, ...extraMissing]);
    if (out.notComputed) {
      const version = this.versionFor(null);
      this.attach(r, version, specRow);
      r.state = 'not_computable';
      r.missingFacts = missing;
      r.notes.push(out.notComputed);
      this.finishRights(r, specRow);
      return this.push(r);
    }
    if (out.candidates.length === 0) {
      const version = this.versionFor(null);
      this.attach(r, version, specRow);
      r.state = 'not_computable';
      r.missingFacts = missing.length > 0 ? missing : [primary];
      this.finishRights(r, specRow);
      return this.push(r);
    }
    const trigger = minDate(out.candidates.map((c) => c.date));
    const version = this.versionFor(trigger);
    const rowDef = this.row(version, code, variant);
    const winners = out.candidates.filter((c) => c.date === trigger);
    r.triggerEventIds = winners.flatMap((c) => c.ids);
    r.estimatedEventIds = winners.flatMap((c) => c.estimatedIds);
    r.missingFacts = missing;
    if (!this.attach(r, version, rowDef) || !rowDef) {
      if (rowDef) this.finishRights(r, rowDef);
      return this.push(r);
    }
    r.statutoryDate = this.count(r, rowDef, trigger);
    if (missing.length > 0) {
      r.state = 'provisional';
      r.bound = 'no_later_than';
    } else {
      r.state = 'computed';
      r.bound = 'exact';
    }
    this.finishRights(r, rowDef);
    return this.push(r);
  }

  // ---------- lien and adjudication ----------

  private lienClocks(): void {
    const ev08 = this.fact('EV-08');
    const ev19 = this.fact('EV-19');
    const ev07 = this.fact('EV-07');
    const certificate: 'none' | 'known' | 'unknown' =
      ev08.status === 'known' ? 'known' : ev08.status === 'absent' && ev19.status === 'absent' ? 'none' : 'unknown';

    let a: ClockResult;
    if (certificate === 'none') {
      a = blank('CLK-09', 'a', null);
      a.state = 'not_applicable';
      a.notes.push('No certificate or declaration of substantial performance recorded');
      this.attach(a, this.versionFor(null), this.row(this.versionFor(null), 'CLK-09', 'a'));
      a.state = 'not_applicable';
      this.push(a);
    } else if (certificate === 'unknown') {
      a = blank('CLK-09', 'a', null);
      const rowDef = this.row(this.versionFor(null), 'CLK-09', 'a');
      this.attach(a, this.versionFor(null), rowDef);
      a.state = 'not_computable';
      a.missingFacts = ev19.status === 'known' ? ['EV-08'] : ['EV-08', 'EV-19'];
      a.notes.push('Whether and when a certificate was published is unknown; see the lien date "no later than"');
      a.suggestedActions.push('s39_4_publication_request');
      if (rowDef) this.finishRights(a, rowDef);
      this.push(a);
    } else {
      a = this.rightsClock('CLK-09', 'a', [], 'EV-07');
    }

    let b: ClockResult;
    if (certificate === 'known' && ev19.status === 'known' && ev07.status === 'known' && ev07.date <= ev19.date) {
      b = blank('CLK-09', 'b', null);
      this.attach(b, this.versionFor(null), this.row(this.versionFor(null), 'CLK-09', 'b'));
      b.state = 'not_applicable';
      b.notes.push('All supply recorded on or before the date of substantial performance');
      this.push(b);
    } else {
      b = this.rightsClock('CLK-09', 'b', certificate === 'unknown' ? ['EV-08'] : [], 'EV-07');
      if (certificate === 'unknown') {
        b.notes.push('A certificate publication you have not seen can only make this earlier');
        b.suggestedActions.push('s39_4_publication_request');
      }
    }
    this.perfection(a, 'a');
    this.perfection(b, 'b');
  }

  /** CLK-10 counts from the un-extended CLK-09 day of the same lien (pending L-09). */
  private perfection(src: ClockResult, variant: string): void {
    const r = blank('CLK-10', variant, null);
    r.missingFacts = [...src.missingFacts];
    r.triggerEventIds = [...src.triggerEventIds];
    r.estimatedEventIds = [...src.estimatedEventIds];
    r.flags.push(...src.flags.filter((f) => f === 'L-11'));
    const version = src.ruleVersionCode
      ? (this.input.ruleVersions.find((v) => v.code === src.ruleVersionCode) ?? null)
      : this.versionFor(null);
    const rowDef = this.row(version, 'CLK-10', variant);
    const ok = this.attach(r, version, rowDef);
    if (src.state === 'not_applicable') {
      r.state = 'not_applicable';
      r.notes.push(`CLK-09${variant} does not apply`);
    } else if (!ok || !rowDef) {
      // attach() already recorded why.
    } else if (src.statutoryDate === null) {
      r.state = 'not_computable';
      r.notes.push(`CLK-09${variant} is not computable`);
    } else {
      r.statutoryDate = this.count(r, rowDef, src.statutoryDate);
      r.state = src.state;
      r.bound = src.bound;
    }
    if (rowDef) this.finishRights(r, rowDef);
    this.push(r);
  }

  private adjudication(): void {
    if (this.regime.family === 'ON-NOPP') {
      const r = blank('CLK-11', '', null);
      r.state = 'not_applicable';
      r.notes.push('Part II.1 (adjudication) does not apply to this contract (s. 87.3(4))');
      this.push(r);
      return;
    }
    this.rightsClock('CLK-11', '', [], 'EV-07');
  }

  // ---------- holdback ----------

  private holdback(): void {
    const ev11 = this.fact('EV-11');
    const form6 = blank('CLK-13', 'form6', null);
    {
      const governing = ev11.status === 'known' ? ev11.date : null;
      const version = this.versionFor(governing && governing >= DAY_2026_01_01 ? governing : DAY_2026_01_01);
      const rowDef = this.row(version, 'CLK-13', 'form6');
      if (this.attach(form6, version, rowDef) && rowDef) {
        if (ev11.status !== 'known') {
          form6.state = 'not_computable';
          form6.missingFacts = ['EV-11'];
        } else if (ev11.date < DAY_2026_01_01) {
          form6.state = 'not_computable';
          form6.flags.push('L-07');
          form6.notes.push('Contract entered into before 2026-01-01: s. 87.4(4) has two readings; no date until the lawyer chooses (L-07)');
        } else if (ev11.date.endsWith('-02-29')) {
          form6.state = 'not_computable';
          form6.flags.push('L-07');
          form6.notes.push('Contract dated 29 February: the anniversary in other years is not defined in the encoded rule');
        } else {
          const [y, rest] = [Number(ev11.date.slice(0, 4)), ev11.date.slice(4)];
          const anniversary = civil(`${(y + 1).toString().padStart(4, '0')}${rest}`);
          form6.statutoryDate = this.count(form6, rowDef, anniversary);
          form6.actByDate = form6.statutoryDate;
          form6.state = 'computed';
          form6.triggerEventIds = [ev11.id];
          if (ev11.estimated) form6.estimatedEventIds = [ev11.id];
          form6.notes.push('First contract anniversary; later anniversaries follow the same count');
        }
      }
    }
    this.push(form6);

    const pay = blank('CLK-13', 'pay', null);
    const ev13 = this.fact('EV-13');
    const governing = ev13.status === 'known' ? ev13.date : null;
    const version = this.versionFor(governing);
    const rowDef = this.row(version, 'CLK-13', 'pay');
    if (this.attach(pay, version, rowDef) && rowDef) {
      if (ev11.status === 'known' && ev11.date < DAY_2026_01_01) {
        pay.state = 'not_computable';
        pay.flags.push('L-07');
        pay.notes.push('Contract entered into before 2026-01-01: release timing depends on s. 87.4(4) (L-07)');
      } else if (ev13.status !== 'known') {
        pay.state = 'not_computable';
        pay.missingFacts = ['EV-13'];
      } else {
        pay.statutoryDate = this.count(pay, rowDef, ev13.date);
        pay.windowEndDate = this.count(pay, rowDef, ev13.date, rowDef.windowEndDays ?? rowDef.offsetDays);
        pay.actByDate = pay.windowEndDate;
        pay.state = 'computed';
        pay.triggerEventIds = [ev13.id];
        pay.notes.push('Owner pays at least 60 and not later than 74 days after publication');
      }
    }
    this.push(pay);

    const series = this.eventsOf('EV-14');
    const list = series.length > 0 ? series : [undefined];
    for (const ev of list) {
      const r = blank('CLK-14', ev && (ev.seriesKey ?? 'main') !== 'main' ? ev.seriesKey! : '', null);
      const f = toStatus(ev);
      this.simpleCount(r, f, 'EV-14');
      this.push(r);
    }
  }

  /** Single-trigger counterparty clock. */
  private simpleCount(r: ClockResult, f: FactStatus, type: EventType): void {
    if (f.status !== 'known') {
      const version = this.versionFor(null);
      this.attach(r, version, this.row(version, r.clockCode, r.variant === '' ? '' : this.rowVariant(r)));
      r.state = 'not_computable';
      r.missingFacts = [type];
      return;
    }
    const version = this.versionFor(f.date);
    const rowDef = this.row(version, r.clockCode, this.rowVariant(r));
    if (!this.attach(r, version, rowDef) || !rowDef) return;
    r.statutoryDate = this.count(r, rowDef, f.date);
    r.actByDate = r.statutoryDate;
    r.state = 'computed';
    r.triggerEventIds = [f.id];
    if (f.estimated) r.estimatedEventIds = [f.id];
  }

  /** Series clocks (CLK-03, CLK-06, CLK-07, CLK-14) share one rule row with variant ''. */
  private rowVariant(r: ClockResult): string {
    return ['CLK-03', 'CLK-06', 'CLK-07', 'CLK-14'].includes(r.clockCode) ? '' : r.variant;
  }

  // ---------- payment clocks ----------

  private notApplicableAll(invoiceId: string, note: string): void {
    for (const code of PAYMENT_CLOCKS) {
      const r = blank(code, '', invoiceId);
      r.state = 'not_applicable';
      r.notes.push(note);
      this.push(r);
    }
  }

  private paymentClocks(inv: InvoiceFacts): void {
    if (this.regime.family === 'ON-NOPP') {
      this.notApplicableAll(inv.id, 'Part I.1 (prompt payment) does not apply to this contract (s. 87.3(4))');
      return;
    }
    const id = inv.id;
    const ev01 = this.fact('EV-01', id);
    const ev02 = this.fact('EV-02', id);
    const ev03 = this.fact('EV-03', id);

    for (const [code, type] of [['CLK-01', 'EV-02'], ['CLK-02', 'EV-02'], ['CLK-04', 'EV-01']] as const) {
      const r = blank(code, '', id);
      this.simpleCount(r, type === 'EV-01' ? ev01 : ev02, type);
      this.push(r);
    }

    // CLK-05: (a) 7 days after the owner's Form 1.1; (b) without one, before the 35-day period expires.
    const clk05 = blank('CLK-05', '', id);
    if (ev03.status === 'known') {
      this.simpleCount(clk05, ev03, 'EV-03');
      clk05.path = 'a';
    } else if (ev03.status === 'unknown') {
      this.simpleCount(clk05, ev03, 'EV-03');
    } else if (ev01.status === 'known') {
      const version = this.versionFor(ev01.date);
      const rowDef = this.row(version, 'CLK-05', '');
      if (this.attach(clk05, version, rowDef) && rowDef) {
        clk05.statutoryDate = this.count(clk05, rowDef, ev01.date, 35);
        clk05.actByDate = clk05.statutoryDate;
        clk05.state = 'computed';
        clk05.path = 'b';
        clk05.triggerEventIds = [ev01.id];
        if (ev01.estimated) clk05.estimatedEventIds = [ev01.id];
      }
    } else {
      this.simpleCount(clk05, ev01, 'EV-01');
    }
    this.push(clk05);
    const clk05Date = clk05.state === 'computed' ? clk05.statutoryDate : null;

    // Within time: on or before the CLK-01 date; EV-01 stands in when EV-02 is unknown (provisional).
    let clk01Date: CivilDate | null = null;
    let clk01Proxy = false;
    {
      const basis = ev02.status === 'known' ? ev02 : ev01.status === 'known' ? ev01 : null;
      if (basis && basis.status === 'known') {
        const version = this.versionFor(basis.date);
        const rowDef = this.row(version, 'CLK-01', '');
        if (rowDef?.computed) {
          clk01Date = extendPastHolidays(addDays(basis.date, rowDef.offsetDays), this.holidays);
          clk01Proxy = ev02.status !== 'known';
        }
      }
    }

    const notices = this.eventsOf('EV-05', id).sort(
      (a, b) =>
        (a.occurredOn ?? a.receivedOn ?? '9999-12-31').localeCompare(b.occurredOn ?? b.receivedOn ?? '9999-12-31') ||
        (a.seriesKey ?? '').localeCompare(b.seriesKey ?? ''),
    );
    const timeliness = (n: EventFact): 'in' | 'late' | 'unknown' => {
      if (clk05Date === null) return 'unknown';
      if (n.occurredOn) return n.occurredOn <= clk05Date ? 'in' : 'late';
      if (n.receivedOn) return n.receivedOn <= clk05Date ? 'in' : 'late';
      return 'unknown';
    };

    const payments = this.eventsOf('EV-04', id);

    // CLK-03 per owner payment.
    if (payments.length === 0) {
      const r = blank('CLK-03', '', id);
      this.attach(r, this.versionFor(null), this.row(this.versionFor(null), 'CLK-03', ''));
      r.state = 'not_computable';
      r.missingFacts = ev01.status === 'known' || ev02.status === 'known' ? ['EV-04'] : ['EV-01', 'EV-04'];
      this.push(r);
    }
    for (const p of payments) {
      const r = blank('CLK-03', (p.seriesKey ?? 'main') === 'main' ? '' : p.seriesKey!, id);
      const f = toStatus(p);
      this.simpleCount(r, f, 'EV-04');
      if (r.state === 'computed' && f.status === 'known') {
        const afterForm12 = notices.some(
          (n) => n.noticeForm === '1.2' && timeliness(n) === 'in' && (n.occurredOn ?? n.receivedOn)! <= f.date,
        );
        if (clk01Date === null) {
          r.state = 'provisional';
          r.bound = 'no_later_than';
          r.missingFacts = ['EV-01'];
          r.notes.push('Whether the owner paid within the 28 days is unknown');
        } else if (f.date <= clk01Date) {
          if (clk01Proxy) {
            r.state = 'provisional';
            r.missingFacts = ['EV-02'];
          }
        } else if (afterForm12) {
          r.notes.push('Owner paid an amount that was the subject of a Form 1.2 (s. 6.5(8))');
        } else {
          r.state = 'not_applicable';
          r.notes.push('Owner paid after the 28 days: s. 6.5(1) does not apply; see CLK-17 path C');
        }
      }
      this.push(r);
    }

    // CLK-06 per Form 1.2.
    const form12 = notices.filter((n) => n.noticeForm === '1.2');
    if (form12.length === 0) {
      const r = blank('CLK-06', '', id);
      r.state = 'not_applicable';
      r.notes.push('No Form 1.2 recorded');
      this.push(r);
    }
    for (const n of form12) {
      const r = blank('CLK-06', (n.seriesKey ?? 'main') === 'main' ? '' : n.seriesKey!, id);
      const f: FactStatus = n.occurredOn
        ? { status: 'known', id: n.id, date: n.occurredOn, estimated: n.certainty === 'estimated' }
        : { status: 'unknown', id: n.id };
      this.simpleCount(r, f, 'EV-05');
      if (f.status !== 'known') r.notes.push('Day the Form 1.2 was given is unknown');
      this.push(r);
    }

    // CLK-07 and CLK-08: only when the sub has sub-subs.
    const subSubs = this.input.subcontract.hasSubSubs;
    const gate = (r: ClockResult): boolean => {
      if (subSubs === false) {
        r.state = 'not_applicable';
        r.notes.push('No sub-subcontractors recorded');
        this.push(r);
        return false;
      }
      if (subSubs === null) {
        r.state = 'not_computable';
        r.missingFacts = ['has_sub_subs'];
        this.push(r);
        return false;
      }
      return true;
    };
    const subPayments = this.eventsOf('EV-06', id);
    if (subPayments.length === 0) {
      const r = blank('CLK-07', '', id);
      if (gate(r)) {
        this.simpleCount(r, { status: 'absent' }, 'EV-06');
        this.push(r);
      }
    }
    for (const p of subPayments) {
      const r = blank('CLK-07', (p.seriesKey ?? 'main') === 'main' ? '' : p.seriesKey!, id);
      if (gate(r)) {
        this.simpleCount(r, toStatus(p), 'EV-06');
        this.push(r);
      }
    }
    {
      const r = blank('CLK-08', '', id);
      if (gate(r)) {
        this.simpleCount(r, ev01, 'EV-01');
        this.push(r);
      }
    }

    this.dueDate(inv, ev01, ev02, clk01Date, clk01Proxy, notices, timeliness, payments);
  }

  /** CLK-17 by the path table A to H (Decision.md 4.2.1), per amount; then CLK-16. */
  private dueDate(
    inv: InvoiceFacts,
    ev01: FactStatus,
    ev02: FactStatus,
    clk01Date: CivilDate | null,
    clk01Proxy: boolean,
    notices: EventFact[],
    timeliness: (n: EventFact) => 'in' | 'late' | 'unknown',
    payments: EventFact[],
  ): void {
    interface Portion {
      key: string;
      amount: number;
      kind: 'U' | 'D' | 'E' | 'F';
      noticeId?: string;
      noticeDate?: CivilDate | null;
      paid?: { id: string; date: CivilDate; estimated: boolean; withinTime: boolean | null };
      split: boolean;
    }
    const net = inv.amountCents - inv.holdbackCents;
    let remaining = net;
    const portions: Portion[] = [];
    for (const n of notices) {
      if (remaining <= 0) break;
      const amt = Math.min(n.amountCents ?? remaining, remaining);
      if (amt <= 0) continue;
      const t = timeliness(n);
      const kind = t === 'in' ? (n.noticeForm === '1.3' ? 'E' : 'D') : 'F';
      portions.push({ key: `n:${n.seriesKey ?? 'main'}`, amount: amt, kind, noticeId: n.id, noticeDate: n.occurredOn ?? n.receivedOn ?? null, split: false });
      remaining -= amt;
    }
    if (remaining > 0 || portions.length === 0) portions.push({ key: 'u', amount: Math.max(remaining, 0), kind: 'U', split: false });

    const unknownPayments = payments.filter((p) => p.occurredOn === null);
    const knownPayments = payments
      .filter((p) => p.occurredOn !== null)
      .sort((a, b) => a.occurredOn!.localeCompare(b.occurredOn!) || (a.seriesKey ?? '').localeCompare(b.seriesKey ?? ''));

    const allocate = (eligible: (p: Portion) => boolean, pay: EventFact, withinTime: boolean | null, budget: { left: number }) => {
      for (let i = 0; i < portions.length && budget.left > 0; i++) {
        const portion = portions[i]!;
        if (portion.paid || !eligible(portion)) continue;
        const take = Math.min(budget.left, portion.amount);
        const paid = { id: pay.id, date: pay.occurredOn!, estimated: pay.certainty === 'estimated', withinTime };
        if (take < portion.amount) {
          portions.splice(i + 1, 0, { ...portion, amount: portion.amount - take, split: true });
          portions[i] = { ...portion, key: `${portion.key}/paid:${pay.seriesKey ?? 'main'}`, amount: take, paid, split: true };
          i++;
        } else {
          portions[i] = { ...portion, key: portion.key === 'u' && portion.split ? `u/paid:${pay.seriesKey ?? 'main'}` : portion.key, paid };
        }
        budget.left -= take;
      }
    };

    for (const pay of knownPayments) {
      const budget = { left: pay.amountCents ?? Number.MAX_SAFE_INTEGER };
      const date = pay.occurredOn!;
      // s. 6.5(8): payment of an amount that was the subject of a Form 1.2 given in time.
      allocate((p) => p.kind === 'D' && p.noticeDate != null && p.noticeDate <= date, pay, null, budget);
      if (ev01.status !== 'known') {
        const within = clk01Date !== null && ev02.status === 'known' ? date <= clk01Date : null;
        allocate((p) => p.kind === 'U' || p.kind === 'F', pay, within, budget);
      } else if (clk01Date !== null && date <= clk01Date) {
        allocate((p) => p.kind === 'U' || p.kind === 'F', pay, true, budget);
      }
      // A late owner payment does not restart 7 days (s. 6.5(1) applies only within time): no allocation.
    }

    const single = portions.length === 1;
    const uPortions = portions.filter((p) => p.kind === 'U' || p.kind === 'F');
    for (const portion of portions) {
      const r = blank('CLK-17', single ? '' : portion.key, inv.id);
      r.amountCents = portion.amount;
      if (portion.noticeId) r.triggerEventIds.push(portion.noticeId);
      if (portion.kind === 'E') {
        this.attach(r, this.versionFor(portion.noticeDate ?? null), this.row(this.versionFor(portion.noticeDate ?? null), 'CLK-17', ''));
        r.state = 'not_applicable';
        r.path = 'E';
        r.flags.push('L-05');
        r.notes.push('Disputed by notice (Form 1.3, s. 6.5(6)): no due date; not overdue; no interest computed');
      } else if (portion.kind === 'D' && !portion.paid) {
        this.attach(r, this.versionFor(portion.noticeDate ?? null), this.row(this.versionFor(portion.noticeDate ?? null), 'CLK-17', ''));
        r.state = 'not_applicable';
        r.path = 'D';
        r.notes.push('Suspended by notice (Form 1.2, s. 6.5(5)): no due date while the owner has not paid; watch CLK-06');
      } else if (portion.paid) {
        const version = this.versionFor(portion.paid.date);
        const rowDef = this.row(version, 'CLK-03', '');
        if (this.attach(r, version, rowDef) && rowDef) {
          r.statutoryDate = this.count(r, rowDef, portion.paid.date);
          r.triggerEventIds.push(portion.paid.id);
          if (portion.paid.estimated) r.estimatedEventIds.push(portion.paid.id);
          if (portion.kind === 'D') {
            r.path = 'D';
            r.state = 'computed';
            r.notes.push('Owner paid the amount noticed in Form 1.2: 7 days after (s. 6.5(8))');
          } else if (ev01.status !== 'known' && portion.paid.withinTime !== true) {
            r.path = 'G';
            r.state = 'provisional';
            r.bound = 'no_later_than';
            r.missingFacts = ['EV-01'];
            r.notes.push("If the owner paid late, the contractor's invoice date to the owner gives an earlier day");
          } else {
            r.path = uPortions.length === 1 && !portion.split ? 'A' : 'B';
            r.state = clk01Proxy ? 'provisional' : 'computed';
            if (clk01Proxy) r.missingFacts = ['EV-02'];
          }
        }
      } else {
        // Unpaid, not noticed in time: path C from EV-01, or H when EV-01 is unknown.
        if (ev01.status !== 'known') {
          this.attach(r, this.versionFor(null), this.row(this.versionFor(null), 'CLK-17', ''));
          r.state = 'not_computable';
          r.path = 'H';
          r.missingFacts = ['EV-01'];
          r.notes.push("Not computable: contractor's invoice date to owner");
          r.suggestedActions.push('ev01_date_request');
        } else {
          const version = this.versionFor(ev01.date);
          const rowDef = this.row(version, 'CLK-04', '');
          if (this.attach(r, version, rowDef) && rowDef) {
            r.statutoryDate = this.count(r, rowDef, ev01.date);
            r.triggerEventIds.push(ev01.id);
            if (ev01.estimated) r.estimatedEventIds.push(ev01.id);
            r.path = 'C';
            r.state = clk01Proxy && knownPayments.length > 0 ? 'provisional' : 'computed';
            if (r.state === 'provisional') r.missingFacts = ['EV-02'];
          }
        }
      }
      if (portion.kind === 'F') {
        r.path = 'F';
        r.flags.push('L-05');
        r.notes.push('Notice given late or its timing is unknown: PayClock does not decide validity (L-05); interest statement blocked');
        if (r.state === 'computed') r.state = 'provisional';
      }
      if (unknownPayments.length > 0 && (r.state === 'computed' || r.state === 'provisional') && portion.kind !== 'D') {
        r.state = 'provisional';
        r.missingFacts = uniq([...r.missingFacts, 'EV-04']);
        r.notes.push('An owner payment with an unknown date is recorded');
      }
      if (r.statutoryDate) r.actByDate = r.statutoryDate;
      const due = this.push(r);
      this.interestStart(due, inv.id);
    }
  }

  /** CLK-16 exists only when its CLK-17 portion is `computed` (Decision.md 4.2.1). */
  private interestStart(due: ClockResult, invoiceId: string): void {
    const r = blank('CLK-16', due.variant, invoiceId);
    r.amountCents = due.amountCents;
    r.path = due.path;
    const version = due.ruleVersionCode
      ? (this.input.ruleVersions.find((v) => v.code === due.ruleVersionCode) ?? null)
      : this.versionFor(null);
    const rowDef = this.row(version, 'CLK-16', '');
    const ok = this.attach(r, version, rowDef);
    if (due.state === 'not_applicable') {
      r.state = 'not_applicable';
      r.notes.push('No due date, so no interest is computed');
      r.flags.push(...due.flags.filter((f) => f === 'L-05'));
    } else if (!ok || !rowDef) {
      // reason recorded by attach()
    } else if (due.state !== 'computed' || due.statutoryDate === null) {
      r.state = 'not_computable';
      r.missingFacts = [...due.missingFacts];
      r.flags.push(...due.flags.filter((f) => f === 'L-05'));
      r.notes.push('Interest starts only from a computed due date');
    } else {
      r.statutoryDate = this.count(r, rowDef, due.statutoryDate);
      r.state = 'computed';
      r.triggerEventIds = [...due.triggerEventIds];
      r.estimatedEventIds = [...due.estimatedEventIds];
    }
    if (rowDef?.pendingQuestion && r.state !== 'not_applicable') {
      r.flags.push(rowDef.pendingQuestion);
      r.withheld.push({ output: 'interest_amount', question: rowDef.pendingQuestion });
    }
    this.push(r);
  }

  // ---------- run ----------

  run(): ComputeOutput {
    this.regime = selectRegime(this.fact('EV-11'), this.fact('EV-12'), this.input.project);
    const regime = this.regime;
    if (regime.family === null || regime.family === 'ON-LEGACY') {
      this.unavailableEverywhere(regime);
    } else {
      this.lienClocks();
      this.adjudication();
      this.holdback();
      for (const inv of [...this.input.invoices].sort((a, b) => a.id.localeCompare(b.id))) this.paymentClocks(inv);
    }
    const results = this.results.sort(
      (a, b) =>
        (a.invoiceId ?? '').localeCompare(b.invoiceId ?? '') ||
        a.clockCode.localeCompare(b.clockCode) ||
        a.variant.localeCompare(b.variant),
    );
    return { engineVersion: ENGINE_VERSION, regime, inputsHash: inputsHash(this.input), results };
  }

  private unavailableEverywhere(regime: RegimeResult): void {
    const legacy = regime.family === 'ON-LEGACY';
    const legacyVersion = legacy ? this.input.ruleVersions.find((v) => v.family === 'ON-LEGACY') ?? null : null;
    const mk = (code: ClockCode, variant: string, invoiceId: string | null) => {
      const r = blank(code, variant, invoiceId);
      r.state = 'not_computable';
      r.missingFacts = [...regime.missingFacts];
      r.flags.push(...regime.flags);
      if (legacyVersion) {
        r.ruleVersionCode = legacyVersion.code;
        if (legacyVersion.status !== 'approved') r.flags.push('L-01');
      }
      r.notes.push(legacy ? `${regime.reason}: not computed; lawyer required (L-06)` : `Applicability unknown (${regime.reason}); lawyer required (L-06)`);
      if (RIGHTS_CLOCKS.has(code)) r.flags.push('L-04');
      this.push(r);
    };
    for (const [code, variant] of [['CLK-09', 'a'], ['CLK-09', 'b'], ['CLK-10', 'a'], ['CLK-10', 'b'], ['CLK-11', ''], ['CLK-13', 'form6'], ['CLK-13', 'pay'], ['CLK-14', '']] as const) {
      mk(code, variant, null);
    }
    for (const inv of this.input.invoices) for (const code of PAYMENT_CLOCKS) mk(code, '', inv.id);
  }
}

function toStatus(ev: EventFact | undefined): FactStatus {
  if (!ev) return { status: 'absent' };
  if (ev.occurredOn === null || ev.certainty === 'unknown') return { status: 'unknown', id: ev.id };
  return { status: 'known', id: ev.id, date: ev.occurredOn, estimated: ev.certainty === 'estimated' };
}

/** Hash of everything the result depends on; independent of input order and of event ids. */
export function inputsHash(input: ComputeInput): string {
  const events = input.events
    .map((e) => ({
      type: e.type,
      invoice: e.invoiceId ?? null,
      series: e.seriesKey ?? 'main',
      on: e.occurredOn,
      received: e.receivedOn ?? null,
      certainty: e.certainty,
      amount: e.amountCents ?? null,
      form: e.noticeForm ?? null,
    }))
    .map((e) => canonicalJson(e))
    .sort();
  const versions = input.ruleVersions.map((v) => canonicalJson(v)).sort();
  return sha256Hex(
    canonicalJson({
      engine: ENGINE_VERSION,
      project: input.project,
      subcontract: input.subcontract,
      invoices: [...input.invoices].map((i) => canonicalJson(i)).sort(),
      events,
      versions,
      holidays: [...input.holidays].sort(),
    }),
  );
}

export function compute(input: ComputeInput): ComputeOutput {
  return new Engine(input).run();
}
