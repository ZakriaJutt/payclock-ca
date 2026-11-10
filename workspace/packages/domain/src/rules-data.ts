import { and, asc, eq, tables, type Tx } from '@payclock/db';
import { civil, type CivilDate, type ClockCode, type LawyerFlag, type RuleVersion, type TriggerSpec } from '@payclock/rules';

export interface LoadedRules {
  versions: RuleVersion[];
  /** rule_clock.id by `${versionCode}|${clockCode}|${variant}` */
  clockIds: Map<string, string>;
  holidays: CivilDate[];
}

/** Rule versions and holidays as data from the database (AD-03); the engine receives them as input. */
export async function loadRules(tx: Tx): Promise<LoadedRules> {
  const versions = await tx.select().from(tables.ruleVersion).where(eq(tables.ruleVersion.jurisdiction, 'ON')).orderBy(asc(tables.ruleVersion.effectiveFrom));
  const clocks = await tx.select().from(tables.ruleClock);
  const holidays = await tx.select({ day: tables.holiday.day }).from(tables.holiday).where(and(eq(tables.holiday.jurisdiction, 'ON')));
  const clockIds = new Map<string, string>();
  const out: RuleVersion[] = versions.map((v) => ({
    code: v.code,
    family: v.family as RuleVersion['family'],
    jurisdiction: 'ON',
    effectiveFrom: civil(v.effectiveFrom),
    effectiveTo: v.effectiveTo ? civil(v.effectiveTo) : null,
    status: v.status,
    signoffId: v.signoffId,
    legalSource: v.legalSource,
    clocks: clocks
      .filter((c) => c.ruleVersionId === v.id)
      .map((c) => {
        clockIds.set(`${v.code}|${c.clockCode}|${c.variant}`, c.id);
        return {
          clockCode: c.clockCode as ClockCode,
          variant: c.variant,
          triggerSpec: c.triggerSpec as TriggerSpec,
          offsetDays: c.offsetDays,
          windowEndDays: c.windowEndDays,
          extendOnHoliday: c.extendOnHoliday,
          actByBufferDays: c.actByBufferDays,
          pendingQuestion: (c.pendingQuestion as LawyerFlag | null) ?? null,
          sectionRef: c.sectionRef,
          computed: c.computed,
          notComputedReason: c.notComputedReason,
        };
      })
      .sort((a, b) => `${a.clockCode}${a.variant}`.localeCompare(`${b.clockCode}${b.variant}`)),
  }));
  return { versions: out, clockIds, holidays: holidays.map((h) => civil(h.day)).sort() };
}
