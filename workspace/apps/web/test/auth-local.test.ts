/**
 * B2 sign-in end to end through the real API, the Mailpit inbox (SMTP 127.0.0.1:1025) and the
 * test database as payclock_app: first-owner invitation, password, TOTP enrolment and sign-in,
 * CSRF and origin checks, team invitation, expiry and single use of links and codes, logout,
 * revocation, cross-tenant refusal, rate limiting, password reset, idle timeout, operators.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { base32Decode, totpCode, totpStep } from '@payclock/domain';
import { adminDb, appDb } from '../../../tests/helpers.ts';
import { cleanupMail, Client, mailCount, startHarness, tokenFrom, uniqueEmail, waitForMail, type Harness } from '../../../tests/b2-helpers.ts';

const db = appDb();
const admin = adminDb();
let h: Harness;
const tenantA = randomUUID();
const tenantB = randomUUID();
const ownerEmail = uniqueEmail('owner');
const ownerPassword = 'lakeshore lantern umbrella 7';
let totpSecret: Buffer;
let lastStepUsed = 0;
const PATH_AUTH = '/api/v1/auth';

/** The next authenticator code this test has not used yet (the server refuses reuse). */
let offset = 0;
function nextCode(): string {
  let step = totpStep(Date.now() + offset);
  if (step <= lastStepUsed) {
    // Move the server clock to the next 30-second step instead of waiting for it.
    h.shift(30_000);
    offset += 30_000;
    step = totpStep(Date.now() + offset);
  }
  lastStepUsed = step;
  return totpCode(totpSecret, step);
}

async function clearAddressThrottle() {
  await admin.pool.query('delete from auth_throttle');
}

beforeAll(async () => {
  h = await startHarness(db);
  for (const [id, name] of [[tenantA, 'Northline Electric Ltd.'], [tenantB, 'Baycrest Mechanical Inc.']]) {
    await admin.pool.query("insert into tenant (id, legal_name, trade) values ($1, $2, 'electrical')", [id, name]);
  }
  await clearAddressThrottle();
});
afterAll(async () => {
  await cleanupMail();
  await h.close();
  await db.close();
  await admin.close();
});

describe('B2 local sign-in (T-2.2.2, TRD 8.1)', () => {
  let owner: Client;
  let invitationToken: string;

  it('first-owner invitation arrives in Mailpit with a single-use link built from APP_PUBLIC_URL and no business data', async () => {
    await h.auth.inviteFirstOwner(tenantA, ownerEmail, randomUUID());
    const mail = await waitForMail(ownerEmail, /workspace is ready/);
    expect(mail.text).toContain(`${process.env.APP_PUBLIC_URL}/invitations/accept#token=`);
    expect(mail.text).not.toMatch(/Northline|Harbourgate|INV-|\$|CAD/);
    invitationToken = tokenFrom(mail.text);
    // The token is stored only as a hash.
    const stored = await admin.pool.query("select encode(token_sha256, 'hex') as h from auth_token where tenant_id = $1", [tenantA]);
    expect(JSON.stringify(stored.rows)).not.toContain(invitationToken);
  });

  it('accepting refuses a weak password, then sets the password; the same link a second time is refused', async () => {
    const c = new Client(h.base);
    const weak = await c.req('POST', `${PATH_AUTH}/invitations/accept`, { token: invitationToken, password: 'password1234' });
    expect(weak).toMatchObject({ status: 422, body: { code: 'password_common' } });
    const short = await c.req('POST', `${PATH_AUTH}/invitations/accept`, { token: invitationToken, password: 'short' });
    expect(short.body.code).toBe('password_too_short');
    const ok = await c.req('POST', `${PATH_AUTH}/invitations/accept`, { token: invitationToken, password: ownerPassword, display_name: 'Synthetic owner' });
    expect(ok).toMatchObject({ status: 200, body: { tenant_id: tenantA, role: 'owner' } });
    const again = await c.req('POST', `${PATH_AUTH}/invitations/accept`, { token: invitationToken, password: ownerPassword });
    expect(again).toMatchObject({ status: 410, body: { code: 'link_invalid' } });
  });

  it('sign-in sets a __Host- Secure HttpOnly SameSite=Strict cookie; the session is checked in the database', async () => {
    owner = new Client(h.base);
    const r = await owner.signIn(ownerEmail, ownerPassword);
    expect(r).toMatchObject({ status: 200, body: { tenant_id: tenantA, role: 'owner', restricted: false } });
    expect(owner.setCookie).toMatch(/^__Host-payclock_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=\d+$/);
    expect(r.body).not.toHaveProperty('token');
    const s = await owner.req('GET', `${PATH_AUTH}/session`);
    expect(s).toMatchObject({ status: 200, body: { user_id: r.body.user_id, tenant_id: tenantA } });
    const row = await admin.pool.query("select encode(token_sha256, 'hex') as t from auth_session where user_id = $1", [r.body.user_id]);
    expect(row.rows.length).toBe(1);
    expect(row.rows[0].t).not.toContain(owner.cookie);
  });

  it('anti-forgery: no CSRF token, a wrong one, a foreign Origin or a form content type are refused; the right request passes', async () => {
    const body = { name: 'Lakeshore Clinic Fit-out', contractor_name: 'Harbourgate Builders Inc.' };
    const csrf = owner.csrf!;
    owner.csrf = null;
    expect((await owner.req('POST', '/api/v1/projects', body)).body.code).toBe('csrf_refused');
    owner.csrf = 'f'.repeat(64);
    expect((await owner.req('POST', '/api/v1/projects', body)).body.code).toBe('csrf_refused');
    owner.csrf = csrf;
    expect((await owner.req('POST', '/api/v1/projects', body, { origin: 'https://evil.example' })).body.code).toBe('origin_refused');
    const form = await fetch(`${h.base}/api/v1/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: `__Host-payclock_session=${owner.cookie}`, 'idempotency-key': randomUUID() },
      body: 'name=x&contractor_name=y',
    });
    expect(form.status).toBe(415);
    const ok = await owner.req('POST', '/api/v1/projects', body, { origin: new URL(process.env.APP_PUBLIC_URL!).origin });
    expect(ok.status).toBe(201);
  });

  it('TOTP enrolment: wrong code refused; after confirmation sign-in needs a code, and the same code cannot be used twice', async () => {
    const enrol = await owner.req('POST', `${PATH_AUTH}/totp/enroll`, {});
    expect(enrol.status).toBe(200);
    expect(enrol.body.otpauth_uri).toMatch(/^otpauth:\/\/totp\/PayClock:/);
    totpSecret = base32Decode(enrol.body.secret);
    const wrong = await owner.req('POST', `${PATH_AUTH}/totp/confirm`, { code: totpCode(totpSecret, totpStep(Date.now() + offset) + 5) });
    expect(wrong.status).toBe(422);
    lastStepUsed = totpStep(Date.now() + offset) - 1;
    const code = nextCode();
    expect((await owner.req('POST', `${PATH_AUTH}/totp/confirm`, { code })).status).toBe(200);
    const enc = await admin.pool.query('select totp_secret_enc from user_credential c join app_user u on u.id = c.user_id where u.email = $1', [ownerEmail]);
    expect(enc.rows[0].totp_secret_enc.includes(totpSecret)).toBe(false); // encrypted at rest

    const c = new Client(h.base);
    expect((await c.signIn(ownerEmail, ownerPassword)).body.code).toBe('totp_required');
    expect((await c.signIn(ownerEmail, ownerPassword, { totp_code: code })).status).toBe(401); // used at confirmation
    const fresh = nextCode();
    expect((await c.signIn(ownerEmail, ownerPassword, { totp_code: fresh })).status).toBe(200);
    const replay = new Client(h.base);
    expect((await replay.signIn(ownerEmail, ownerPassword, { totp_code: fresh })).status).toBe(401);
    owner = c;
    await clearAddressThrottle();
  });

  it('logout invalidates the session on the server: the old cookie no longer works', async () => {
    const c = new Client(h.base);
    expect((await c.signIn(ownerEmail, ownerPassword, { totp_code: nextCode() })).status).toBe(200);
    expect((await c.req('GET', `${PATH_AUTH}/session`)).status).toBe(200);
    const out = await c.req('POST', `${PATH_AUTH}/sign-out`, {});
    expect(out.status).toBe(200);
    expect(out.headers.get('set-cookie')).toMatch(/Max-Age=0/);
    expect((await c.req('GET', `${PATH_AUTH}/session`)).status).toBe(401);
    expect((await c.req('GET', '/api/v1/rules/versions')).status).toBe(401);
  });

  it('a new sign-in issues a new token and revokes the one the browser presented (V7.2.4)', async () => {
    const c = new Client(h.base);
    await c.signIn(ownerEmail, ownerPassword, { totp_code: nextCode() });
    const old = c.cookie!;
    await c.signIn(ownerEmail, ownerPassword, { totp_code: nextCode() });
    expect(c.cookie).not.toBe(old);
    const stale = new Client(h.base);
    stale.cookie = old;
    expect((await stale.req('GET', `${PATH_AUTH}/session`)).status).toBe(401);
  });

  describe('team invitation, roles and revocation', () => {
    const memberEmail = uniqueEmail('member');
    const memberPassword = 'quiet harbour morning bell';
    let member: Client;
    let membershipId: string;

    it('owner invites a member by email; the member accepts and signs in with the member role', async () => {
      const inv = await owner.req('POST', '/api/v1/invitations', { email: memberEmail, role: 'member' });
      expect(inv).toMatchObject({ status: 201, body: { role: 'member', status: 'invited' } });
      membershipId = inv.body.membership_id;
      const mail = await waitForMail(memberEmail, /invited/);
      const accept = await new Client(h.base).req('POST', `${PATH_AUTH}/invitations/accept`, { token: tokenFrom(mail.text), password: memberPassword });
      expect(accept).toMatchObject({ status: 200, body: { role: 'member', tenant_id: tenantA } });
      member = new Client(h.base);
      expect((await member.signIn(memberEmail, memberPassword)).body).toMatchObject({ role: 'member', tenant_id: tenantA });
    });

    it('roles from the permission table: a member cannot invite or remove; a viewer cannot write', async () => {
      expect((await member.req('POST', '/api/v1/invitations', { email: uniqueEmail('x'), role: 'viewer' })).status).toBe(403);
      expect((await member.req('DELETE', `/api/v1/memberships/${membershipId}`)).status).toBe(403);
      const own = await member.req('GET', '/api/v1/memberships');
      expect(own.body.memberships.map((m: { email: string }) => m.email)).toEqual([memberEmail]);

      const viewerEmail = uniqueEmail('viewer');
      await owner.req('POST', '/api/v1/invitations', { email: viewerEmail, role: 'viewer' });
      const mail = await waitForMail(viewerEmail, /invited/);
      await new Client(h.base).req('POST', `${PATH_AUTH}/invitations/accept`, { token: tokenFrom(mail.text), password: 'viewer reading glasses lamp' });
      const viewer = new Client(h.base);
      await viewer.signIn(viewerEmail, 'viewer reading glasses lamp');
      expect((await viewer.req('POST', '/api/v1/projects', { name: 'x', contractor_name: 'y' })).status).toBe(403);
      expect((await viewer.req('GET', '/api/v1/rules/versions')).status).toBe(200);
    });

    it('an expired invitation link is refused (72 hours)', async () => {
      const lateEmail = uniqueEmail('late');
      await owner.req('POST', '/api/v1/invitations', { email: lateEmail, role: 'member' });
      const mail = await waitForMail(lateEmail, /invited/);
      await admin.pool.query("update auth_token set expires_at = now() - interval '1 second' where token_sha256 = sha256(convert_to($1, 'utf8'))", [tokenFrom(mail.text)]);
      const r = await new Client(h.base).req('POST', `${PATH_AUTH}/invitations/accept`, { token: tokenFrom(mail.text), password: 'some long good passphrase' });
      expect(r).toMatchObject({ status: 410, body: { code: 'link_invalid' } });
      expect((await new Client(h.base).req('POST', `${PATH_AUTH}/invitations/accept`, { token: 'x'.repeat(43), password: 'some long good passphrase' })).status).toBe(410);
    });

    it('removing a member revokes their sessions at once; the last owner cannot be removed', async () => {
      const del = await owner.req('DELETE', `/api/v1/memberships/${membershipId}`);
      expect(del).toMatchObject({ status: 200, body: { revoked_sessions: 1 } });
      expect((await member.req('GET', `${PATH_AUTH}/session`)).status).toBe(401);
      expect((await new Client(h.base).signIn(memberEmail, memberPassword)).status).toBe(401);
      const list = await owner.req('GET', '/api/v1/memberships');
      const ownerRow = list.body.memberships.find((m: { email: string }) => m.email === ownerEmail);
      expect((await owner.req('DELETE', `/api/v1/memberships/${ownerRow.id}`)).body.code).toBe('last_owner');
      await clearAddressThrottle();
    });
  });

  describe('cross-tenant', () => {
    it('a session of tenant A gets 404 for tenant B records, and cannot sign in to a tenant it does not belong to', async () => {
      const bOwnerEmail = uniqueEmail('bowner');
      await h.auth.inviteFirstOwner(tenantB, bOwnerEmail, randomUUID());
      const mail = await waitForMail(bOwnerEmail, /workspace is ready/);
      await new Client(h.base).req('POST', `${PATH_AUTH}/invitations/accept`, { token: tokenFrom(mail.text), password: 'baycrest copper fittings' });
      const b = new Client(h.base);
      await b.signIn(bOwnerEmail, 'baycrest copper fittings');
      const p = await b.req('POST', '/api/v1/projects', { name: 'Harbour Lofts', contractor_name: 'Harbourgate Builders Inc.' });
      expect(p.status).toBe(201);
      const sc = await b.req('POST', '/api/v1/subcontracts', { project_id: p.body.id, has_sub_subs: false });
      const inv = await b.req('POST', '/api/v1/invoices', { subcontract_id: sc.body.id, number: 'INV-77', amount_cents: 100_000, holdback_cents: 10_000 });
      expect(inv.status).toBe(201);

      expect((await owner.req('GET', `/api/v1/invoices/${inv.body.id}`)).status).toBe(404);
      expect((await owner.req('POST', '/api/v1/subcontracts', { project_id: p.body.id, has_sub_subs: false })).status).toBe(404);
      const wrongTenant = await new Client(h.base).signIn(ownerEmail, ownerPassword, { totp_code: nextCode(), tenant_id: tenantB });
      expect(wrongTenant.status).toBe(401);
      // A session row pointed at another tenant (as if forged) still has no membership there.
      await admin.pool.query('update auth_session set tenant_id = $2 where user_id = (select id from app_user where email = $1) and revoked_at is null', [ownerEmail, tenantB]);
      expect((await owner.req('GET', `/api/v1/invoices/${inv.body.id}`)).status).toBe(401);
      await admin.pool.query('update auth_session set tenant_id = $2 where user_id = (select id from app_user where email = $1) and revoked_at is null', [ownerEmail, tenantA]);
      await clearAddressThrottle();
    });
  });

  describe('rate limiting and timeouts', () => {
    it('repeated wrong passwords from one client meet increasing delays (429 with Retry-After) for that client, even with the right password; after the delay it works', async () => {
      await clearAddressThrottle();
      const c = new Client(h.base);
      const code = nextCode(); // taken first: advancing the clock later would also end the delay
      for (let i = 0; i < 4; i++) expect((await c.signIn(ownerEmail, 'wrong password attempt')).status).toBe(401);
      const fifth = await c.signIn(ownerEmail, 'wrong password attempt');
      expect(fifth.status).toBe(401);
      const limited = await c.signIn(ownerEmail, ownerPassword, { totp_code: code });
      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
      // Delays, not a lock: once the delay has passed the right credentials work again.
      await admin.pool.query("update auth_throttle set next_allowed_at = now() - interval '1 second' where key like $1", [`%${ownerEmail}%`]);
      expect((await c.signIn(ownerEmail, ownerPassword, { totp_code: code })).status).toBe(200);
      expect((await admin.pool.query("select count(*)::int as n from auth_throttle where key like 'account:%' or key like 'pair:%'")).rows[0].n).toBe(0);
    });

    it('an unknown account gets the same answer as a wrong password and is throttled the same way', async () => {
      const ghost = uniqueEmail('ghost');
      const r = await new Client(h.base).signIn(ghost, 'any long password here');
      expect(r).toMatchObject({ status: 401, body: { code: 'invalid_credentials' } });
      await clearAddressThrottle();
    });

    it('a session idle past its timeout, or past its absolute lifetime, is refused', async () => {
      const c = new Client(h.base);
      await c.signIn(ownerEmail, ownerPassword, { totp_code: nextCode() });
      expect((await c.req('GET', `${PATH_AUTH}/session`)).status).toBe(200);
      await admin.pool.query("update auth_session set idle_expires_at = now() - interval '1 second' where token_sha256 = sha256(convert_to($1, 'utf8'))", [c.cookie]);
      expect((await c.req('GET', `${PATH_AUTH}/session`)).status).toBe(401);
      const d = new Client(h.base);
      await d.signIn(ownerEmail, ownerPassword, { totp_code: nextCode() });
      await admin.pool.query("update auth_session set absolute_expires_at = now() - interval '1 second' where token_sha256 = sha256(convert_to($1, 'utf8'))", [d.cookie]);
      expect((await d.req('GET', `${PATH_AUTH}/session`)).status).toBe(401);
    });
  });

  describe('password reset by email link', () => {
    it('unknown email: same 202 and no mail; known: link in Mailpit, single use, every session revoked, TOTP still required', async () => {
      const ghost = uniqueEmail('ghost');
      expect((await new Client(h.base).req('POST', `${PATH_AUTH}/password-reset/request`, { email: ghost })).status).toBe(202);
      await new Promise((r) => setTimeout(r, 500));
      expect(await mailCount(ghost)).toBe(0);

      const live = new Client(h.base);
      await live.signIn(ownerEmail, ownerPassword, { totp_code: nextCode() });
      expect((await new Client(h.base).req('POST', `${PATH_AUTH}/password-reset/request`, { email: ownerEmail })).status).toBe(202);
      const mail = await waitForMail(ownerEmail, /Reset your PayClock password/);
      expect(mail.text).toContain(`${process.env.APP_PUBLIC_URL}/reset-password#token=`);
      const token = tokenFrom(mail.text);
      const newPassword = 'new lighthouse keeper route';
      expect((await new Client(h.base).req('POST', `${PATH_AUTH}/password-reset/complete`, { token, password: newPassword })).status).toBe(200);
      expect((await new Client(h.base).req('POST', `${PATH_AUTH}/password-reset/complete`, { token, password: 'another fine passphrase' })).status).toBe(410);
      expect((await live.req('GET', `${PATH_AUTH}/session`)).status).toBe(401);
      expect((await new Client(h.base).signIn(ownerEmail, ownerPassword, { totp_code: nextCode() })).status).toBe(401);
      expect((await new Client(h.base).signIn(ownerEmail, newPassword)).body.code).toBe('totp_required');
      expect((await new Client(h.base).signIn(ownerEmail, newPassword, { totp_code: nextCode() })).status).toBe(200);
      await clearAddressThrottle();
    });

    it('an expired reset link is refused; reset requests are throttled per account', async () => {
      await new Client(h.base).req('POST', `${PATH_AUTH}/password-reset/request`, { email: ownerEmail });
      const mail = await waitForMail(ownerEmail, /Reset your PayClock password/);
      // newest message first in Mailpit search; mark that token expired
      await admin.pool.query("update auth_token set expires_at = now() - interval '1 second' where kind = 'password_reset' and used_at is null");
      expect((await new Client(h.base).req('POST', `${PATH_AUTH}/password-reset/complete`, { token: tokenFrom(mail.text), password: 'yet another passphrase ok' })).status).toBe(410);
      const c = new Client(h.base);
      let limited = false;
      for (let i = 0; i < 4 && !limited; i++) limited = (await c.req('POST', `${PATH_AUTH}/password-reset/request`, { email: ownerEmail })).status === 429;
      expect(limited).toBe(true);
      await admin.pool.query("delete from auth_throttle where key like 'reset:%'");
    });
  });

  describe('operators', () => {
    it('an operator without TOTP gets a restricted session; enrolment needs the out-of-band single-use code (B2-S06)', async () => {
      const opEmail = uniqueEmail('operator');
      await expect(h.auth.inviteFirstOwner(tenantB, opEmail, randomUUID())).rejects.toMatchObject({ code: 'owner_exists' });
      const id = randomUUID();
      await admin.pool.query("insert into app_user (id, email, display_name, is_operator) values ($1, $2, 'Synthetic operator', true)", [id, opEmail]);
      await admin.pool.query('insert into user_credential (user_id, password_hash, password_changed_at) select $1, password_hash, now() from user_credential c join app_user u on u.id = c.user_id where u.email = $2', [id, ownerEmail]);
      const op = new Client(h.base);
      const r = await op.signIn(opEmail, 'new lighthouse keeper route');
      expect(r).toMatchObject({ status: 200, body: { restricted: true, tenant_id: null } });
      expect((await op.req('GET', '/api/v1/rules/versions')).body.code).toBe('totp_enrolment_required');
      // The password alone does not let anyone choose the operator's second factor.
      expect((await op.req('POST', `${PATH_AUTH}/totp/enroll`, {})).body.code).toBe('enrolment_token_required');
      expect((await op.req('POST', `${PATH_AUTH}/totp/enroll`, { enrolment_token: 'x'.repeat(43) })).status).toBe(410);
      await h.auth.issueOperatorEnrolment(opEmail, randomUUID());
      const mail = await waitForMail(opEmail, /authenticator/);
      const code = /24 hours\):\s+([A-Za-z0-9_-]{43})\s/.exec(mail.text)![1]!;
      expect((await op.req('POST', `${PATH_AUTH}/totp/enroll`, { enrolment_token: code })).status).toBe(200);
      expect((await op.req('POST', `${PATH_AUTH}/totp/enroll`, { enrolment_token: code })).status).toBe(410); // single use
    });
  });
});
