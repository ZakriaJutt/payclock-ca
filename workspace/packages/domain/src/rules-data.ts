import { and, asc, eq, ne, tables, type Tx } from '@payclock/db';
import { civil, type CivilDate, type ClockCode, type LawyerFlag, type RuleVersion, type TriggerSpec } from '@payclock/rules';

export interface LoadedRules {
  versions: RuleVersion[];
  /** rule_clock.id by `${versionCode}|${clockCode}|${variant}` */
  clockIds: Map<string, string>;
  holidays: CivilDate[];
  holidayYears: number[];
  /** Rule and holiday generation in force when these rules were read (B1-005). */
  gens: Gens;
}

export interface Gens {
  rulesGen: number;
  holidayGen: number;
}

export async function currentGens(tx: Tx): Promise<Gens> {
  const [g] = await tx.select().from(tables.rulesGeneration).where(eq(tables.rulesGeneration.jurisdiction, 'ON'));
  if (!g) throw new Error('rules_generation row missing');
  return { rulesGen: g.rulesGen, holidayGen: g.holidayGen };
}

/** Rule versions and holidays as data from the database (AD-03); the engine receives them as input. */
export async function loadRules(tx: Tx): Promise<LoadedRules> {
  const gens = await currentGens(tx);
  const versions = await tx.select().from(tables.ruleVersion).where(and(eq(tables.ruleVersion.jurisdiction, 'ON'), ne(tables.ruleVersion.status, 'retired'))).orderBy(asc(tables.ruleVersion.effectiveFrom));
  const clocks = await tx.select().from(tables.ruleClock);
  const holidays = await tx.select({ day: tables.holiday.day }).from(tables.holiday).where(eq(tables.holiday.jurisdiction, 'ON'));
  const coverage = await tx.select({ year: tables.holidayCoverage.year }).from(tables.holidayCoverage).where(eq(tables.holidayCoverage.jurisdiction, 'ON'));
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
  return { versions: out, clockIds, holidays: holidays.map((h) => civil(h.day)).sort(), holidayYears: coverage.map((c) => c.year).sort((a, b) => a - b), gens };
}
