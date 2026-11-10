import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLogger } from '@payclock/platform';
import { createApp } from '../src/app.ts';
import { FakeAuthProvider } from '../src/auth.ts';
import { adminDb, appDb, seedTenant, type SeededTenant } from '../../../tests/helpers.ts';

const db = appDb();
const admin = adminDb();
const auth = new FakeAuthProvider();
const logLines: string[] = [];
let server: Server;
let base: string;
let A: SeededTenant;
let B: SeededTenant;

async function call(token: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON in tests
  return { status: res.status, body: (await res.json()) as Record<string, any>, headers: res.headers };
}
const post = (token: string, path: string, body: unknown, key: string = randomUUID()) => call(token, 'POST', path, body, { 'idempotency-key': key });

beforeAll(async () => {
  A = await seedTenant(admin, 'Northline Electric Ltd.');
  B = await seedTenant(admin, 'Baycrest Mechanical Inc.');
  for (const [t, role] of [[A, 'member'], [A, 'viewer'], [B, 'owner']] as const) auth.add(`${t.tenantId}-${role}`, { userId: t[role].userId, tenantId: t.tenantId });
  auth.add('forged', { userId: B.owner.userId, tenantId: A.tenantId }); // B's user claiming A's tenant
  server = createServer(createApp({ db, auth, logger: createLogger({ service: 'web-test', sink: (l) => logLines.push(l) }), queue: null }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
  await admin.close();
});

describe('API /api/v1 core path', () => {
  let projectId: string;
  let subcontractId: string;
  let invoiceId: string;
  let ev01: { id: string; version: number };
  let runId: string;
  const M = () => `${A.tenantId}-member`;

  it('health and readiness', async () => {
    expect((await call(null, 'GET', '/healthz')).status).toBe(200);
    const ready = await call(null, 'GET', '/readyz');
    expect(ready.status).toBe(200);
    expect(ready.body.checks.database).toBe(true);
  });

  it('401 without a session; 400 without an Idempotency-Key; every response carries X-Correlation-Id', async () => {
    const r = await call(null, 'GET', `/api/v1/invoices/${randomUUID()}`);
    expect(r.status).toBe(401);
    expect(r.headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/);
    const nokey = await call(M(), 'POST', '/api/v1/projects', { name: 'x', contractor_name: 'y' });
    expect(nokey.status).toBe(400);
    expect(nokey.body).toMatchObject({ code: 'idempotency_key_required', fields: ['Idempotency-Key'] });
    const cid = '22222222-2222-4222-8222-222222222222';
    expect((await call(null, 'GET', '/healthz', undefined, { 'x-correlation-id': cid })).headers.get('x-correlation-id')).toBe(cid);
  });

  it('creates project, prime-contract facts, subcontract and invoice', async () => {
    const p = await post(M(), '/api/v1/projects', { name: 'Lakeshore Clinic Fit-out', contractor_name: 'Harbourgate Builders Inc.', premises_leased: 'no', municipal_interest: 'no' });
    expect(p.status).toBe(201);
    projectId = p.body.id;
    expect((await post(M(), '/api/v1/events', { scope_type: 'project', scope_id: projectId, type: 'EV-11', occurred_on: '2026-02-10', certainty: 'confirmed' })).status).toBe(201);
    expect((await post(M(), '/api/v1/events', { scope_type: 'project', scope_id: projectId, type: 'EV-12', occurred_on: '2025-11-03', certainty: 'confirmed' })).status).toBe(201);
    const sc = await post(M(), '/api/v1/subcontracts', { project_id: projectId, has_sub_subs: true });
    subcontractId = sc.body.id;
    const inv = await post(M(), '/api/v1/invoices', { subcontract_id: subcontractId, number: 'INV-1042', amount_cents: 4_800_000, holdback_cents: 480_000 });
    expect(inv.status).toBe(201);
    invoiceId = inv.body.id;
    const dup = await post(M(), '/api/v1/invoices', { subcontract_id: subcontractId, number: 'INV-1042', amount_cents: 1 });
    expect(dup.status).toBe(409);
    expect(dup.body).toMatchObject({ code: 'duplicate_invoice', message: expect.any(String), fields: [] });
  });

  it('IT-06: POST /events repeated with one idempotency key creates one event and returns the same reply', async () => {
    const key = 'it06-key-0001';
    const body = { scope_type: 'invoice', scope_id: invoiceId, type: 'EV-01', occurred_on: '2026-10-01', certainty: 'estimated' };
    const first = await post(M(), '/api/v1/events', body, key);
    const second = await post(M(), '/api/v1/events', body, key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    ev01 = { id: first.body.event.id, version: first.body.event.version };
    const view = await call(M(), 'GET', `/api/v1/invoices/${invoiceId}`);
    expect(view.body.events.filter((e: { type: string }) => e.type === 'EV-01')).toHaveLength(1);
    const reused = await post(M(), '/api/v1/events', { ...body, occurred_on: '2026-10-02' }, key);
    expect(reused.status).toBe(422);
    expect(reused.body.code).toBe('idempotency_key_reused');
  });

  it('IT-06: concurrent requests with one key still create one event', async () => {
    const key = 'it06-key-concurrent';
    const body = { scope_type: 'subcontract', scope_id: subcontractId, type: 'EV-07', occurred_on: '2026-09-30', certainty: 'confirmed' };
    const [a, b] = await Promise.all([post(M(), '/api/v1/events', body, key), post(M(), '/api/v1/events', body, key)]);
    expect([a.status, b.status].sort()).toEqual([201, 201]);
    expect(a.body.event.id).toBe(b.body.event.id);
  });

  it('a correction returns a recomputation whose diff shows the moved date; stale version is 409; empty reason is 422', async () => {
    const r = await post(M(), `/api/v1/events/${ev01.id}/corrections`, { occurred_on: '2026-10-08', certainty: 'confirmed', reason: 'contractor confirmed', expected_version: ev01.version });
    expect(r.status).toBe(200);
    runId = r.body.recomputation_id;
    const diff = await call(M(), 'GET', `/api/v1/recomputations/${runId}`);
    expect(diff.body.changes.find((c: { clock: string }) => c.clock === 'CLK-17')).toMatchObject({ old_date: '2026-11-05', new_date: '2026-11-12' });
    const stale = await post(M(), `/api/v1/events/${ev01.id}/corrections`, { occurred_on: '2026-10-09', certainty: 'confirmed', reason: 'again', expected_version: ev01.version });
    expect(stale.status).toBe(409);
    expect(stale.body.details.current.occurred_on).toBe('2026-10-08');
    const noReason = await post(M(), `/api/v1/events/${r.body.event.id}/corrections`, { occurred_on: '2026-10-09', certainty: 'confirmed', reason: '', expected_version: 2 });
    expect(noReason.status).toBe(422);
    expect(noReason.body.fields).toEqual(['reason']);
  });

  it('viewer reads but cannot correct (403)', async () => {
    const V = `${A.tenantId}-viewer`;
    expect((await call(V, 'GET', `/api/v1/invoices/${invoiceId}`)).status).toBe(200);
    expect((await post(V, `/api/v1/events/${ev01.id}/corrections`, { occurred_on: '2026-10-09', certainty: 'confirmed', reason: 'x', expected_version: 2 })).status).toBe(403);
  });

  it('IT-01 (API part): tenant B gets 404 for tenant A invoice, recomputation and correction; a forged tenant claim is refused', async () => {
    const Bt = `${B.tenantId}-owner`;
    expect((await call(Bt, 'GET', `/api/v1/invoices/${invoiceId}`)).status).toBe(404);
    expect((await call(Bt, 'GET', `/api/v1/recomputations/${runId}`)).status).toBe(404);
    expect((await post(Bt, `/api/v1/events/${ev01.id}/corrections`, { occurred_on: '2026-10-09', certainty: 'confirmed', reason: 'x', expected_version: 2 })).status).toBe(404);
    expect((await post(Bt, '/api/v1/events', { scope_type: 'invoice', scope_id: invoiceId, type: 'EV-02', occurred_on: '2026-10-08', certainty: 'confirmed' })).status).toBe(404);
    expect((await call('forged', 'GET', `/api/v1/invoices/${invoiceId}`)).status).toBe(401);
  });

  it('UT-15 end to end: EV-17 unknown and EV-18 2026-09-15 give CLK-11 "no later than 2026-12-14", never 2026-12-15', async () => {
    await post(M(), '/api/v1/events', { scope_type: 'project', scope_id: projectId, type: 'EV-17', occurred_on: null, certainty: 'unknown' });
    await post(M(), '/api/v1/events', { scope_type: 'project', scope_id: projectId, type: 'EV-18', occurred_on: '2026-09-15', certainty: 'confirmed' });
    const view = await call(M(), 'GET', `/api/v1/invoices/${invoiceId}`);
    const adj = view.body.deadlines.find((d: { clock: string }) => d.clock === 'CLK-11');
    expect(adj).toMatchObject({ statutory_date: '2026-12-14', bound: 'no_later_than', state: 'provisional', label: 'no later than 2026-12-14' });
    expect(JSON.stringify(view.body.deadlines)).not.toContain('2026-12-15');
  });

  it('rule versions are listed with their (absent) sign-off', async () => {
    const r = await call(M(), 'GET', '/api/v1/rules/versions');
    expect(r.body.versions.map((v: { code: string }) => v.code).sort()).toEqual(['ON-2019-10', 'ON-2026-01', 'ON-LEGACY', 'ON-NOPP']);
    expect(r.body.versions.every((v: { status: string; signoff_id: null }) => v.status === 'draft' && v.signoff_id === null)).toBe(true);
  });

  it('IT-12 (partial): request logs carry the correlation id and no amounts or names', () => {
    const text = logLines.join('\n');
    expect(logLines.length).toBeGreaterThan(5);
    for (const l of logLines) expect(JSON.parse(l).correlation_id).toMatch(/^[0-9a-f-]{36}$/);
    for (const s of ['4800000', 'Harbourgate', 'Northline', 'INV-1042', 'Lakeshore']) expect(text).not.toContain(s);
  });
});
