/**
 * B2 file storage through the S3 API to local MinIO (T-2.2.4, IT-11 partial, R-13, R-16): upload
 * and download for one tenant, refusal for another, type and size checks, tenant-keyed object
 * paths, no public object URL, 5-minute links on APP_PUBLIC_URL, and cleanup of every object.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../../../packages/domain/src/auth/crypto.ts';
import { adminDb, appDb, seedTenant, type SeededTenant } from '../../../tests/helpers.ts';
import { Client, config, startHarness, type Harness } from '../../../tests/b2-helpers.ts';

const db = appDb();
const admin = adminDb();
let h: Harness;
let A: SeededTenant;
let B: SeededTenant;
const clients: Record<string, Client> = {};
let invoiceA: string;
const PASSWORD = 'evidence folder cabinet key';
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('synthetic evidence for a test invoice\n'), Buffer.from('%%EOF\n')]);

async function signInAs(t: SeededTenant, role: 'owner' | 'member' | 'viewer'): Promise<Client> {
  const email = (await admin.pool.query('select email from app_user where id = $1', [t[role].userId])).rows[0].email;
  const hash = (await admin.pool.query('select password_hash from user_credential where user_id = $1', [A.owner.userId])).rows[0]?.password_hash;
  if (!hash) throw new Error('no credential to copy');
  await admin.pool.query('insert into user_credential (user_id, password_hash, password_changed_at) values ($1, $2, now()) on conflict do nothing', [t[role].userId, hash]);
  const c = new Client(h.base);
  const r = await c.signIn(email, PASSWORD);
  if (r.status !== 200) throw new Error(`sign-in failed ${JSON.stringify(r.body)}`);
  return c;
}

async function upload(c: Client, body: Buffer, mime: string, entityId: string, entityType = 'invoice') {
  const res = await fetch(`${h.base}/api/v1/documents?purpose=evidence&entity_type=${entityType}&entity_id=${entityId}`, {
    method: 'POST',
    headers: { 'content-type': mime, cookie: `__Host-payclock_session=${c.cookie}`, 'x-csrf-token': c.csrf!, 'idempotency-key': randomUUID() },
    body,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON in tests
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const keys = async (tenantId: string) => (await admin.pool.query<{ storage_key: string }>('select storage_key from source_document where tenant_id = $1', [tenantId])).rows.map((r) => r.storage_key);

beforeAll(async () => {
  h = await startHarness(db);
  A = await seedTenant(admin, 'Northline Electric Ltd.');
  B = await seedTenant(admin, 'Baycrest Mechanical Inc.');
  // One known password hash for the seeded synthetic users (scrypt at the test cost).
  const hash = await hashPassword(PASSWORD, config().PASSWORD_SCRYPT_LOG2N);
  await admin.pool.query('insert into user_credential (user_id, password_hash, password_changed_at) values ($1, $2, now())', [A.owner.userId, hash]);
  clients.aMember = await signInAs(A, 'member');
  clients.aViewer = await signInAs(A, 'viewer');
  clients.bOwner = await signInAs(B, 'owner');
  const p = await clients.aMember.req('POST', '/api/v1/projects', { name: 'Lakeshore Clinic Fit-out', contractor_name: 'Harbourgate Builders Inc.' });
  const sc = await clients.aMember.req('POST', '/api/v1/subcontracts', { project_id: p.body.id, has_sub_subs: false });
  invoiceA = (await clients.aMember.req('POST', '/api/v1/invoices', { subcontract_id: sc.body.id, number: 'INV-1042', amount_cents: 4_800_000, holdback_cents: 480_000 })).body.id;
});

afterAll(async () => {
  // Cleanup: every object written for the two synthetic tenants is deleted, then checked gone.
  for (const t of [A, B]) {
    for (const k of await keys(t.tenantId)) {
      await h.store.delete(t.tenantId, k);
      await expect(h.store.get(t.tenantId, k)).rejects.toThrow();
    }
  }
  await h.close();
  await db.close();
  await admin.close();
});

describe('B2 evidence files on MinIO', () => {
  let docId: string;
  let link: string;

  it('readiness reports storage; a member uploads a PDF for an invoice; the key is t/{tenant}/{purpose}/{entity}/{uuid}.pdf', async () => {
    expect((await new Client(h.base).req('GET', '/readyz')).body.checks.storage).toBe(true);
    const r = await upload(clients.aMember!, PDF, 'application/pdf', invoiceA);
    expect(r).toMatchObject({ status: 201, body: { mime: 'application/pdf', bytes: PDF.length, scan_status: 'clean', entity_id: invoiceA } });
    docId = r.body.id;
    const [key] = await keys(A.tenantId);
    expect(key).toMatch(new RegExp(`^t/${A.tenantId}/evidence/${invoiceA}/[0-9a-f-]{36}\\.pdf$`));
    expect((await h.store.get(A.tenantId, key!)).equals(PDF)).toBe(true);
  });

  it('the object has no public URL: an anonymous GET on MinIO is refused', async () => {
    const [key] = await keys(A.tenantId);
    const c = config();
    const res = await fetch(`${c.S3_ENDPOINT}/${c.S3_BUCKET}/${key}`);
    expect(res.status).toBe(403);
  });

  it('download: a 5-minute link on APP_PUBLIC_URL; content through the API with a server-set file name', async () => {
    const r = await clients.aViewer!.req('GET', `/api/v1/documents/${docId}/link`);
    expect(r.status).toBe(200);
    link = r.body.url;
    expect(new URL(link).origin).toBe(new URL(process.env.APP_PUBLIC_URL!).origin);
    expect(Date.parse(r.body.expires_at) - Date.now()).toBeLessThanOrEqual(300_000 + 1000);
    const u = new URL(link);
    const res = await fetch(`${h.base}${u.pathname}${u.search}`, { headers: { cookie: `__Host-payclock_session=${clients.aViewer!.cookie}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="evidence-${docId}.pdf"`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await res.arrayBuffer()).equals(PDF)).toBe(true);
  });

  it('another tenant: link request 404, A\'s signed link refused, upload against A\'s invoice 404, no object written', async () => {
    const b = clients.bOwner!;
    expect((await b.req('GET', `/api/v1/documents/${docId}/link`)).status).toBe(404);
    const u = new URL(link);
    const res = await fetch(`${h.base}${u.pathname}${u.search}`, { headers: { cookie: `__Host-payclock_session=${b.cookie}` } });
    expect(res.status).toBe(403);
    expect((await upload(b, PDF, 'application/pdf', invoiceA)).status).toBe(404);
    expect(await keys(B.tenantId)).toEqual([]);
    // Without a session the link is useless.
    expect((await fetch(`${h.base}${u.pathname}${u.search}`)).status).toBe(401);
  });

  it('an expired or altered link is refused', async () => {
    const u = new URL(link);
    const tampered = new URLSearchParams(u.search);
    tampered.set('exp', String(Number(tampered.get('exp')) + 3600));
    expect((await fetch(`${h.base}${u.pathname}?${tampered}`, { headers: { cookie: `__Host-payclock_session=${clients.aViewer!.cookie}` } })).status).toBe(403);
    h.shift(301_000);
    try {
      const res = await fetch(`${h.base}${u.pathname}${u.search}`, { headers: { cookie: `__Host-payclock_session=${clients.aViewer!.cookie}` } });
      expect(res.status).toBe(403);
      expect(((await res.json()) as { code: string }).code).toBe('link_expired');
    } finally {
      h.shift(-301_000);
    }
  });

  it('IT-11: a renamed executable sent as PDF is 415; unsupported type 415; over 10 MB 413; a viewer cannot upload', async () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0x90)]);
    expect((await upload(clients.aMember!, exe, 'application/pdf', invoiceA)).status).toBe(415);
    expect((await upload(clients.aMember!, Buffer.from('hello'), 'application/zip', invoiceA)).status).toBe(415);
    expect((await upload(clients.aMember!, exe, 'text/csv', invoiceA)).status).toBe(415);
    const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(10 * 1024 * 1024)]);
    expect((await upload(clients.aMember!, big, 'application/pdf', invoiceA)).status).toBe(413);
    expect((await upload(clients.aViewer!, PDF, 'application/pdf', invoiceA)).status).toBe(403);
    expect(await keys(A.tenantId)).toHaveLength(1);
  });

  it('B2-S05: prototype member names as entity_type, purpose or content type are 400, never 500', async () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const q = `purpose=evidence&entity_type=${name}&entity_id=${invoiceA}`;
      const res = await fetch(`${h.base}/api/v1/documents?${q}`, {
        method: 'POST',
        headers: { 'content-type': 'application/pdf', cookie: `__Host-payclock_session=${clients.aMember!.cookie}`, 'x-csrf-token': clients.aMember!.csrf!, 'idempotency-key': randomUUID() },
        body: PDF,
      });
      expect({ name, status: res.status }).toEqual({ name, status: 400 });
    }
    expect((await upload(clients.aMember!, PDF, 'constructor', invoiceA)).status).toBe(400);
    const purpose = await fetch(`${h.base}/api/v1/documents?purpose=valueOf&entity_type=invoice&entity_id=${invoiceA}`, {
      method: 'POST',
      headers: { 'content-type': 'application/pdf', cookie: `__Host-payclock_session=${clients.aMember!.cookie}`, 'x-csrf-token': clients.aMember!.csrf!, 'idempotency-key': randomUUID() },
      body: PDF,
    });
    expect(purpose.status).toBe(400);
    expect(await keys(A.tenantId)).toHaveLength(1);
  });

  it('a file not marked clean by the scanner cannot be linked or downloaded', async () => {
    const csv = await upload(clients.aMember!, Buffer.from('invoice,date\nsynthetic,2026-10-01\n'), 'text/csv', invoiceA);
    expect(csv.status).toBe(201);
    await admin.pool.query("update source_document set scan_status = 'pending' where id = $1", [csv.body.id]);
    expect((await clients.aViewer!.req('GET', `/api/v1/documents/${csv.body.id}/link`)).body.code).toBe('scan_not_clean');
  });

  it('the database refuses a key outside the tenant prefix (constraint), and row-level security hides documents without context', async () => {
    await expect(admin.pool.query(
      "insert into source_document (tenant_id, purpose, entity_type, entity_id, storage_key, sha256, mime, bytes, uploaded_by) values ($1, 'evidence', 'invoice', $2, $3, '\\x00', 'application/pdf', 1, $4)",
      [A.tenantId, invoiceA, `t/${B.tenantId}/evidence/${invoiceA}/${randomUUID()}.pdf`, A.owner.userId],
    )).rejects.toThrow(/source_document_key_check/);
    expect((await db.pool.query('select count(*)::int as n from source_document')).rows[0].n).toBe(0);
  });
});
