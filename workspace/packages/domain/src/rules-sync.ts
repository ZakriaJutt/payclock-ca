import { eq, tables, type TenantDb } from '@payclock/db';
import { HOLIDAY_SOURCE, ontarioHolidayRows, RULE_VERSIONS } from '@payclock/rules';

/**
 * Load the encoded rule versions as `draft` rows and the holiday table (migrator connection only).
 * Approved versions are never touched (the database trigger also refuses). A draft whose content
 * changed has its clocks replaced; drafting and approval by two different operators is T-4.3.8.
 */
export async function syncDraftRules(db: TenantDb, holidayYears: number[]): Promise<{ versions: number; holidays: number }> {
  return db.withGlobalWrite(async (tx) => {
    for (const v of RULE_VERSIONS) {
      const [existing] = await tx.select().from(tables.ruleVersion).where(eq(tables.ruleVersion.code, v.code));
      if (existing && existing.status !== 'draft') continue;
      let id = existing?.id;
      if (!id) {
        const [row] = await tx
          .insert(tables.ruleVersion)
          .values({ code: v.code, family: v.family, jurisdiction: v.jurisdiction, effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo, status: 'draft', legalSource: v.legalSource })
          .returning({ id: tables.ruleVersion.id });
        id = row!.id;
      } else {
        await tx.update(tables.ruleVersion).set({ family: v.family, effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo, legalSource: v.legalSource }).where(eq(tables.ruleVersion.id, id));
        const used = await tx.raw.query('select 1 from deadline d join rule_clock c on c.id = d.rule_clock_id where c.rule_version_id = $1 limit 1', [id]);
        if (used.rowCount) continue; // a draft already referenced by deadlines keeps its rows
        await tx.delete(tables.ruleClock).where(eq(tables.ruleClock.ruleVersionId, id));
      }
      for (const c of v.clocks) {
        await tx.insert(tables.ruleClock).values({
          ruleVersionId: id,
          clockCode: c.clockCode,
          variant: c.variant,
          triggerSpec: c.triggerSpec,
          pendingQuestion: c.pendingQuestion,
          offsetDays: c.offsetDays,
          windowEndDays: c.windowEndDays,
          extendOnHoliday: c.extendOnHoliday,
          actByBufferDays: c.actByBufferDays,
          sectionRef: c.sectionRef,
          computed: c.computed,
          notComputedReason: c.notComputedReason,
        });
      }
    }
    let holidays = 0;
    for (const y of holidayYears) {
      for (const h of ontarioHolidayRows(y)) {
        const r = await tx.raw.query(
          'insert into holiday (jurisdiction, day, name, source) values ($1, $2, $3, $4) on conflict do nothing',
          [h.jurisdiction, h.day, h.name, HOLIDAY_SOURCE],
        );
        holidays += r.rowCount ?? 0;
      }
    }
    return { versions: RULE_VERSIONS.length, holidays };
  });
}
