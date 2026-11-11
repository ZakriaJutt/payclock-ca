/**
 * Permanent regressions for B1-005 after the round-2 retest (`payclock-ca-b1-round2.md`): a rule
 * or holiday change commits together with a durable pending-recompute row per project; until the
 * recompute has run, reads show `recompute_pending` and never the old date; a later sync or the
 * worker finishes the work.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantDb } from '@payclock/db';
import { addEvent, changeProclaimedHoliday, createInvoice, createProject, createSubcontract, drainPending, enqueueStale, getInvoice, invariantCheck, syncDraftRules } from '@payclock/domain';
import { RULE_VERSIONS } from '@payclock/rules';
import { adminDb, appDb, seedTenant, type SeededTenant } from '../../../tests/helpers.ts';

const db = appDb();
const admin = adminDb();
/** A runtime connection that cannot connect: the recompute after the commit fails, as in a crash. */
const broken = () => new TenantDb('postgres://payclock_app:x@127.0.0.1:5999/payclock_test', 1);
let A: SeededTenant;
let invoiceId: string;
let projectId: string;

const view = async (clock: string, variant = '') =>
  (await db.withTenant(A.tenantId, (tx) => getInvoice(tx, A.viewer, invoiceId))).deadlines.find((d) => d.clock === clock && d.variant === variant)!;
const openRows = async () =>
  (await admin.pool.query('select cause, rules_gen, holiday_gen, attempts, last_error from recompute_pending where project_id = $1 and done_at is null', [projectId])).rows;

beforeAll(async () => {
  A = await seedTenant(admin, 'Northline Electric Ltd.');
  await db.withTenant(A.tenantId, async (tx) => {
    const p = await createProject(tx, A.member, { name: 'Lakeshore Clinic Fit-out', contractor_name: 'Harbourgate Builders Inc.', premises_leased: 'no', municipal_interest: 'no' });
    projectId = p.id;
    await addEvent(tx, A.member, { scope_type: 'project', scope_id: p.id, type: 'EV-11', occurred_on: '2026-02-10', certainty: 'confirmed' });
    await addEvent(tx, A.member, { scope_type: 'project', scope_id: p.id, type: 'EV-12', occurred_on: '2025-11-03', certainty: 'confirmed' });
    const sc = await createSubcontract(tx, A.member, { project_id: p.id, has_sub_subs: false });
    const inv = await createInvoice(tx, A.member, { subcontract_id: sc.id, number: 'INV-1042', amount_cents: 4_800_000, holdback_cents: 480_000 });
    invoiceId = inv.id;
    await addEvent(tx, A.member, { scope_type: 'invoice', scope_id: inv.id, type: 'EV-01', occurred_on: '2027-11-22', certainty: 'confirmed' });
    await addEvent(tx, A.member, { scope_type: 'subcontract', scope_id: sc.id, type: 'EV-07', occurred_on: '2027-10-28', certainty: 'confirmed' });
  });
  // Drain anything left by other test files so each case starts from a settled database.
  await syncDraftRules(admin, undefined, { app: db });
});
afterAll(async () => {
  await db.close();
  await admin.close();
});

describe('B1-005 durable recompute after rule and holiday changes', () => {
  it('starting point: CLK-17 2027-12-28, CLK-09b 2027-12-27, nothing pending', async () => {
    expect(await view('CLK-17')).toMatchObject({ state: 'computed', statutory_date: '2027-12-28' });
    expect(await view('CLK-09', 'b')).toMatchObject({ state: 'computed', statutory_date: '2027-12-27' });
    expect(await openRows()).toEqual([]);
  });

  it('N-6: rule change committed, recompute fails: the old (one day late) lien date is never shown; a later sync recomputes it', async () => {
    const row = RULE_VERSIONS.find((v) => v.code === 'ON-2026-01')!.clocks.find((c) => c.clockCode === 'CLK-09' && c.variant === 'b')!;
    row.offsetDays = 59;
    try {
      const bad = broken();
      const failed = await syncDraftRules(admin, undefined, { app: bad });
      await bad.close();
      expect(failed.newRevisions.length).toBe(1);
      expect(failed.recompute.failed.length).toBeGreaterThan(0);
      // The change and the pending row committed together.
      const rows = await openRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].cause).toBe('rule_version');
      const pending = await view('CLK-09', 'b');
      expect(pending).toMatchObject({ state: 'recompute_pending', statutory_date: null, act_by_date: null });
      expect(JSON.stringify(pending)).not.toContain('2027-12-27');
      expect((await view('CLK-17')).state).toBe('recompute_pending');
      expect(await db.withTenant(A.tenantId, (tx) => invariantCheck(tx))).toEqual([]); // stale but queued

      const later = await syncDraftRules(admin, undefined, { app: db });
      expect(later.newRevisions).toEqual([]);
      expect(later.recompute.done).toBeGreaterThanOrEqual(1);
      expect(await view('CLK-09', 'b')).toMatchObject({ state: 'computed', statutory_date: '2027-12-26' });
      expect(await openRows()).toEqual([]);
    } finally {
      row.offsetDays = 60;
      await syncDraftRules(admin, undefined, { app: db }); // restore the shared test database
    }
    expect(await view('CLK-09', 'b')).toMatchObject({ state: 'computed', statutory_date: '2027-12-27' });
  });

  it('N-1e: proclaimed holiday committed, recompute fails: CLK-17 is pending, and a later no-change sync gives 2027-12-29', async () => {
    const source = 'Synthetic proclamation, round-2 regression';
    const bad = broken();
    const r = await changeProclaimedHoliday(admin, bad, { day: '2027-12-28', name: 'Synthetic proclaimed day', source });
    await bad.close();
    expect(r.enqueued).toBeGreaterThanOrEqual(1);
    expect(r.failed.length).toBeGreaterThan(0);
    expect(await view('CLK-17')).toMatchObject({ state: 'recompute_pending', statutory_date: null });
    const later = await syncDraftRules(admin, undefined, { app: db });
    expect(later.newRevisions).toEqual([]);
    expect(later.holidaysAdded + later.holidaysRemoved).toBe(0);
    expect(later.recompute.done).toBeGreaterThanOrEqual(1);
    expect(await view('CLK-17')).toMatchObject({ state: 'computed', statutory_date: '2027-12-29' });
    await changeProclaimedHoliday(admin, db, { day: '2027-12-28', name: '', source, remove: true });
    expect(await view('CLK-17')).toMatchObject({ state: 'computed', statutory_date: '2027-12-28' });
  });

  it('crash between commit and recompute: the worker drain (no sync) finishes it, retrying until done', async () => {
    const source = 'Synthetic proclamation, crash regression';
    const bad = broken();
    await changeProclaimedHoliday(admin, bad, { day: '2027-12-28', name: 'Synthetic proclaimed day', source });
    await bad.close();
    expect(await view('CLK-17')).toMatchObject({ state: 'recompute_pending' });
    const bad2 = broken();
    const firstTry = await drainPending(bad2, '00000000-0000-4000-8000-000000000001');
    await bad2.close();
    expect(firstTry.done).toBe(0);
    expect((await openRows()).length).toBe(1); // still pending after a failed attempt
    const drained = await drainPending(db, '00000000-0000-4000-8000-000000000002');
    expect(drained.done).toBeGreaterThanOrEqual(1);
    expect(await view('CLK-17')).toMatchObject({ state: 'computed', statutory_date: '2027-12-29' });
    const again = await drainPending(db, '00000000-0000-4000-8000-000000000003');
    expect(again.done).toBe(0); // idempotent: nothing left
    await changeProclaimedHoliday(admin, db, { day: '2027-12-28', name: '', source, remove: true });
    expect(await view('CLK-17')).toMatchObject({ state: 'computed', statutory_date: '2027-12-28' });
  });

  it('a stale deadline whose pending row was lost is shown pending, flagged by the invariant, and re-queued by the scan', async () => {
    const source = 'Synthetic proclamation, lost-row regression';
    const bad = broken();
    await changeProclaimedHoliday(admin, bad, { day: '2027-12-28', name: 'Synthetic proclaimed day', source });
    await bad.close();
    await admin.pool.query('update recompute_pending set done_at = now() where project_id = $1 and done_at is null', [projectId]); // simulate a lost row
    expect(await view('CLK-17')).toMatchObject({ state: 'recompute_pending', statutory_date: null });
    expect((await db.withTenant(A.tenantId, (tx) => invariantCheck(tx))).some((v) => v.includes('not queued'))).toBe(true);
    // The worker's scan runs as the runtime role through a database function.
    expect(await db.withGlobalWrite((tx) => enqueueStale(tx))).toBeGreaterThanOrEqual(1);
    await drainPending(db, '00000000-0000-4000-8000-000000000004');
    expect(await view('CLK-17')).toMatchObject({ state: 'computed', statutory_date: '2027-12-29' });
    await changeProclaimedHoliday(admin, db, { day: '2027-12-28', name: '', source, remove: true });
  });
});
