/**
 * Permanent regressions for the B2 security review round 1 (`payclock-ca-b2-sec-round1.md`):
 * B2-S01 parallel bursts get no extra password or TOTP tries; B2-S02 nobody who only knows an
 * email can keep its owner locked out; B2-S03 password-reset requests look the same for known and
 * unknown addresses; B2-S04 invitation acceptance shares the sign-in limits; B2-S07 tests that
 * fail if the per-address limit, the sign-in audit events, sign-out everywhere or the Origin check
 * on public routes are removed.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantDb } from '@payclock/db';
import { base32Decode, totpCode, totpStep } from '@payclock/domain';
import { hashPassword } from '../../../packages/domain/src/auth/crypto.ts';
import { adminDb } from '../../../tests/helpers.ts';
import { cleanupMail, Client, config, startHarness, tokenFrom, uniqueEmail, waitForMail, type Harness } from '../../../tests/b2-helpers.ts';

const db = new TenantDb(process.env.DATABASE_URL!, 24);
const admin = adminDb();
let h: Harness;
let offset = 0;
const PW = 'granite orchard window seven';
let pwHash: string;
let tenantA: string;
let tenantB: string;

const clearThrottle = () => admin.pool.query('delete from auth_throttle');
const shift = (ms: number) => {
  h.shift(ms);
  offset += ms;
};

async function user(tenantId: string | null, role = 'member', extra: { operator?: boolean } = {}) {
  const id = randomUUID();
  const email = uniqueEmail(`sec${role}`);
  await admin.pool.query('insert into app_user (id, email, display_name, is_operator) values ($1, $2, $3, $4)', [id, email, 'Synthetic user', !!extra.operator]);
  await admin.pool.query('insert into user_credential (user_id, password_hash, password_changed_at) values ($1, $2, now())', [id, pwHash]);
  if (tenantId) await admin.pool.query("insert into membership (tenant_id, user_id, role, status) values ($1, $2, $3, 'active')", [tenantId, id, role]);
  return { id, email };
}

async function signedIn(email: string, extra: Record<string, unknown> = {}) {
  const c = new Client(h.base);
  const r = await c.signIn(email, PW, extra);
  if (r.status !== 200) throw new Error(`sign-in failed: ${JSON.stringify(r.body)}`);
  return c;
}

/** Service-level sign-in from a chosen client address; returns the HTTP-equivalent status. */
async function attempt(email: string, password: string, address: string, totp?: string, deviceToken?: string | null): Promise<{ status: number; retryAfterS?: number }> {
  try {
    await h.auth.signIn({ email, password, totp_code: totp }, { address, correlationId: randomUUID(), deviceToken });
    return { status: 200 };
  } catch (e) {
    return { status: (e as { status: number }).status, retryAfterS: (e as { retryAfterS?: number }).retryAfterS };
  }
}

async function enrolTotp(c: Client): Promise<Buffer> {
  const e = await c.req('POST', '/api/v1/auth/totp/enroll', {});
  const secret = base32Decode(e.body.secret);
  const r = await c.req('POST', '/api/v1/auth/totp/confirm', { code: totpCode(secret, totpStep(Date.now() + offset) - 1) });
  if (r.status !== 200) throw new Error('totp confirm failed');
  return secret;
}

beforeAll(async () => {
  h = await startHarness(db);
  pwHash = await hashPassword(PW, config().PASSWORD_SCRYPT_LOG2N);
  tenantA = randomUUID();
  tenantB = randomUUID();
  for (const [id, name] of [[tenantA, 'Northline Electric Ltd.'], [tenantB, 'Baycrest Mechanical Inc.']]) {
    await admin.pool.query("insert into tenant (id, legal_name, trade) values ($1, $2, 'electrical')", [id, name]);
  }
  await clearThrottle();
});
afterAll(async () => {
  await h.auth.settle();
  await cleanupMail();
  await clearThrottle();
  await h.close();
  await db.close();
  await admin.close();
});

describe('B2-S01: the attempt is reserved atomically before any password or code is checked', () => {
  it('40 parallel wrong passwords for one account: at most 5 are evaluated, the rest get 429', async () => {
    await clearThrottle();
    const v = await user(tenantA);
    const wave = await Promise.all(Array.from({ length: 40 }, (_, i) => new Client(h.base).req('POST', '/api/v1/auth/sign-in', { email: v.email, password: `wrong guess number ${i}` })));
    const evaluated = wave.filter((x) => x.status === 401).length;
    expect(evaluated).toBeLessThanOrEqual(5);
    expect(wave.filter((x) => x.status === 429).length).toBe(40 - evaluated);
  });

  it('40 parallel wrong TOTP codes with the right password: at most 5 are evaluated', async () => {
    await clearThrottle();
    const v = await user(tenantA);
    const secret = await enrolTotp(await signedIn(v.email));
    await clearThrottle();
    const now = totpStep(Date.now() + offset);
    const good = new Set([now - 1, now, now + 1].map((s) => totpCode(secret, s)));
    const guesses: string[] = [];
    for (let i = 0; guesses.length < 40; i++) {
      const g = String(100000 + i * 7919).slice(-6);
      if (!good.has(g)) guesses.push(g);
    }
    const wave = await Promise.all(guesses.map((g) => new Client(h.base).req('POST', '/api/v1/auth/sign-in', { email: v.email, password: PW, totp_code: g })));
    expect(wave.filter((x) => x.status === 401).length).toBeLessThanOrEqual(5);
    expect(wave.some((x) => x.status === 429)).toBe(true);
  });
});

describe('B2-S02: a third party who only knows an email cannot keep its owner locked out', () => {
  it('while a paced attack from rotating addresses continues, the owner with the right password and TOTP gets in after at most the short account delay', async () => {
    await clearThrottle();
    const v = await user(tenantA, 'owner');
    const secret = await enrolTotp(await signedIn(v.email));
    await clearThrottle();
    let lastStep = totpStep(Date.now() + offset);
    const code = () => {
      shift(30_000);
      lastStep = totpStep(Date.now() + offset);
      return totpCode(secret, lastStep);
    };
    // 16 wrong guesses, each from a new address, each sent the moment the previous delay ends.
    for (let i = 0; i < 16; i++) {
      const r = await attempt(v.email, 'attacker wrong guess', `198.51.100.${200 + i}`);
      if (r.status === 429) {
        shift((r.retryAfterS ?? 0) * 1000 + 1000);
        await attempt(v.email, 'attacker wrong guess', `198.51.100.${200 + i}`);
      }
    }
    // Immediately after a guess, the owner may meet the account-wide delay, which is capped at 30 s.
    const victim = await attempt(v.email, PW, '192.0.2.10', code());
    if (victim.status === 429) {
      expect(victim.retryAfterS).toBeLessThanOrEqual(30);
      shift(victim.retryAfterS! * 1000 + 1000);
      expect((await attempt(v.email, PW, '192.0.2.10', code())).status).toBe(200);
    } else {
      expect(victim.status).toBe(200);
    }
    const row = await admin.pool.query("select max(extract(epoch from next_allowed_at - now())) as s from auth_throttle where key = $1", [`account:${v.email}`]);
    expect(Number(row.rows[0]?.s ?? 0)).toBeLessThanOrEqual(30 + offset / 1000);
  });

  it('the owner\'s usual browser (device cookie) gets in at once while the account-wide delay is active; a device cookie of another account does not help', async () => {
    await clearThrottle();
    const v = await user(tenantA, 'owner');
    const other = await user(tenantA);
    const usual = await signedIn(v.email);
    const otherBrowser = await signedIn(other.email);
    expect(usual.device).toMatch(/^[A-Za-z0-9_-]{22}\.[0-9a-f]{64}$/);
    // Continuous attack from fresh addresses until the account-wide delay is in force.
    let delayed = false;
    for (let i = 0; i < 12 && !delayed; i++) delayed = (await attempt(v.email, 'attacker wrong guess', `198.51.100.${i + 1}`)).status === 429;
    expect(delayed).toBe(true);
    expect((await attempt(v.email, PW, '192.0.2.20')).status).toBe(429); // a new browser waits (<= 30 s)
    expect((await attempt(v.email, PW, '192.0.2.21', undefined, otherBrowser.device)).status).toBe(429);
    expect((await attempt(v.email, PW, '192.0.2.22', undefined, usual.device)).status).toBe(200);
    // The device cookie is limited on its own key: wrong passwords from it are delayed too.
    const st: number[] = [];
    for (let i = 0; i < 6; i++) st.push((await attempt(v.email, 'stolen cookie guess', `192.0.2.${30 + i}`, undefined, usual.device)).status);
    expect(st.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(st[5]).toBe(429);
  });

  it('the attacking address itself still meets the long per-client delay', async () => {
    await clearThrottle();
    const v = await user(tenantA);
    const res: Array<{ status: number; retryAfterS?: number }> = [];
    for (let i = 0; i < 6; i++) res.push(await attempt(v.email, 'wrong wrong wrong', '203.0.113.50'));
    expect(res.slice(0, 5).every((r) => r.status === 401)).toBe(true);
    expect(res[5]!.status).toBe(429);
  });
});

describe('B2-S07 / V6.3.1: the per-address limit (password spraying)', () => {
  it('one address trying 22 different accounts is delayed after 20, even though no account is', async () => {
    await clearThrottle();
    const st: number[] = [];
    for (let i = 0; i < 22; i++) st.push((await attempt(uniqueEmail(`spray${i}`), 'Spring2026 password', '203.0.113.9')).status);
    expect(st.slice(0, 21).every((s) => s === 401)).toBe(true);
    expect(st[21]).toBe(429);
    await clearThrottle();
  });
});

describe('B2-S04: invitation acceptance for an existing account shares the sign-in limits', () => {
  it('wrong passwords at accept meet 429 after the free tries', async () => {
    await clearThrottle();
    const existing = await user(tenantA);
    const ownerB = await user(tenantB, 'owner');
    const ob = await signedIn(ownerB.email);
    await ob.req('POST', '/api/v1/invitations', { email: existing.email, role: 'viewer' });
    const tok = tokenFrom((await waitForMail(existing.email, /invited/)).text);
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) codes.push((await new Client(h.base).req('POST', '/api/v1/auth/invitations/accept', { token: tok, password: `guess number ${i} abc` })).status);
    expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(codes).toContain(429);
    await clearThrottle();
    expect((await new Client(h.base).req('POST', '/api/v1/auth/invitations/accept', { token: tok, password: PW })).status).toBe(200);
  });
});

describe('B2-S03: password-reset requests do not reveal which addresses have accounts', () => {
  it('same status and body, and timing distributions that overlap, for known and unknown addresses; the known one still gets its email', async () => {
    await clearThrottle();
    const known: string[] = [];
    for (let i = 0; i < 15; i++) known.push((await user(tenantA, 'viewer')).email);
    const tk: number[] = [];
    const tu: number[] = [];
    const replies = new Set<string>();
    for (let i = 0; i < 15; i++) {
      if (i % 5 === 0) await clearThrottle();
      let t = performance.now();
      const a = await new Client(h.base).req('POST', '/api/v1/auth/password-reset/request', { email: known[i] });
      tk.push(performance.now() - t);
      await h.auth.settle(); // background mail finished before the next measurement
      t = performance.now();
      const b = await new Client(h.base).req('POST', '/api/v1/auth/password-reset/request', { email: uniqueEmail('nobody') });
      tu.push(performance.now() - t);
      await h.auth.settle();
      replies.add(JSON.stringify([a.status, a.body]));
      replies.add(JSON.stringify([b.status, b.body]));
    }
    const median = (x: number[]) => [...x].sort((p, q) => p - q)[Math.floor(x.length / 2)]!;
    expect(replies.size).toBe(1);
    expect(Math.min(...tk)).toBeLessThanOrEqual(Math.max(...tu));
    expect(median(tk)).toBeLessThan(median(tu) * 1.5 + 1);
    const mail = await waitForMail(known[0]!, /Reset your PayClock password/);
    expect(mail.text).toContain('/reset-password#token=');
    await clearThrottle();
  });
});

describe('B2-S07: sign-in audit events, sign-out everywhere, Origin on public routes', () => {
  it('V16.3.1: a failed and a successful sign-in, and a sign-out, are written to audit_event with the user id', async () => {
    await clearThrottle();
    const v = await user(tenantA);
    await new Client(h.base).signIn(v.email, 'not the right password');
    const c = await signedIn(v.email);
    await c.req('POST', '/api/v1/auth/sign-out', {});
    const rows = (await admin.pool.query<{ action: string; tenant_id: string | null }>('select action, tenant_id from audit_event where actor_id = $1 order by id', [v.id])).rows;
    expect(rows.map((r) => r.action)).toEqual(['auth.sign_in_failed.password', 'auth.signed_in', 'auth.signed_out']);
    expect(rows[1]!.tenant_id).toBe(tenantA);
  });

  it('V7.4: sign out everywhere ends every session of the user, in every tenant', async () => {
    await clearThrottle();
    const v = await user(tenantA);
    await admin.pool.query("insert into membership (tenant_id, user_id, role, status) values ($1, $2, 'viewer', 'active')", [tenantB, v.id]);
    const a = await signedIn(v.email, { tenant_id: tenantA });
    const b = await signedIn(v.email, { tenant_id: tenantB });
    const r = await a.req('POST', '/api/v1/auth/sessions/revoke-all', {});
    expect(r.body.revoked).toBe(2);
    expect((await a.req('GET', '/api/v1/auth/session')).status).toBe(401);
    expect((await b.req('GET', '/api/v1/auth/session')).status).toBe(401);
  });

  it('V3.5.1: a foreign Origin is refused on the public routes too (login CSRF)', async () => {
    const v = await user(tenantA);
    const evil = { origin: 'http://evil.example' };
    const c = new Client(h.base);
    expect((await c.req('POST', '/api/v1/auth/sign-in', { email: v.email, password: PW }, evil)).body.code).toBe('origin_refused');
    expect((await c.req('POST', '/api/v1/auth/password-reset/request', { email: v.email }, evil)).body.code).toBe('origin_refused');
    expect((await c.req('POST', '/api/v1/auth/password-reset/complete', { token: 'x', password: 'y' }, evil)).body.code).toBe('origin_refused');
    expect((await c.req('POST', '/api/v1/auth/invitations/accept', { token: 'x', password: 'y' }, evil)).body.code).toBe('origin_refused');
    expect((await c.req('POST', '/api/v1/auth/sign-in', { email: v.email, password: PW }, { origin: 'null' })).status).toBe(403);
  });
});
