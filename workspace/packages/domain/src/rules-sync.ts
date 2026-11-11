import { randomUUID } from 'node:crypto';
import { tables, type TenantDb } from '@payclock/db';
import { canonicalJson, HOLIDAY_SOURCE, ontarioHolidayRows, RULE_VERSIONS, sha256Hex, type RuleVersion } from '@payclock/rules';
import { drainPending, enqueueAllProjects, enqueueStale, type DrainReport } from './pending.ts';

/** Years the holiday table is loaded for: every year a seeded version can count in, with margin. */
export const HOLIDAY_YEARS: readonly number[] = Array.from({ length: 23 }, (_, i) => 2018 + i); // 2018-2040

export interface SyncReport {
  newRevisions: string[];
  approvedDiffering: string[];
  holidaysAdded: number;
  holidaysRemoved: number;
  /** Projects queued in the change's own transaction, plus stale ones found by the scan. */
  enqueued: number;
  recompute: DrainReport;
}

function contentHash(v: RuleVersion): string {
  return sha256Hex(canonicalJson({ family: v.family, jurisdiction: v.jurisdiction, effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo, legalSource: v.legalSource, clocks: v.clocks }));
}

/**
 * Bring the database rule tables and holiday table in line with the encoded rules (migrator
 * connection only), then recompute every stored deadline if anything changed (B1-005).
 * - A version whose content differs from the live row becomes a NEW draft revision; the old
 *   revision is retired, never edited, so deadlines keep pointing at the rows they were made from.
 * - An approved version is never touched; a difference is reported for the operator (T-4.3.8).
 * - Generated holiday rows not produced by the current rule are removed, missing ones added,
 *   operator-added rows (other sources, e.g. proclaimed days) kept; every change is audited.
 * - Any change recomputes every project of every tenant; each recompute writes a computation_run
 *   (cause rule_version or holiday_table) and an audit row.
 */
export async function syncDraftRules(admin: TenantDb, holidayYears: readonly number[] = HOLIDAY_YEARS, opts: { app?: TenantDb } = {}): Promise<SyncReport> {
  const correlationId = randomUUID();
  const report: SyncReport = { newRevisions: [], approvedDiffering: [], holidaysAdded: 0, holidaysRemoved: 0, enqueued: 0, recompute: { done: 0, failed: [], remaining: 0 } };
  await admin.withGlobalWrite(async (tx) => {
    for (const v of RULE_VERSIONS) {
      const hash = contentHash(v);
      const live = (await tx.raw.query<{ id: string; status: string; content_sha256: string | null }>(
        "select id, status, content_sha256 from rule_version where code = $1 and status <> 'retired'", [v.code])).rows[0];
      if (live && live.content_sha256 === hash) continue;
      if (live && live.status === 'approved') {
        report.approvedDiffering.push(v.code);
        continue;
      }
      if (live) await tx.raw.query("update rule_version set status = 'retired' where id = $1", [live.id]);
      const rev = (await tx.raw.query<{ n: number }>('select coalesce(max(revision), 0)::int + 1 as n from rule_version where code = $1', [v.code])).rows[0]!.n;
      const [row] = await tx
        .insert(tables.ruleVersion)
        .values({ code: v.code, revision: rev, contentSha256: hash, family: v.family, jurisdiction: v.jurisdiction, effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo, status: 'draft', legalSource: v.legalSource })
        .returning({ id: tables.ruleVersion.id });
      for (const c of v.clocks) {
        await tx.insert(tables.ruleClock).values({
          ruleVersionId: row!.id, clockCode: c.clockCode, variant: c.variant, triggerSpec: c.triggerSpec, pendingQuestion: c.pendingQuestion,
          offsetDays: c.offsetDays, windowEndDays: c.windowEndDays, extendOnHoliday: c.extendOnHoliday, actByBufferDays: c.actByBufferDays,
          sectionRef: c.sectionRef, computed: c.computed, notComputedReason: c.notComputedReason,
        });
      }
      await tx.raw.query(
        "insert into audit_event (tenant_id, actor_id, action, entity_type, entity_id, after_hash, correlation_id) values (null, null, 'rule_version.revision', 'rule_version', $1, decode($2, 'hex'), $3)",
        [row!.id, hash, correlationId],
      );
      report.newRevisions.push(`${v.code} r${rev}`);
    }

    for (const year of holidayYears) {
      const want = ontarioHolidayRows(year);
      const have = (await tx.raw.query<{ day: string; name: string; source: string }>(
        "select day, name, source from holiday where jurisdiction = 'ON' and extract(year from day) = $1", [year])).rows;
      for (const h of have) {
        const generated = h.source.startsWith('Legislation Act, 2006');
        if (generated && !want.some((w) => w.day === h.day)) {
          await tx.raw.query("delete from holiday where jurisdiction = 'ON' and day = $1", [h.day]);
          report.holidaysRemoved++;
        }
      }
      for (const w of want) {
        const r = await tx.raw.query(
          `insert into holiday (jurisdiction, day, name, source) values ($1, $2, $3, $4)
           on conflict (jurisdiction, day) do update set name = excluded.name, source = excluded.source
           where holiday.source <> excluded.source or holiday.name <> excluded.name
           returning (xmax = 0) as inserted`,
          [w.jurisdiction, w.day, w.name, HOLIDAY_SOURCE],
        );
        if (r.rows[0]?.inserted) report.holidaysAdded++;
      }
      await tx.raw.query("insert into holiday_coverage (jurisdiction, year, source) values ('ON', $1, $2) on conflict do nothing", [year, HOLIDAY_SOURCE]);
    }
    // The change, the generation bump and a pending-recompute row per project commit together.
    const rulesChanged = report.newRevisions.length > 0;
    const holidaysChanged = report.holidaysAdded + report.holidaysRemoved > 0;
    if (rulesChanged || holidaysChanged) {
      await tx.raw.query(
        "update rules_generation set rules_gen = rules_gen + $1, holiday_gen = holiday_gen + $2, changed_at = now() where jurisdiction = 'ON'",
        [rulesChanged ? 1 : 0, holidaysChanged ? 1 : 0],
      );
      report.enqueued += await enqueueAllProjects(tx, rulesChanged ? 'rule_version' : 'holiday_table');
    }
    // Anything left behind by an earlier failed or interrupted recompute is queued again.
    report.enqueued += await enqueueStale(tx);
    if (report.holidaysAdded || report.holidaysRemoved) {
      await tx.raw.query(
        "insert into audit_event (tenant_id, actor_id, action, entity_type, entity_id, after_hash, correlation_id) values (null, null, 'holiday_table.change', 'holiday', null, decode($1, 'hex'), $2)",
        [sha256Hex(`${report.holidaysAdded}+${report.holidaysRemoved}`), correlationId],
      );
    }
  });

  // Best effort here; the worker keeps draining until every row is done.
  report.recompute = await drainPending(opts.app ?? admin, correlationId);
  return report;
}

/**
 * Operator holiday change (s. 88(2) para. 12, a day proclaimed by the Governor General or
 * Lieutenant Governor): add or remove one row, audit it, and recompute every stored deadline.
 */
export async function changeProclaimedHoliday(
  admin: TenantDb,
  app: TenantDb,
  change: { day: string; name: string; source: string; remove?: boolean },
): Promise<DrainReport & { enqueued: number }> {
  if (change.source.startsWith('Legislation Act, 2006')) throw new Error('generated rows are managed by syncDraftRules');
  const correlationId = randomUUID();
  const enqueued = await admin.withGlobalWrite(async (tx) => {
    const r = change.remove
      ? await tx.raw.query("delete from holiday where jurisdiction = 'ON' and day = $1 and source = $2", [change.day, change.source])
      : await tx.raw.query("insert into holiday (jurisdiction, day, name, source) values ('ON', $1, $2, $3) on conflict do nothing", [change.day, change.name, change.source]);
    if (!r.rowCount) throw new Error('holiday change had no effect');
    await tx.raw.query(
      "insert into audit_event (tenant_id, actor_id, action, entity_type, entity_id, after_hash, correlation_id) values (null, null, $1, 'holiday', null, decode($2, 'hex'), $3)",
      [change.remove ? 'holiday.remove' : 'holiday.add', sha256Hex(`${change.day}|${change.source}`), correlationId],
    );
    await tx.raw.query("update rules_generation set holiday_gen = holiday_gen + 1, changed_at = now() where jurisdiction = 'ON'");
    return enqueueAllProjects(tx, 'holiday_table');
  });
  return { enqueued, ...(await drainPending(app, correlationId)) };
}

/** Queue every project durably, then drain (kept for operators and the reviewer's scripts). */
export async function recomputeAll(admin: TenantDb, app: TenantDb, cause: 'rule_version' | 'holiday_table', correlationId: string): Promise<DrainReport & { enqueued: number }> {
  const enqueued = await admin.withGlobalWrite((tx) => enqueueAllProjects(tx, cause));
  return { enqueued, ...(await drainPending(app, correlationId)) };
}
