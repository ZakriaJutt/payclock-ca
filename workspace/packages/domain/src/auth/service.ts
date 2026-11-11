import type { TenantDb, Tx } from '@payclock/db';
import type { Mailer } from '@payclock/platform';
import type { Actor, Role } from '../actor.ts';
import { audit } from '../audit.ts';
import { DomainError, uuidField } from '../errors.ts';
import {
  base32Encode, burnPasswordCheck, decrypt, encrypt, hashPassword, hmacHex, randomToken, safeEqual, sha256, verifyPassword, verifyTotp,
} from './crypto.ts';
import { randomBytes } from 'node:crypto';
import { checkPassword } from './password-policy.ts';

/**
 * Local sign-in (TRD 8.1, AD-08; T-2.2.2): email and password, TOTP optional for tenant users and
 * required for operators, database sessions, single-use invitation and reset links sent by email,
 * increasing delays instead of hard locks. Supabase Auth, named in the TRD, is a deferred option
 * behind the same `AuthProvider` interface in apps/web; it is not built.
 */
export class AuthError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429,
    readonly code: string,
    message: string,
    readonly fields: string[] = [],
    readonly details: Record<string, unknown> = {},
    readonly retryAfterS?: number,
  ) {
    super(message);
  }
}

export interface AuthSettings {
  secretKey: Buffer;
  publicUrl: string;
  idleMinutes: number;
  absoluteHours: number;
  scryptLog2n: number;
  invitationHours?: number;
  resetMinutes?: number;
  now?: () => number;
}

export interface SessionContext {
  sessionId: string;
  userId: string;
  tenantId: string | null;
  restricted: boolean;
  totpVerified: boolean;
  csrfToken: string;
  idleExpiresAt: string;
}

export interface SignInResult extends SessionContext {
  token: string;
  role: Role | null;
}

/** Failed-attempt policy: no delay for the first few failures, then doubling up to 15 minutes. */
const THROTTLE = {
  account: { free: 4, capS: 900 },
  address: { free: 20, capS: 900 },
  reset: { free: 3, capS: 3600 },
  invite: { free: 20, capS: 3600 },
} as const;
type ThrottleKind = keyof typeof THROTTLE;
const DECAY_MS = 60 * 60 * 1000;

const invalid = () => new AuthError(401, 'invalid_credentials', 'email, password or authenticator code not accepted');
const linkInvalid = () => new AuthError(410, 'link_invalid', 'this link has expired or was already used');
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

export class LocalAuthService {
  private readonly now: () => number;

  constructor(
    private readonly db: TenantDb,
    private readonly mailer: Mailer,
    private readonly s: AuthSettings,
  ) {
    if (s.secretKey.length !== 32) throw new Error('auth secret key must be 32 bytes');
    this.now = s.now ?? Date.now;
  }

  csrfFor(sessionId: string): string {
    return hmacHex(this.s.secretKey, `csrf:${sessionId}`);
  }

  // ---------- throttling (V6.3.1, V6.1.1: delays, never a hard lock) ----------
  private async throttleWait(tx: Tx, kind: ThrottleKind, key: string): Promise<number> {
    const r = await tx.raw.query<{ next_allowed_at: Date | null }>('select next_allowed_at from auth_throttle where key = $1', [`${kind}:${key}`]);
    const next = r.rows[0]?.next_allowed_at;
    const wait = next ? Math.ceil((next.getTime() - this.now()) / 1000) : 0;
    return wait > 0 ? wait : 0;
  }

  private async throttleFail(kind: ThrottleKind, key: string): Promise<void> {
    const p = THROTTLE[kind];
    await this.db.withIdentity(async (tx) => {
      const now = new Date(this.now());
      const r = await tx.raw.query<{ failures: number; updated_at: Date }>(
        `insert into auth_throttle (key, failures, updated_at) values ($1, 1, $2)
         on conflict (key) do update set failures = case when auth_throttle.updated_at < $3 then 1 else auth_throttle.failures + 1 end, updated_at = $2
         returning failures, updated_at`,
        [`${kind}:${key}`, now, new Date(this.now() - DECAY_MS)],
      );
      const failures = r.rows[0]!.failures;
      const delayS = failures <= p.free ? 0 : Math.min(p.capS, 2 ** (failures - p.free));
      await tx.raw.query('update auth_throttle set next_allowed_at = $2 where key = $1', [`${kind}:${key}`, delayS ? new Date(this.now() + delayS * 1000) : null]);
    });
  }

  private async throttleClear(kind: ThrottleKind, key: string): Promise<void> {
    await this.db.withIdentity((tx) => tx.raw.query('delete from auth_throttle where key = $1', [`${kind}:${key}`]));
  }

  private async assertNotThrottled(pairs: Array<[ThrottleKind, string]>): Promise<void> {
    const waits = await this.db.withIdentity(async (tx) => Promise.all(pairs.map(([k, v]) => this.throttleWait(tx, k, v))));
    const wait = Math.max(0, ...waits);
    if (wait > 0) throw new AuthError(429, 'too_many_attempts', 'too many attempts; try again later', [], {}, wait);
  }

  private async authEvent(action: string, userId: string | null, tenantId: string | null, correlationId: string): Promise<void> {
    await this.db.pool.query('select record_auth_event($1, $2, $3, $4)', [action, userId, tenantId, correlationId]);
  }

  // ---------- sign-in ----------
  async signIn(input: { email?: unknown; password?: unknown; totp_code?: unknown; tenant_id?: unknown }, client: { address: string; correlationId: string; priorToken?: string | null }): Promise<SignInResult> {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!EMAIL.test(email) || !password || password.length > 1024) throw new AuthError(422, 'unprocessable', 'email and password are required', ['email', 'password']);
    const wanted = input.tenant_id === undefined || input.tenant_id === null ? null : uuidField(input.tenant_id, 'tenant_id');
    await this.assertNotThrottled([['account', email], ['address', client.address]]);

    const user = await this.db.withIdentity(async (tx) => (await tx.raw.query<{ id: string; is_operator: boolean; password_hash: string | null; totp_secret_enc: Buffer | null; totp_last_step: number | null }>(
      `select u.id, u.is_operator, c.password_hash, c.totp_secret_enc, c.totp_last_step
       from app_user u left join user_credential c on c.user_id = u.id where u.email = $1`, [email])).rows[0]);
    const fail = async (why: string) => {
      await this.throttleFail('account', email);
      await this.throttleFail('address', client.address);
      await this.authEvent(`auth.sign_in_failed.${why}`, user?.id ?? null, null, client.correlationId);
      return invalid();
    };
    if (!user?.password_hash) {
      await burnPasswordCheck(password, this.s.scryptLog2n);
      throw await fail('unknown_account');
    }
    if (!(await verifyPassword(password, user.password_hash))) throw await fail('password');

    let totpVerified = false;
    if (user.totp_secret_enc) {
      const code = typeof input.totp_code === 'string' ? input.totp_code.trim() : '';
      if (!code) throw new AuthError(401, 'totp_required', 'enter the code from your authenticator app', ['totp_code']);
      const secret = decrypt(this.s.secretKey, user.totp_secret_enc);
      const step = verifyTotp(secret, code, this.now(), user.totp_last_step === null ? null : Number(user.totp_last_step));
      if (step === null) throw await fail('totp');
      // Single use: only one sign-in can record this step (compare-and-set on the last step).
      const won = await this.db.withIdentity((tx) =>
        tx.raw.query('update user_credential set totp_last_step = $2 where user_id = $1 and (totp_last_step is null or totp_last_step < $2)', [user.id, step]));
      if (!won.rowCount) throw await fail('totp_replay');
      totpVerified = true;
    }

    const memberships = (await this.db.pool.query<{ tenant_id: string; role: Role }>('select tenant_id, role from user_active_memberships($1)', [user.id])).rows;
    let tenantId: string | null = null;
    let role: Role | null = null;
    if (wanted) {
      const m = memberships.find((x) => x.tenant_id === wanted);
      if (!m) throw await fail('no_membership');
      ({ tenant_id: tenantId, role } = m);
    } else if (memberships.length === 1) {
      ({ tenant_id: tenantId, role } = memberships[0]!);
    } else if (memberships.length > 1) {
      throw new AuthError(409, 'tenant_choice_required', 'choose a workspace', ['tenant_id'], { tenant_ids: memberships.map((m) => m.tenant_id) });
    } else if (!user.is_operator) {
      throw await fail('no_membership');
    }
    // Operators must use TOTP (TRD 8.1): without it the session may only enrol an authenticator.
    const restricted = user.is_operator && !totpVerified;

    await this.throttleClear('account', email);
    const token = randomToken();
    const now = this.now();
    const absolute = new Date(now + this.s.absoluteHours * 3600_000);
    const idle = new Date(Math.min(now + this.s.idleMinutes * 60_000, absolute.getTime()));
    const session = await this.db.withIdentity(async (tx) => {
      // A new session token on every sign-in (V7.2.4); the cookie the browser presented is revoked.
      if (client.priorToken) await tx.raw.query("update auth_session set revoked_at = now(), revoke_reason = 'replaced_by_sign_in' where token_sha256 = $1 and revoked_at is null", [sha256(client.priorToken)]);
      const r = await tx.raw.query<{ id: string }>(
        `insert into auth_session (token_sha256, csrf_sha256, user_id, tenant_id, totp_verified, restricted, created_at, last_seen_at, idle_expires_at, absolute_expires_at)
         values ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9) returning id`,
        [sha256(token), Buffer.alloc(32), user.id, tenantId, totpVerified, restricted, new Date(now), idle, absolute],
      );
      const id = r.rows[0]!.id;
      await tx.raw.query('update auth_session set csrf_sha256 = $2 where id = $1', [id, sha256(this.csrfFor(id))]);
      return id;
    });
    await this.authEvent('auth.signed_in', user.id, tenantId, client.correlationId);
    return { token, sessionId: session, userId: user.id, tenantId, role, restricted, totpVerified, csrfToken: this.csrfFor(session), idleExpiresAt: idle.toISOString() };
  }

  /** Server-side session check on every request (V7.2.1): unknown, revoked, idle or expired is null. */
  async authenticate(token: string): Promise<SessionContext | null> {
    if (!token || token.length > 200) return null;
    return this.db.withIdentity(async (tx) => {
      const r = await tx.raw.query<{ id: string; user_id: string; tenant_id: string | null; restricted: boolean; totp_verified: boolean; idle_expires_at: Date; absolute_expires_at: Date; last_seen_at: Date }>(
        'select id, user_id, tenant_id, restricted, totp_verified, idle_expires_at, absolute_expires_at, last_seen_at from auth_session where token_sha256 = $1 and revoked_at is null',
        [sha256(token)],
      );
      const s = r.rows[0];
      const now = this.now();
      if (!s || s.idle_expires_at.getTime() <= now || s.absolute_expires_at.getTime() <= now) return null;
      let idle = s.idle_expires_at;
      if (now - s.last_seen_at.getTime() > 60_000) {
        idle = new Date(Math.min(now + this.s.idleMinutes * 60_000, s.absolute_expires_at.getTime()));
        await tx.raw.query('update auth_session set last_seen_at = $2, idle_expires_at = $3 where id = $1', [s.id, new Date(now), idle]);
      }
      return { sessionId: s.id, userId: s.user_id, tenantId: s.tenant_id, restricted: s.restricted, totpVerified: s.totp_verified, csrfToken: this.csrfFor(s.id), idleExpiresAt: idle.toISOString() };
    });
  }

  checkCsrf(session: SessionContext, presented: string | undefined): boolean {
    return typeof presented === 'string' && safeEqual(presented, session.csrfToken);
  }

  /** Server-side invalidation (V7.4.1). */
  async signOut(session: SessionContext, correlationId: string): Promise<void> {
    await this.db.withIdentity((tx) => tx.raw.query("update auth_session set revoked_at = now(), revoke_reason = 'sign_out' where id = $1 and revoked_at is null", [session.sessionId]));
    await this.authEvent('auth.signed_out', session.userId, session.tenantId, correlationId);
  }

  async revokeAllForUser(userId: string, reason: string, tenantId: string | null = null): Promise<number> {
    const r = await this.db.withIdentity((tx) =>
      tx.raw.query('update auth_session set revoked_at = now(), revoke_reason = $2 where user_id = $1 and revoked_at is null and ($3::uuid is null or tenant_id = $3)', [userId, reason, tenantId]));
    return r.rowCount ?? 0;
  }

  /**
   * Onboarding (and the local seed): the first owner of a workspace that has no active owner gets
   * an invitation link by email. Refused once the workspace has an active owner.
   */
  async inviteFirstOwner(tenantId: string, emailIn: string, correlationId: string): Promise<{ membershipId: string }> {
    const email = emailIn.trim().toLowerCase();
    if (!EMAIL.test(email)) throw new DomainError(422, 'unprocessable', 'a valid email is required', ['email']);
    const token = randomToken();
    const expires = new Date(this.now() + (this.s.invitationHours ?? 72) * 3600_000);
    const membershipId = await this.db.withTenant(uuidField(tenantId, 'tenant_id'), async (tx) => {
      const owners = (await tx.raw.query<{ n: number }>("select count(*)::int as n from membership where role = 'owner' and status = 'active'")).rows[0]!.n;
      if (owners > 0) throw new DomainError(409, 'owner_exists', 'this workspace already has an owner');
      let userId = (await tx.raw.query<{ id: string }>('select id from app_user where email = $1', [email])).rows[0]?.id;
      userId ??= (await tx.raw.query<{ id: string }>("insert into app_user (id, email, display_name) values (gen_random_uuid(), $1, 'Workspace owner') returning id", [email])).rows[0]!.id;
      const m = (await tx.raw.query<{ id: string }>(
        `insert into membership (tenant_id, user_id, role, status) values ($1, $2, 'owner', 'invited')
         on conflict (tenant_id, user_id) do update set role = 'owner', status = 'invited' returning id`, [tenantId, userId])).rows[0]!.id;
      await tx.raw.query("update auth_token set used_at = now() where membership_id = $1 and kind = 'invitation' and used_at is null", [m]);
      await tx.raw.query("insert into auth_token (kind, token_sha256, user_id, tenant_id, membership_id, expires_at) values ('invitation', $1, $2, $3, $4, $5)", [sha256(token), userId, tenantId, m, expires]);
      await tx.raw.query("insert into audit_event (tenant_id, actor_id, action, entity_type, entity_id, correlation_id) values ($1, null, 'membership.first_owner_invited', 'membership', $2, $3)", [tenantId, m, correlationId]);
      return m;
    });
    await this.mailer.send({
      to: email,
      subject: 'Your PayClock workspace is ready',
      text: `Your PayClock workspace is ready.\n\nSet your password here (the link works once and expires in 72 hours):\n${this.s.publicUrl}/invitations/accept#token=${token}\n\nIf you did not expect this, ignore this email.`,
      correlationId,
    });
    return { membershipId };
  }

  // ---------- invitations (TRD 5.2: 72 hours, single use) ----------
  async invite(actor: Actor, input: { email?: unknown; role?: unknown }): Promise<{ status: number; body: Record<string, unknown>; after: () => Promise<void> }> {
    if (actor.role !== 'owner') throw new DomainError(403, 'forbidden', 'only an owner manages the team');
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (!EMAIL.test(email)) throw new DomainError(422, 'unprocessable', 'a valid email is required', ['email']);
    if (input.role !== 'owner' && input.role !== 'member' && input.role !== 'viewer') throw new DomainError(422, 'unprocessable', 'role must be owner, member or viewer', ['role']);
    const role = input.role;
    await this.assertNotThrottled([['invite', actor.tenantId]]);
    await this.throttleFail('invite', actor.tenantId); // counts every invitation, not only failures
    const token = randomToken();
    const expires = new Date(this.now() + (this.s.invitationHours ?? 72) * 3600_000);
    const out = await this.db.withTenant(actor.tenantId, async (tx) => {
      let userId = (await tx.raw.query<{ id: string }>('select id from app_user where email = $1', [email])).rows[0]?.id;
      if (!userId) {
        userId = (await tx.raw.query<{ id: string }>("insert into app_user (id, email, display_name) values (gen_random_uuid(), $1, 'Invited user') returning id", [email])).rows[0]!.id;
      }
      const existing = (await tx.raw.query<{ id: string; status: string }>('select id, status from membership where user_id = $1', [userId])).rows[0];
      if (existing?.status === 'active') throw new DomainError(409, 'already_member', 'this person is already a member');
      const membershipId = existing
        ? (await tx.raw.query<{ id: string }>("update membership set status = 'invited', role = $2 where id = $1 returning id", [existing.id, role])).rows[0]!.id
        : (await tx.raw.query<{ id: string }>("insert into membership (tenant_id, user_id, role, status) values ($1, $2, $3, 'invited') returning id", [actor.tenantId, userId, role])).rows[0]!.id;
      await tx.raw.query("update auth_token set used_at = now() where membership_id = $1 and kind = 'invitation' and used_at is null", [membershipId]);
      await tx.raw.query(
        "insert into auth_token (kind, token_sha256, user_id, tenant_id, membership_id, created_by, expires_at) values ('invitation', $1, $2, $3, $4, $5, $6)",
        [sha256(token), userId, actor.tenantId, membershipId, actor.userId, expires],
      );
      await audit(tx, actor, 'membership.invited', 'membership', membershipId, undefined, { role });
      return { membershipId };
    });
    const link = `${this.s.publicUrl}/invitations/accept#token=${token}`;
    return {
      status: 201,
      body: { membership_id: out.membershipId, role, status: 'invited', expires_at: expires.toISOString() },
      // Sent after the commit, so a rolled-back invitation never reaches an inbox.
      after: async () => {
        await this.mailer.send({
          to: email,
          subject: 'You have been invited to a PayClock workspace',
          text: `You have been invited to a PayClock workspace.\n\nSet your password here (the link works once and expires in 72 hours):\n${link}\n\nIf you did not expect this, ignore this email.`,
          correlationId: actor.correlationId,
        });
      },
    };
  }

  async acceptInvitation(input: { token?: unknown; password?: unknown; display_name?: unknown }, correlationId: string): Promise<{ user_id: string; tenant_id: string; role: Role }> {
    const token = typeof input.token === 'string' ? input.token : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!token || !password) throw new AuthError(422, 'unprocessable', 'token and password are required', ['token', 'password']);
    const row = await this.db.withIdentity(async (tx) => (await tx.raw.query<{ id: string; user_id: string; tenant_id: string; membership_id: string; email: string; password_hash: string | null }>(
      `select t.id, t.user_id, t.tenant_id, t.membership_id, u.email, c.password_hash from auth_token t join app_user u on u.id = t.user_id
       left join user_credential c on c.user_id = t.user_id
       where t.token_sha256 = $1 and t.kind = 'invitation' and t.used_at is null and t.expires_at > $2`, [sha256(token), new Date(this.now())])).rows[0]);
    if (!row) throw linkInvalid();
    let newHash: string | null = null;
    if (row.password_hash) {
      // An existing account proves it is the same person with its current password.
      if (!(await verifyPassword(password, row.password_hash))) throw invalid();
    } else {
      const problem = checkPassword(password, row.email);
      if (problem) throw new AuthError(422, `password_${problem}`, 'password not accepted', ['password']);
      newHash = await hashPassword(password, this.s.scryptLog2n);
    }
    const role = await this.db.withTenant(row.tenant_id, async (tx) => {
      const used = await tx.raw.query('update auth_token set used_at = now() where id = $1 and used_at is null', [row.id]);
      if (!used.rowCount) throw linkInvalid();
      if (newHash) {
        await tx.raw.query('insert into user_credential (user_id, password_hash, password_changed_at) values ($1, $2, now()) on conflict (user_id) do update set password_hash = excluded.password_hash, password_changed_at = now()', [row.user_id, newHash]);
      }
      if (typeof input.display_name === 'string' && input.display_name.trim()) {
        await tx.raw.query('update app_user set display_name = $2 where id = $1', [row.user_id, input.display_name.trim().slice(0, 120)]);
      }
      const m = await tx.raw.query<{ role: Role }>("update membership set status = 'active' where id = $1 and status = 'invited' returning role", [row.membership_id]);
      if (!m.rowCount) throw linkInvalid();
      const r = m.rows[0]!.role;
      await audit(tx, { userId: row.user_id, tenantId: row.tenant_id, role: r, correlationId }, 'membership.accepted', 'membership', row.membership_id);
      return r;
    });
    return { user_id: row.user_id, tenant_id: row.tenant_id, role };
  }

  // ---------- password reset (link by email; never removes TOTP, V6.4.3) ----------
  async requestPasswordReset(input: { email?: unknown }, client: { address: string; correlationId: string }): Promise<void> {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (!EMAIL.test(email)) throw new AuthError(422, 'unprocessable', 'a valid email is required', ['email']);
    await this.assertNotThrottled([['reset', email], ['address', client.address]]);
    await this.throttleFail('reset', email);
    const user = await this.db.withIdentity(async (tx) => (await tx.raw.query<{ id: string }>(
      'select u.id from app_user u join user_credential c on c.user_id = u.id where u.email = $1 and c.password_hash is not null', [email])).rows[0]);
    await this.authEvent('auth.reset_requested', user?.id ?? null, null, client.correlationId);
    if (!user) return; // same answer either way (no account enumeration)
    const token = randomToken();
    await this.db.withIdentity(async (tx) => {
      await tx.raw.query("update auth_token set used_at = now() where user_id = $1 and kind = 'password_reset' and used_at is null", [user.id]);
      await tx.raw.query("insert into auth_token (kind, token_sha256, user_id, expires_at) values ('password_reset', $1, $2, $3)", [sha256(token), user.id, new Date(this.now() + (this.s.resetMinutes ?? 60) * 60_000)]);
    });
    await this.mailer.send({
      to: email,
      subject: 'Reset your PayClock password',
      text: `A password reset was requested for your PayClock account.\n\nChoose a new password here (the link works once and expires in 60 minutes):\n${this.s.publicUrl}/reset-password#token=${token}\n\nYour authenticator code is still required after the reset. If you did not ask for this, ignore this email.`,
      correlationId: client.correlationId,
    });
  }

  async completePasswordReset(input: { token?: unknown; password?: unknown }, correlationId: string): Promise<void> {
    const token = typeof input.token === 'string' ? input.token : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!token || !password) throw new AuthError(422, 'unprocessable', 'token and password are required', ['token', 'password']);
    const row = await this.db.withIdentity(async (tx) => (await tx.raw.query<{ id: string; user_id: string; email: string }>(
      `select t.id, t.user_id, u.email from auth_token t join app_user u on u.id = t.user_id
       where t.token_sha256 = $1 and t.kind = 'password_reset' and t.used_at is null and t.expires_at > $2`, [sha256(token), new Date(this.now())])).rows[0]);
    if (!row) throw linkInvalid();
    const problem = checkPassword(password, row.email);
    if (problem) throw new AuthError(422, `password_${problem}`, 'password not accepted', ['password']);
    const hash = await hashPassword(password, this.s.scryptLog2n);
    await this.db.withIdentity(async (tx) => {
      const used = await tx.raw.query('update auth_token set used_at = now() where id = $1 and used_at is null', [row.id]);
      if (!used.rowCount) throw linkInvalid();
      await tx.raw.query('update user_credential set password_hash = $2, password_changed_at = now() where user_id = $1', [row.user_id, hash]);
      // Every existing session ends with the old password (V7.4.3).
      await tx.raw.query("update auth_session set revoked_at = now(), revoke_reason = 'password_reset' where user_id = $1 and revoked_at is null", [row.user_id]);
    });
    await this.authEvent('auth.password_reset', row.user_id, null, correlationId);
  }

  // ---------- TOTP enrolment ----------
  async beginTotp(session: SessionContext): Promise<{ secret: string; otpauth_uri: string }> {
    const secret = randomBytes(20);
    const done = await this.db.withIdentity(async (tx) => {
      const r = await tx.raw.query<{ email: string; enabled: Date | null }>(
        'select u.email, c.totp_enabled_at as enabled from app_user u join user_credential c on c.user_id = u.id where u.id = $1', [session.userId]);
      if (!r.rows[0]) throw new AuthError(404, 'not_found', 'account not found');
      if (r.rows[0].enabled) throw new AuthError(409, 'totp_already_enabled', 'an authenticator is already enrolled');
      await tx.raw.query('update user_credential set totp_pending_enc = $2 where user_id = $1', [session.userId, encrypt(this.s.secretKey, secret)]);
      return r.rows[0].email;
    });
    const b32 = base32Encode(secret);
    return { secret: b32, otpauth_uri: `otpauth://totp/PayClock:${encodeURIComponent(done)}?secret=${b32}&issuer=PayClock&algorithm=SHA1&digits=6&period=30` };
  }

  async confirmTotp(session: SessionContext, code: unknown, correlationId: string): Promise<void> {
    const c = typeof code === 'string' ? code.trim() : '';
    await this.db.withIdentity(async (tx) => {
      const r = await tx.raw.query<{ pending: Buffer | null; enabled: Date | null }>('select totp_pending_enc as pending, totp_enabled_at as enabled from user_credential where user_id = $1 for update', [session.userId]);
      const row = r.rows[0];
      if (!row?.pending || row.enabled) throw new AuthError(409, 'no_pending_enrolment', 'start enrolment first');
      const secret = decrypt(this.s.secretKey, row.pending);
      const step = verifyTotp(secret, c, this.now(), null);
      if (step === null) throw new AuthError(422, 'totp_invalid', 'code not accepted', ['code']);
      await tx.raw.query('update user_credential set totp_secret_enc = totp_pending_enc, totp_pending_enc = null, totp_enabled_at = now(), totp_last_step = $2 where user_id = $1', [session.userId, step]);
    });
    await this.authEvent('auth.totp_enrolled', session.userId, session.tenantId, correlationId);
  }

  // ---------- team (TRD 5.2 memberships) ----------
  async listMemberships(actor: Actor): Promise<Array<Record<string, unknown>>> {
    if (actor.role === 'viewer') throw new DomainError(403, 'forbidden', 'not permitted for this role');
    return this.db.withTenant(actor.tenantId, async (tx) => {
      const r = await tx.raw.query(
        `select m.id, m.user_id, u.email, u.display_name, m.role, m.status, m.created_at from membership m join app_user u on u.id = m.user_id
         where $1 = 'owner' or m.user_id = $2 order by m.created_at`, [actor.role, actor.userId]);
      return r.rows;
    });
  }

  /** Remove a member: membership `removed` and every session of that user in this tenant revoked. */
  async removeMembership(actor: Actor, membershipId: string): Promise<{ revoked_sessions: number }> {
    if (actor.role !== 'owner') throw new DomainError(403, 'forbidden', 'only an owner manages the team');
    const id = uuidField(membershipId, 'id');
    const userId = await this.db.withTenant(actor.tenantId, async (tx) => {
      await tx.raw.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`members:${actor.tenantId}`]);
      const m = (await tx.raw.query<{ user_id: string; role: Role; status: string }>('select user_id, role, status from membership where id = $1', [id])).rows[0];
      if (!m || m.status === 'removed') throw new DomainError(404, 'not_found', 'membership not found');
      if (m.role === 'owner' && m.status === 'active') {
        const owners = (await tx.raw.query<{ n: number }>("select count(*)::int as n from membership where role = 'owner' and status = 'active'")).rows[0]!.n;
        if (owners <= 1) throw new DomainError(409, 'last_owner', 'a workspace keeps at least one owner');
      }
      await tx.raw.query("update membership set status = 'removed' where id = $1", [id]);
      await tx.raw.query("update auth_token set used_at = now() where membership_id = $1 and used_at is null", [id]);
      await audit(tx, actor, 'membership.removed', 'membership', id);
      return m.user_id;
    });
    return { revoked_sessions: await this.revokeAllForUser(userId, 'membership_removed', actor.tenantId) };
  }
}
