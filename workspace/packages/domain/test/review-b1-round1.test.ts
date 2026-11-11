/** Permanent regressions for B1 round-1 review findings B1-005 (and B1-007 at the use-case layer). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addEvent, changeProclaimedHoliday, createInvoice, createProject, createSubcontract, getInvoice, getRecomputation, invariantCheck, syncDraftRules } from '@payclock/domain';
import { RULE_VERSIONS } from '@payclock/rules';
import { adminDb, appDb, seedTenant, type SeededTenant } from '../../../tests/helpers.ts';

const db = appDb();
const admin = adminDb();
let A: SeededTenant;
let invoiceId: string;

const deadline = async (clock: string, variant = '') =>
  (await db.withTenant(A.tenantId, (tx) => getInvoice(tx, A.viewer, invoiceId))).deadlines.find((d) => d.clock === clock && d.variant === variant)!;

beforeAll(async () => {
  A = await seedTenant(admin, 'Northline Electric Ltd.');
  await db.withTenant(A.tenantId, async (tx) => {
    const p = await createProject(tx, A.member, { name: 'Lakeshore Clinic Fit-out', contractor_name: 'Harbourgate Builders Inc.', premises_leased: 'no', municipal_interest: 'no' });
    await addEvent(tx, A.member, { scope_type: 'project', scope_id: p.id, type: 'EV-11', occurred_on: '2026-02-10', certainty: 'confirmed' });
    await addEvent(tx, A.member, { scope_type: 'project', scope_id: p.id, type: 'EV-12', occurred_on: '2025-11-03', certainty: 'confirmed' });
    const sc = await createSubcontract(tx, A.member, { project_id: p.id, has_sub_subs: false });
    const inv = await createInvoice(tx, A.member, { subcontract_id: sc.id, number: 'INV-1042', amount_cents: 4_800_000, holdback_cents: 480_000 });
    invoiceId = inv.id;
    await addEvent(tx, A.member, { scope_type: 'invoice', scope_id: inv.id, type: 'EV-01', occurred_on: '2026-06-29', certainty: 'confirmed' });
    await addEvent(tx, A.member, { scope_type: 'subcontract', scope_id: sc.id, type: 'EV-07', occurred_on: '2026-09-30', certainty: 'confirmed' });
  });
});
afterAll(async () => {
  await db.close();
  await admin.close();
});

describe('B1-005 rule and holiday changes recompute every stored deadline with an audit trail', () => {
  it('the database holiday table follows s. 88: no Civic Holiday; 2027-12-27 present; coverage 2018-2040', async () => {
    const r = await admin.pool.query("select day::text from holiday where day in ('2026-08-03', '2027-12-27') order by day");
    expect(r.rows.map((x) => x.day)).toEqual(['2027-12-27']);
    const c = await admin.pool.query('select min(year)::int as lo, max(year)::int as hi, count(*)::int as n from holiday_coverage');
    expect(c.rows[0]).toEqual({ lo: 2018, hi: 2040, n: 23 });
    expect((await deadline('CLK-17')).statutory_date).toBe('2026-08-03');
  });

  it('adding a proclaimed holiday on the due day moves CLK-17 to the next day; removing it moves it back', async () => {
    const source = 'Synthetic proclamation for a regression test';
    const added = await changeProclaimedHoliday(admin, db, { day: '2026-08-03', name: 'Synthetic proclaimed day', source });
    expect(added.written).toBeGreaterThanOrEqual(1);
    const moved = await deadline('CLK-17');
    expect(moved.statutory_date).toBe('2026-08-04');
    const diff = await db.withTenant(A.tenantId, (tx) => getRecomputation(tx, A.viewer, moved.computation_run_id));
    expect(diff.cause).toBe('holiday_table');
    expect(diff.changes.find((c) => c.clock === 'CLK-17')).toMatchObject({ old_date: '2026-08-03', new_date: '2026-08-04', movement: 'later' });
    await changeProclaimedHoliday(admin, db, { day: '2026-08-03', name: '', source, remove: true });
    expect((await deadline('CLK-17')).statutory_date).toBe('2026-08-03');
    const audit = await admin.pool.query("select action from audit_event where action in ('holiday.add', 'holiday.remove', 'recomputation.holiday_table') and (tenant_id is null or tenant_id = $1)", [A.tenantId]);
    expect(new Set(audit.rows.map((r) => r.action))).toEqual(new Set(['holiday.add', 'holiday.remove', 'recomputation.holiday_table']));
  });

  it('a changed rule row creates a new revision, retires the old one, and moves the stored deadline (no deadline left on the retired revision)', async () => {
    const row = RULE_VERSIONS.find((v) => v.code === 'ON-2026-01')!.clocks.find((c) => c.clockCode === 'CLK-09' && c.variant === 'b')!;
    expect((await deadline('CLK-09', 'b')).statutory_date).toBe('2026-11-29');
    row.offsetDays = 59; // simulated corrected rule row (reviewer case X-2)
    try {
      const rep = await syncDraftRules(admin, undefined, { app: db });
      expect(rep.newRevisions).toEqual(['ON-2026-01 r2']);
      expect(rep.recompute.failed).toEqual([]);
      const moved = await deadline('CLK-09', 'b');
      expect(moved.statutory_date).toBe('2026-11-28');
      const diff = await db.withTenant(A.tenantId, (tx) => getRecomputation(tx, A.viewer, moved.computation_run_id));
      expect(diff.cause).toBe('rule_version');
      const versions = await admin.pool.query("select revision, status from rule_version where code = 'ON-2026-01' order by revision");
      expect(versions.rows).toEqual([{ revision: 1, status: 'retired' }, { revision: 2, status: 'draft' }]);
      expect(await db.withTenant(A.tenantId, (tx) => invariantCheck(tx))).toEqual([]);
    } finally {
      row.offsetDays = 60;
    }
    const back = await syncDraftRules(admin, undefined, { app: db });
    expect(back.newRevisions).toEqual(['ON-2026-01 r3']);
    expect((await deadline('CLK-09', 'b')).statutory_date).toBe('2026-11-29');
    const again = await syncDraftRules(admin, undefined, { app: db });
    expect(again.newRevisions).toEqual([]);
    expect(again.recompute.projects).toBe(0);
  });

  it('the invariant reports a current deadline left on a retired revision', async () => {
    await admin.pool.query("update rule_version set status = 'retired' where code = 'ON-2026-01' and status = 'draft'");
    try {
      expect((await db.withTenant(A.tenantId, (tx) => invariantCheck(tx))).some((v) => v.includes('retired rule version'))).toBe(true);
    } finally {
      await admin.pool.query("update rule_version set status = 'draft' where code = 'ON-2026-01' and revision = (select max(revision) from rule_version where code = 'ON-2026-01')");
    }
  });
});

describe('B1-007 malformed identifiers are 422 at the use-case layer', () => {
  it('scope_id, invoice id and event id', async () => {
    await expect(db.withTenant(A.tenantId, (tx) => addEvent(tx, A.member, { scope_type: 'invoice', scope_id: 'not-a-uuid', type: 'EV-02', occurred_on: '2026-10-08', certainty: 'confirmed' }))).rejects.toMatchObject({ status: 422, fields: ['scope_id'] });
    await expect(db.withTenant(A.tenantId, (tx) => getInvoice(tx, A.viewer, 'x'))).rejects.toMatchObject({ status: 422 });
  });
});
