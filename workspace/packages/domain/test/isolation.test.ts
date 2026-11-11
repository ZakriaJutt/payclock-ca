import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addEvent, correctEvent, createInvoice, createProject, createSubcontract, getInvoice, getRecomputation, recomputeBatch } from '@payclock/domain';
import { adminDb, appDb, seedTenant, type SeededTenant } from '../../../tests/helpers.ts';

const db = appDb();
const admin = adminDb();
let A: SeededTenant;
let B: SeededTenant;
let invA: string;
let projA: string;
let runA: string;
let ev07A: string;

const TENANT_TABLES = ['tenant', 'membership', 'project', 'subcontract', 'invoice', 'event', 'computation_run', 'deadline', 'flag', 'reminder', 'audit_event', 'api_idempotency', 'recompute_pending'];

beforeAll(async () => {
  A = await seedTenant(admin, 'Northline Electric Ltd.');
  B = await seedTenant(admin, 'Baycrest Mechanical Inc.');
  await db.withTenant(A.tenantId, async (tx) => {
    const p = await createProject(tx, A.owner, { name: 'Lakeshore Clinic Fit-out', contractor_name: 'Harbourgate Builders Inc.', premises_leased: 'no', municipal_interest: 'no' });
    projA = p.id;
    await addEvent(tx, A.owner, { scope_type: 'project', scope_id: p.id, type: 'EV-11', occurred_on: '2026-02-10', certainty: 'confirmed' });
    await addEvent(tx, A.owner, { scope_type: 'project', scope_id: p.id, type: 'EV-12', occurred_on: '2025-11-03', certainty: 'confirmed' });
    const sc = await createSubcontract(tx, A.owner, { project_id: p.id, has_sub_subs: false });
    const inv = await createInvoice(tx, A.owner, { subcontract_id: sc.id, number: 'INV-1042', amount_cents: 4_800_000, holdback_cents: 480_000 });
    invA = inv.id;
    const r = await addEvent(tx, A.owner, { scope_type: 'subcontract', scope_id: sc.id, type: 'EV-07', occurred_on: '2026-09-18', certainty: 'confirmed' });
    ev07A = r.event.id;
    runA = r.recomputation.runId;
  });
});
afterAll(async () => {
  await db.close();
  await admin.close();
});

describe('IT-01 tenant isolation (database and domain layers)', () => {
  it('the runtime role is not a superuser and cannot bypass row-level security', async () => {
    const r = await db.pool.query("select rolsuper, rolbypassrls from pg_roles where rolname = current_user");
    expect(current(r.rows[0])).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('reads without tenant context return zero rows from every tenant table', async () => {
    for (const t of TENANT_TABLES) {
      const r = await db.pool.query(`select count(*)::int as n from ${t}`);
      expect({ t, n: r.rows[0].n }).toEqual({ t, n: 0 });
    }
  });

  it('writes without tenant context fail', async () => {
    await expect(db.pool.query("insert into project (tenant_id, name, contractor_name) values ($1, 'x', 'y')", [A.tenantId])).rejects.toThrow(/row-level security/);
  });

  it('tenant B sees none of tenant A rows, and A data exists', async () => {
    for (const t of TENANT_TABLES.filter((x) => x !== 'tenant')) {
      const a = await db.withTenant(A.tenantId, async (tx) => (await tx.raw.query(`select count(*)::int as n from ${t} where tenant_id = $1`, [A.tenantId])).rows[0].n);
      const b = await db.withTenant(B.tenantId, async (tx) => (await tx.raw.query(`select count(*)::int as n from ${t} where tenant_id = $1`, [A.tenantId])).rows[0].n);
      expect({ t, b }).toEqual({ t, b: 0 });
      if (['project', 'invoice', 'event', 'deadline', 'audit_event'].includes(t)) expect(a).toBeGreaterThan(0);
    }
  });

  it('recompute_pending (round-3 hardening): FORCE RLS; an open row of A is invisible without context and to B, and B cannot write one for A', async () => {
    const flags = await admin.pool.query("select relrowsecurity, relforcerowsecurity from pg_class where relname = 'recompute_pending'");
    expect(flags.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    await admin.pool.query(
      "insert into recompute_pending (tenant_id, project_id, cause, rules_gen, holiday_gen, last_error) values ($1, $2, 'rule_version', 0, 0, 'synthetic error text') on conflict do nothing",
      [A.tenantId, projA],
    );
    try {
      expect((await db.pool.query('select count(*)::int as n from recompute_pending')).rows[0].n).toBe(0);
      expect((await db.pool.query('update recompute_pending set last_error = null')).rowCount).toBe(0);
      const seenByA = await db.withTenant(A.tenantId, async (tx) => (await tx.raw.query('select count(*)::int as n from recompute_pending where project_id = $1 and done_at is null', [projA])).rows[0].n);
      const seenByB = await db.withTenant(B.tenantId, async (tx) => (await tx.raw.query('select count(*)::int as n from recompute_pending where tenant_id = $1', [A.tenantId])).rows[0].n);
      expect({ seenByA, seenByB }).toEqual({ seenByA: 1, seenByB: 0 });
      await expect(
        db.withTenant(B.tenantId, (tx) => tx.raw.query("insert into recompute_pending (tenant_id, project_id, cause, rules_gen, holiday_gen) values ($1, $2, 'rule_version', 0, 0)", [A.tenantId, projA])),
      ).rejects.toThrow(/row-level security/);
      // The worker's cross-tenant queue functions return a count or identifiers only, never row text.
      const count = await db.pool.query('select open_recompute_pending_count() as n');
      expect(count.rows[0].n).toBeGreaterThanOrEqual(1);
      const fn = await admin.pool.query("select pg_get_function_result('claim_recompute_pending(integer)'::regprocedure) as r");
      expect(fn.rows[0].r).not.toContain('last_error');
    } finally {
      await admin.pool.query('update recompute_pending set done_at = now() where project_id = $1 and done_at is null', [projA]);
    }
  });

  it('tenant B cannot write a row carrying tenant A id', async () => {
    await expect(
      db.withTenant(B.tenantId, (tx) => tx.raw.query("insert into project (tenant_id, name, contractor_name) values ($1, 'x', 'y')", [A.tenantId])),
    ).rejects.toThrow(/row-level security/);
  });

  it('cross-tenant use cases answer "not found": invoice, recomputation, event correction, event on a foreign scope', async () => {
    await expect(db.withTenant(B.tenantId, (tx) => getInvoice(tx, B.owner, invA))).rejects.toMatchObject({ status: 404 });
    await expect(db.withTenant(B.tenantId, (tx) => getRecomputation(tx, B.owner, runA))).rejects.toMatchObject({ status: 404 });
    await expect(db.withTenant(B.tenantId, (tx) => correctEvent(tx, B.owner, ev07A, { occurred_on: '2026-09-01', certainty: 'confirmed', reason: 'x', expected_version: 1 }))).rejects.toMatchObject({ status: 404 });
    await expect(db.withTenant(B.tenantId, (tx) => addEvent(tx, B.owner, { scope_type: 'invoice', scope_id: invA, type: 'EV-01', occurred_on: '2026-10-08', certainty: 'confirmed' }))).rejects.toMatchObject({ status: 404 });
  });

  it('a batch job for tenant B naming tenant A project reads nothing and writes nothing', async () => {
    const out = await recomputeBatch(db, B.tenantId, projA, A.owner.correlationId);
    expect(out.status).toBe('discarded');
  });
});

function current(row: { rolsuper: boolean; rolbypassrls: boolean }) {
  return { rolsuper: row.rolsuper, rolbypassrls: row.rolbypassrls };
}

describe('IT-04 and IT-05 concurrency and ordering', () => {
  it('IT-04: two corrections of the same event at once: one succeeds, one gets 409 with the newer value', async () => {
    const attempt = (date: string) =>
      db.withTenant(A.tenantId, (tx) => correctEvent(tx, A.member, ev07A, { occurred_on: date, certainty: 'confirmed', reason: 'parallel', expected_version: 1 }));
    const results = await Promise.allSettled([attempt('2026-09-17'), attempt('2026-09-16')]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const bad = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    expect(bad[0]!.reason).toMatchObject({ status: 409, code: 'stale_version' });
    expect(bad[0]!.reason.details.current.version).toBe(2);
  });

  it('IT-05: batch reads fact version v, a correction commits v+1, the batch result is discarded; re-delivery writes once; duplicate is a no-op', async () => {
    const view = await db.withTenant(A.tenantId, (tx) => getInvoice(tx, A.viewer, invA));
    const ev07 = view.events.find((e) => e.type === 'EV-07' && !e.superseded)!;
    const outcome = await recomputeBatch(db, A.tenantId, projA, A.owner.correlationId, {
      afterRead: async () => {
        await db.withTenant(A.tenantId, (tx) => correctEvent(tx, A.member, ev07.id, { occurred_on: '2026-09-15', certainty: 'confirmed', reason: 'diary', expected_version: ev07.version }));
      },
    });
    expect(outcome.status).toBe('discarded');
    const after = await db.withTenant(A.tenantId, (tx) => getInvoice(tx, A.viewer, invA));
    expect(after.deadlines.find((d) => d.clock === 'CLK-09' && d.variant === 'b')!.statutory_date).toBe('2026-11-14');

    // Requeued delivery: facts unchanged, so nothing to write.
    expect((await recomputeBatch(db, A.tenantId, projA, A.owner.correlationId)).status).toBe('unchanged');
    expect((await recomputeBatch(db, A.tenantId, projA, A.owner.correlationId)).status).toBe('unchanged');
    const dup = await db.withTenant(A.tenantId, async (tx) =>
      (await tx.raw.query('select clock_code, variant, invoice_id, count(*)::int as n from deadline where is_current group by 1, 2, 3 having count(*) > 1')).rowCount,
    );
    expect(dup).toBe(0);
  });
});
