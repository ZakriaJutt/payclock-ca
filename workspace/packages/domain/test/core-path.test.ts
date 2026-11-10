import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addEvent, correctEvent, createInvoice, createProject, createSubcontract, DomainError, getInvoice, getRecomputation, invariantCheck } from '@payclock/domain';
import { adminDb, appDb, seedTenant, type SeededTenant } from '../../../tests/helpers.ts';

const db = appDb();
const admin = adminDb();
let A: SeededTenant;
let projectId: string;
let subcontractId: string;
let invoiceId: string;
let ev07Id: string;

async function project(t: SeededTenant) {
  return db.withTenant(t.tenantId, async (tx) => {
    const p = await createProject(tx, t.member, { name: 'Lakeshore Clinic Fit-out', contractor_name: 'Harbourgate Builders Inc.', premises_leased: 'no', municipal_interest: 'no' });
    await addEvent(tx, t.member, { scope_type: 'project', scope_id: p.id, type: 'EV-11', occurred_on: '2026-02-10', certainty: 'confirmed' });
    await addEvent(tx, t.member, { scope_type: 'project', scope_id: p.id, type: 'EV-12', occurred_on: '2025-11-03', certainty: 'confirmed' });
    const sc = await createSubcontract(tx, t.member, { project_id: p.id, reference: 'Electrical', has_sub_subs: true });
    const inv = await createInvoice(tx, t.member, { subcontract_id: sc.id, number: 'INV-1042', amount_cents: 4_800_000, holdback_cents: 480_000 });
    return { projectId: p.id, subcontractId: sc.id, invoiceId: inv.id };
  });
}

beforeAll(async () => {
  A = await seedTenant(admin, 'Northline Electric Ltd.');
  ({ projectId, subcontractId, invoiceId } = await project(A));
});
afterAll(async () => {
  await db.close();
  await admin.close();
});

const current = async (clock: string, variant = '') => {
  const view = await db.withTenant(A.tenantId, (tx) => getInvoice(tx, A.viewer, invoiceId));
  return view.deadlines.find((d) => d.clock === clock && d.variant === variant)!;
};

describe('core path: events, deadlines, corrections (T-4.1.1, T-4.2.1, T-4.2.2, T-4.2.3)', () => {
  it('unknown saves: EV-01 recorded as unknown; payment clocks not computable while lien clocks compute (MH-02, MH-04)', async () => {
    await db.withTenant(A.tenantId, async (tx) => {
      await addEvent(tx, A.member, { scope_type: 'invoice', scope_id: invoiceId, type: 'EV-01', occurred_on: null, certainty: 'unknown' });
      const r = await addEvent(tx, A.member, { scope_type: 'subcontract', scope_id: subcontractId, type: 'EV-07', occurred_on: '2026-09-30', certainty: 'confirmed' });
      ev07Id = r.event.id;
    });
    expect(await current('CLK-17')).toMatchObject({ state: 'not_computable', path: 'H', missing_facts: ['EV-01'], label: 'not computable' });
    expect(await current('CLK-09', 'b')).toMatchObject({ state: 'computed', statutory_date: '2026-11-29', act_by_date: '2026-11-19' });
  });

  it('an event type is validated against its scope; a duplicate fact must be corrected, not re-added', async () => {
    await expect(db.withTenant(A.tenantId, (tx) => addEvent(tx, A.member, { scope_type: 'project', scope_id: projectId, type: 'EV-07', occurred_on: '2026-09-30', certainty: 'confirmed' }))).rejects.toMatchObject({ status: 422 });
    await expect(db.withTenant(A.tenantId, (tx) => addEvent(tx, A.member, { scope_type: 'subcontract', scope_id: subcontractId, type: 'EV-07', occurred_on: '2026-09-29', certainty: 'confirmed' }))).rejects.toMatchObject({ status: 409 });
    await expect(db.withTenant(A.tenantId, (tx) => addEvent(tx, A.member, { scope_type: 'project', scope_id: projectId, type: 'EV-17', occurred_on: '2026-09-10', certainty: 'unknown' }))).rejects.toMatchObject({ status: 422 });
  });

  it('duplicate invoice number returns 409 (T-4.1.1)', async () => {
    await expect(db.withTenant(A.tenantId, (tx) => createInvoice(tx, A.member, { subcontract_id: subcontractId, number: 'INV-1042', amount_cents: 1 }))).rejects.toMatchObject({ status: 409, code: 'duplicate_invoice' });
  });

  it('correction needs a reason (422) and the right expected_version (409)', async () => {
    await expect(db.withTenant(A.tenantId, (tx) => correctEvent(tx, A.member, ev07Id, { occurred_on: '2026-09-18', certainty: 'confirmed', reason: ' ', expected_version: 1 }))).rejects.toMatchObject({ status: 422 });
    await expect(db.withTenant(A.tenantId, (tx) => correctEvent(tx, A.member, ev07Id, { occurred_on: '2026-09-18', certainty: 'confirmed', reason: 'site diary', expected_version: 7 }))).rejects.toMatchObject({ status: 409 });
  });

  it('viewer cannot correct (403, IT-02 part)', async () => {
    await expect(db.withTenant(A.tenantId, (tx) => correctEvent(tx, A.viewer, ev07Id, { occurred_on: '2026-09-18', certainty: 'confirmed', reason: 'x', expected_version: 1 }))).rejects.toBeInstanceOf(DomainError);
    await expect(db.withTenant(A.tenantId, (tx) => correctEvent(tx, A.viewer, ev07Id, { occurred_on: '2026-09-18', certainty: 'confirmed', reason: 'x', expected_version: 1 }))).rejects.toMatchObject({ status: 403 });
  });

  it('IT-03: a fault after the deadlines insert leaves event, deadlines, reminders and audit unchanged', async () => {
    const snapshot = () =>
      admin.withGlobalWrite(async (tx) => {
        const q = async (sql: string) => (await tx.raw.query(sql, [A.tenantId])).rows;
        return JSON.stringify({
          events: await q('select id, superseded_at from event where tenant_id = $1 order by id'),
          deadlines: await q('select id, is_current from deadline where tenant_id = $1 order by id'),
          reminders: await q('select id, status from reminder where tenant_id = $1 order by id'),
          audit: await q('select count(*) from audit_event where tenant_id = $1'),
          runs: await q('select count(*) from computation_run where tenant_id = $1'),
        });
      });
    const before = await snapshot();
    await expect(
      db.withTenant(A.tenantId, (tx) =>
        correctEvent(tx, A.member, ev07Id, { occurred_on: '2026-09-18', certainty: 'confirmed', reason: 'site diary', expected_version: 1 }, () => {
          throw new Error('injected fault');
        }),
      ),
    ).rejects.toThrow('injected fault');
    expect(await snapshot()).toBe(before);
    expect(await current('CLK-09', 'b')).toMatchObject({ statutory_date: '2026-11-29' });
  });

  it('Decision 4.5 / TRD 6.2: EV-07 corrected 2026-09-30 -> 2026-09-18 recomputes CLK-09, CLK-10, CLK-11 in one transaction', async () => {
    const res = await db.withTenant(A.tenantId, (tx) => correctEvent(tx, A.member, ev07Id, { occurred_on: '2026-09-18', certainty: 'confirmed', reason: 'site diary', expected_version: 1 }));
    expect(await current('CLK-09', 'b')).toMatchObject({ statutory_date: '2026-11-17', act_by_date: '2026-11-07' });
    expect(await current('CLK-10', 'b')).toMatchObject({ statutory_date: '2027-02-15' });
    expect(await current('CLK-11')).toMatchObject({ statutory_date: '2026-12-17' });
    const diff = await db.withTenant(A.tenantId, (tx) => getRecomputation(tx, A.viewer, res.recomputation.runId));
    expect(diff.cause).toBe('correction');
    expect(diff.changes[0]).toMatchObject({ clock: 'CLK-09', movement: 'earlier', old_date: '2026-11-29', new_date: '2026-11-17', rule_version: 'ON-2026-01' });
    expect(diff.changes.find((c) => c.clock === 'CLK-11')).toMatchObject({ old_date: '2026-12-29', new_date: '2026-12-17' });
    expect(diff.changes.find((c) => c.clock === 'CLK-10' && c.variant === 'b')).toMatchObject({ old_date: '2027-02-27', new_date: '2027-02-15' });

    // History stays readable; reminders of superseded deadlines are cancelled; an urgent reminder exists.
    const view = await db.withTenant(A.tenantId, (tx) => getInvoice(tx, A.viewer, invoiceId));
    const ev07s = view.events.filter((e) => e.type === 'EV-07');
    expect(ev07s.map((e) => [e.version, e.superseded, e.occurred_on])).toEqual([[1, true, '2026-09-30'], [2, false, '2026-09-18']]);
    const r = await admin.withGlobalWrite(async (tx) => (await tx.raw.query(
      `select d.is_current, r.kind, r.status from reminder r join deadline d on d.id = r.deadline_id
       where r.tenant_id = $1 and d.clock_code = 'CLK-09' and d.variant = 'b'`, [A.tenantId])).rows);
    expect(r.filter((x) => !x.is_current).every((x) => x.status === 'cancelled')).toBe(true);
    expect(r.some((x) => x.is_current && x.kind === 'urgent_moved_earlier' && x.status === 'scheduled')).toBe(true);
    const inv = await db.withTenant(A.tenantId, (tx) => invariantCheck(tx));
    expect(inv).toEqual([]);
  });

  it('Decision 4.5: EV-01 unknown -> 2026-10-01 estimated -> confirmed 2026-10-08 moves CLK-17 2026-11-05 -> 2026-11-12', async () => {
    const view = await db.withTenant(A.tenantId, (tx) => getInvoice(tx, A.viewer, invoiceId));
    const ev01 = view.events.find((e) => e.type === 'EV-01' && !e.superseded)!;
    await db.withTenant(A.tenantId, (tx) => correctEvent(tx, A.member, ev01.id, { occurred_on: '2026-10-01', certainty: 'estimated', reason: 'estimate from site meeting', expected_version: 1 }));
    expect(await current('CLK-17')).toMatchObject({ path: 'C', statutory_date: '2026-11-05' });
    const v2 = (await db.withTenant(A.tenantId, (tx) => getInvoice(tx, A.viewer, invoiceId))).events.find((e) => e.type === 'EV-01' && !e.superseded)!;
    const res = await db.withTenant(A.tenantId, (tx) => correctEvent(tx, A.member, v2.id, { occurred_on: '2026-10-08', certainty: 'confirmed', reason: 'contractor confirmed', expected_version: 2 }));
    expect(await current('CLK-17')).toMatchObject({ statutory_date: '2026-11-12' });
    expect(await current('CLK-16')).toMatchObject({ statutory_date: '2026-11-13' });
    const diff = await db.withTenant(A.tenantId, (tx) => getRecomputation(tx, A.viewer, res.recomputation.runId));
    expect(diff.changes.find((c) => c.clock === 'CLK-17')).toMatchObject({ old_date: '2026-11-05', new_date: '2026-11-12', movement: 'later' });
  });

  it('UT-15 through the database: EV-17 unknown with EV-18 2026-09-15 stores CLK-11 "no later than 2026-12-14"', async () => {
    await db.withTenant(A.tenantId, async (tx) => {
      await addEvent(tx, A.member, { scope_type: 'project', scope_id: projectId, type: 'EV-17', occurred_on: null, certainty: 'unknown' });
      await addEvent(tx, A.member, { scope_type: 'project', scope_id: projectId, type: 'EV-18', occurred_on: '2026-09-15', certainty: 'confirmed' });
    });
    // EV-07 is 2026-09-18 here, so the ceiling (2026-09-15 + 90) governs.
    expect(await current('CLK-11')).toMatchObject({ state: 'provisional', bound: 'no_later_than', statutory_date: '2026-12-14', label: 'no later than 2026-12-14' });
    expect((await current('CLK-11')).missing_facts).toContain('EV-17');
  });

  it('events and deadlines cannot be edited or deleted in place (database triggers)', async () => {
    await expect(admin.withGlobalWrite((tx) => tx.raw.query("update event set occurred_on = '2026-01-01' where id = $1", [ev07Id]))).rejects.toThrow(/append-only/);
    await expect(admin.withGlobalWrite((tx) => tx.raw.query('delete from event where id = $1', [ev07Id]))).rejects.toThrow(/never deleted/);
    await expect(admin.withGlobalWrite((tx) => tx.raw.query("update deadline set statutory_date = '2030-01-01' where tenant_id = $1", [A.tenantId]))).rejects.toThrow(/superseded/);
    await expect(admin.withGlobalWrite((tx) => tx.raw.query('delete from audit_event where tenant_id = $1', [A.tenantId]))).rejects.toThrow(/insert-only/);
  });

  it('every write is audited with the correlation id', async () => {
    const rows = await admin.withGlobalWrite(async (tx) => (await tx.raw.query('select action, correlation_id from audit_event where tenant_id = $1', [A.tenantId])).rows);
    const actions = new Set(rows.map((r) => r.action));
    for (const a of ['project.create', 'subcontract.create', 'invoice.create', 'event.create', 'event.correct', 'recomputation']) expect(actions).toContain(a);
    expect(rows.some((r) => r.correlation_id === A.member.correlationId)).toBe(true);
  });
});
