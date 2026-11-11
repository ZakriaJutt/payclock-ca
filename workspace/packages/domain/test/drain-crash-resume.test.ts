/**
 * Round-3 hardening (`payclock-ca-b1-round3.md` section 5): a real worker process is killed with
 * SIGKILL in the middle of a pending-recompute drain, once inside a recompute (after its read,
 * before its write) and once between rows (later rows claimed but untouched). While the queue is
 * half-drained no read shows a date computed under the superseded rule; the next drain resumes,
 * finishes every row, and leaves no current deadline on a superseded generation or retired rule.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantDb } from '@payclock/db';
import { addEvent, createInvoice, createProject, createSubcontract, drainPending, getInvoice, invariantCheck, syncDraftRules } from '@payclock/domain';
import { RULE_VERSIONS } from '@payclock/rules';
import { adminDb, appDb, seedTenant, type SeededTenant } from '../../../tests/helpers.ts';

const db = appDb();
const admin = adminDb();
const workspace = resolve(new URL('../../..', import.meta.url).pathname);
const child = resolve(new URL('./fixtures/drain-child.ts', import.meta.url).pathname);
/** Runtime connection that cannot connect: the sync commits the change and its pending rows, nothing drains. */
const broken = () => new TenantDb('postgres://payclock_app:x@127.0.0.1:5999/payclock_test', 1);
const clk09b = RULE_VERSIONS.find((v) => v.code === 'ON-2026-01')!.clocks.find((c) => c.clockCode === 'CLK-09' && c.variant === 'b')!;

interface Seeded { tenant: SeededTenant; invoiceId: string; projectId: string }
const seeded: Seeded[] = [];
let tenants: SeededTenant[] = [];

async function seedProjects(t: SeededTenant, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await db.withTenant(t.tenantId, async (tx) => {
      const p = await createProject(tx, t.member, { name: `Synthetic site ${i + 1}`, contractor_name: 'Harbourgate Builders Inc.', premises_leased: 'no', municipal_interest: 'no' });
      await addEvent(tx, t.member, { scope_type: 'project', scope_id: p.id, type: 'EV-11', occurred_on: '2026-02-10', certainty: 'confirmed' });
      await addEvent(tx, t.member, { scope_type: 'project', scope_id: p.id, type: 'EV-12', occurred_on: '2025-11-03', certainty: 'confirmed' });
      const sc = await createSubcontract(tx, t.member, { project_id: p.id, has_sub_subs: false });
      const inv = await createInvoice(tx, t.member, { subcontract_id: sc.id, number: `INV-${2000 + i}`, amount_cents: 1_000_000, holdback_cents: 100_000 });
      await addEvent(tx, t.member, { scope_type: 'invoice', scope_id: inv.id, type: 'EV-01', occurred_on: '2027-11-22', certainty: 'confirmed' });
      await addEvent(tx, t.member, { scope_type: 'subcontract', scope_id: sc.id, type: 'EV-07', occurred_on: '2027-10-28', certainty: 'confirmed' });
      seeded.push({ tenant: t, invoiceId: inv.id, projectId: p.id });
    });
  }
}

const lienDate = async (s: Seeded) =>
  (await db.withTenant(s.tenant.tenantId, (tx) => getInvoice(tx, s.tenant.viewer, s.invoiceId))).deadlines.find((d) => d.clock === 'CLK-09' && d.variant === 'b')!;
const openCount = async () => Number((await admin.pool.query('select count(*) from recompute_pending where done_at is null')).rows[0].count);

/** Commit a rule change with its pending rows, without draining (as if the process died right after commit). */
async function commitRuleChange(days: number): Promise<void> {
  clk09b.offsetDays = days;
  const bad = broken();
  const r = await syncDraftRules(admin, undefined, { app: bad });
  await bad.close();
  expect(r.newRevisions.length).toBe(1);
}

/** Start the worker drain in its own process, wait until it reaches the pause point, SIGKILL it. */
async function killMidDrain(mode: 'mid-read' | 'after-row', n: number): Promise<void> {
  const proc: ChildProcess = spawn(process.execPath, ['--import', 'tsx', child, mode, String(n)], { cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  proc.stderr!.on('data', (b) => (err += String(b)));
  await new Promise<void>((done, fail) => {
    const timer = setTimeout(() => fail(new Error(`drain child never paused: ${out} ${err}`)), 25_000);
    proc.stdout!.on('data', (b) => {
      out += String(b);
      if (out.includes('PAUSED')) {
        clearTimeout(timer);
        done();
      }
      if (out.includes('FINISHED')) fail(new Error(`drain child finished without pausing: ${out}`));
    });
    proc.on('exit', (code) => !out.includes('PAUSED') && fail(new Error(`drain child exited ${code}: ${err}`)));
  });
  const exited = new Promise<NodeJS.Signals | null>((r) => proc.on('exit', (_c, sig) => r(sig)));
  proc.kill('SIGKILL');
  expect(await exited).toBe('SIGKILL');
}

/** No read anywhere shows a date other than the expected new-rule one; pending rows show no date. */
async function expectNoSupersededDate(newDate: string, oldDate: string): Promise<{ pending: number; computed: number }> {
  let pending = 0;
  let computed = 0;
  for (const s of seeded) {
    const d = await lienDate(s);
    expect(JSON.stringify(d)).not.toContain(oldDate);
    if (d.state === 'recompute_pending') {
      expect(d).toMatchObject({ statutory_date: null, act_by_date: null });
      pending++;
    } else {
      expect(d).toMatchObject({ state: 'computed', statutory_date: newDate });
      computed++;
    }
  }
  for (const t of tenants) expect(await db.withTenant(t.tenantId, (tx) => invariantCheck(tx))).toEqual([]);
  return { pending, computed };
}

/** Database-wide: no current deadline rests on an older generation or on a retired rule revision. */
async function expectNothingSuperseded(): Promise<void> {
  const r = await admin.pool.query(
    `select count(*)::int as n from deadline d
       join computation_run c on c.id = d.computation_run_id
       join rule_clock rc on rc.id = d.rule_clock_id join rule_version v on v.id = rc.rule_version_id
       cross join rules_generation g
     where g.jurisdiction = 'ON' and d.is_current
       and (c.rules_gen < g.rules_gen or c.holiday_gen < g.holiday_gen or v.status = 'retired')`,
  );
  expect(r.rows[0].n).toBe(0);
  expect(await openCount()).toBe(0);
}

beforeAll(async () => {
  tenants = [await seedTenant(admin, 'Northline Electric Ltd.'), await seedTenant(admin, 'Baycrest Mechanical Inc.')];
  for (const t of tenants) await seedProjects(t, 4);
  await syncDraftRules(admin, undefined, { app: db }); // settle anything other files left
  for (const s of seeded) expect(await lienDate(s)).toMatchObject({ state: 'computed', statutory_date: '2027-12-27' });
});
afterAll(async () => {
  clk09b.offsetDays = 60;
  await syncDraftRules(admin, undefined, { app: db }); // restore the shared test database
  await db.close();
  await admin.close();
});

describe('worker killed mid-drain resumes without leaving a superseded date', () => {
  it('SIGKILL inside a recompute (after read, before write): two rows done, the rest open; the next drain finishes', async () => {
    await commitRuleChange(59);
    const before = await openCount();
    expect(before).toBeGreaterThanOrEqual(seeded.length);
    await killMidDrain('mid-read', 2);
    expect(await openCount()).toBe(before - 2); // rows 0 and 1 closed; row 2 (read, not written) and later stay open
    await expectNoSupersededDate('2027-12-26', '2027-12-27');

    const resumed = await drainPending(db, '00000000-0000-4000-8000-0000000000c2');
    expect(resumed.failed).toEqual([]);
    expect(resumed.done).toBe(before - 2);
    expect(resumed.remaining).toBe(0);
    expect(await expectNoSupersededDate('2027-12-26', '2027-12-27')).toEqual({ pending: 0, computed: seeded.length });
    await expectNothingSuperseded();
    expect((await drainPending(db, '00000000-0000-4000-8000-0000000000c3')).done).toBe(0); // idempotent
  });

  it('SIGKILL between rows (later rows claimed, untouched), then a second rule change before the resume', async () => {
    await commitRuleChange(61);
    const before = await openCount();
    await killMidDrain('after-row', 0);
    expect(await openCount()).toBe(before - 1);
    const mid = await expectNoSupersededDate('2027-12-28', '2027-12-26');
    expect(mid.pending).toBeGreaterThan(0);

    // The rule moves again while the queue is half-drained: the 61-day dates already written are now superseded too.
    await commitRuleChange(59);
    await expectNoSupersededDate('2027-12-26', '2027-12-28');
    const resumed = await drainPending(db, '00000000-0000-4000-8000-0000000000c4');
    expect(resumed.failed).toEqual([]);
    expect(await expectNoSupersededDate('2027-12-26', '2027-12-28')).toEqual({ pending: 0, computed: seeded.length });
    await expectNothingSuperseded();
  });
});
