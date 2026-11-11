import type { TenantDb } from '@payclock/db';
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
  /** Long-lived device cookie value for this account (exempts this browser from the account-wide delay). */
  deviceToken: string;
  role: Role | null;
}

/**
 * Attempt policy (TRD 8.1; B2 security round 1, findings B2-S01 and B2-S02). Every attempt is
 * reserved before any password or code is checked, in one transaction that locks the counter
 * rows, so a parallel burst gets no extra tries. The longest delays apply per client (one address,
 * or one account from one address); the account-wide delay is capped short, so someone who only
 * knows an owner's email can slow that owner by at most `account.capS` seconds, never lock them
 * out. A successful sign-in clears the account and pair counters and gives back its address slot.
 */
export const THROTTLE = {
  /** Same account from the same client address. */
  pair: { free: 4, capS: 900 },
  /** One client address across all accounts (password spraying). */
  address: { free: 20, capS: 900 },
  /** Account-wide, from any address without a device cookie: short cap, so it cannot be used as a lock-out. */
  account: { free: 5, capS: 30 },
  /** A browser holding a device cookie for this account (it is exempt from the account-wide delay). */
  device: { free: 4, capS: 900 },
  /** Reset requests per account (inbox flooding). */
  reset: { free: 3, capS: 300 },
  /** Invitations per workspace. */
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

  // ---------- throttling (V6.3.1, V6.1.1: delays, never a lock-out) ----------
  /**
   * Reserve one attempt on every key, atomically: the rows are locked (in key order, so two
   * requests cannot deadlock), and if any key is in its delay nothing is counted and the call is
   * refused with 429. Otherwise every counter goes up and the next delay is set before the caller
   * checks the password or code.
   */
  private async reserve(pairs: Array<[ThrottleKind, string]>): Promise<void> {
    const now = this.now();
    const keys = [...new Set(pairs.map(([k, v]) => `${k}:${v}`))].sort();
    const wait = await this.db.withIdentity(async (tx) => {
      await tx.raw.query('insert into auth_throttle (key, failures, updated_at) select k, 0, $2 from unnest($1::text[]) as k order by k on conflict (key) do nothing', [keys, new Date(now)]);
      const rows = (await tx.raw.query<{ key: string; failures: number; next_allowed_at: Date | null; updated_at: Date }>(
        'select key, failures, next_allowed_at, updated_at from auth_throttle where key = any($1::text[]) order by key for update', [keys])).rows;
      let longest = 0;
      for (const r of rows) {
        const stale = r.updated_at.getTime() < now - DECAY_MS;
        const next = stale ? null : r.next_allowed_at;
        if (next && next.getTime() > now) longest = Math.max(longest, Math.ceil((next.getTime() - now) / 1000));
      }
      if (longest > 0) return longest;
      for (const r of rows) {
        const p = THROTTLE[r.key.slice(0, r.key.indexOf(':')) as ThrottleKind];
        const failures = (r.updated_at.getTime() < now - DECAY_MS ? 0 : r.failures) + 1;
        const delayS = failures <= p.free ? 0 : Math.min(p.capS, 2 ** (failures - p.free));
        await tx.raw.query('update auth_throttle set failures = $2, next_allowed_at = $3, updated_at = $4 where key = $1',
          [r.key, failures, delayS ? new Date(now + delayS * 1000) : null, new Date(now)]);
      }
      return 0;
    });
    if (wait > 0) throw new AuthError(429, 'too_many_attempts', 'too many attempts; try again later', [], {}, wait);
  }

  /** After a successful sign-in: account and pair counters cleared, the address slot given back. */
  private async attemptSucceeded(email: string, address: string): Promise<void> {
    await this.db.withIdentity(async (tx) => {
      await tx.raw.query('delete from auth_throttle where key = any($1::text[])', [[`account:${email}`, `pair:${email}|${address}`]]);
      await tx.raw.query(
        `update auth_throttle set failures = greatest(failures - 1, 0),
           next_allowed_at = case when failures - 1 <= $2 then null else next_allowed_at end where key = $1`,
        [`address:${address}`, THROTTLE.address.free]);
    });
  }

  /**
   * A browser that once signed in to this account carries a device cookie bound to the account
   * (HMAC under AUTH_SECRET_KEY). It is counted on its own key instead of the account-wide one,
   * so attacks from elsewhere never delay the owner's usual browser (OWASP device cookies).
   */
  private deviceId(email: string, deviceToken: string | null | undefined): string | null {
    const m = deviceToken ? /^([A-Za-z0-9_-]{22})\.([0-9a-f]{64})$/.exec(deviceToken) : null;
    return m && safeEqual(m[2]!, hmacHex(this.s.secretKey, `device:${email}:${m[1]}`)) ? m[1]! : null;
  }

  private newDeviceToken(email: string): string {
    const id = randomToken(16);
    return `${id}.${hmacHex(this.s.secretKey, `device:${email}:${id}`)}`;
  }

  private credentialKeys(email: string, address: string, deviceId: string | null = null): Array<[ThrottleKind, string]> {
    return [['pair', `${email}|${address}`], ['address', address], deviceId ? ['device', `${email}|${deviceId}`] : ['account', email]];
  }

  // ---------- background work (mail that must not change the reply's timing) ----------
  private readonly pending = new Set<Promise<void>>();

  private background(correlationId: string, fn: () => Promise<void>): void {
    const p: Promise<void> = fn()
      .catch(() => this.authEvent('auth.background_failed', null, null, correlationId).catch(() => undefined))
      .finally(() => this.pending.delete(p));
    this.pending.add(p);
  }

  /** Waits for queued background work (tests, and the server before shutdown). */
  async settle(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending]);
  }

  private async authEvent(action: string, userId: string | null, tenantId: string | null, correlationId: string): Promise<void> {
    await this.db.pool.query('select record_auth_event($1, $2, $3, $4)', [action, userId, tenantId, correlationId]);
  }

  // ---------- sign-in ----------
  async signIn(input: { email?: unknown; password?: unknown; totp_code?: unknown; tenant_id?: unknown }, client: { address: string; correlationId: string; priorToken?: string | null; deviceToken?: string | null }): Promise<SignInResult> {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!EMAIL.test(email) || !password || password.length > 1024) throw new AuthError(422, 'unprocessable', 'email and password are required', ['email', 'password']);
    const wanted = input.tenant_id === undefined || input.tenant_id === null ? null : uuidField(input.tenant_id, 'tenant_id');
    const deviceId = this.deviceId(email, client.deviceToken);
    await this.reserve(this.credentialKeys(email, client.address, deviceId));

    const user = await this.db.withIdentity(async (tx) => (await tx.raw.query<{ id: string; is_operator: boolean; password_hash: string | null; totp_secret_enc: Buffer | null; totp_last_step: number | null }>(
      `select u.id, u.is_operator, c.password_hash, c.totp_secret_enc, c.totp_last_step
       from app_user u left join user_credential c on c.user_id = u.id where u.email = $1`, [email])).rows[0]);
    const fail = async (why: string) => {
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

    await this.attemptSucceeded(email, client.address);
    if (deviceId) await this.db.withIdentity((tx) => tx.raw.query('delete from auth_throttle where key = $1', [`device:${email}|${deviceId}`]));
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
    const deviceToken = deviceId ? client.deviceToken! : this.newDeviceToken(email);
    return { token, deviceToken, sessionId: session, userId: user.id, tenantId, role, restricted, totpVerified, csrfToken: this.csrfFor(session), idleExpiresAt: idle.toISOString() };
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
    await this.reserve([['invite', actor.tenantId]]); // counts every invitation
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

  async acceptInvitation(input: { token?: unknown; password?: unknown; display_name?: unknown }, correlationId: string, address = 'unknown'): Promise<{ user_id: string; tenant_id: string; role: Role }> {
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
      // An existing account proves it is the same person with its current password, under the
      // same attempt limits as sign-in (B2-S04): a link holder gets no extra guesses.
      await this.reserve(this.credentialKeys(row.email, address));
      if (!(await verifyPassword(password, row.password_hash))) {
        await this.authEvent('auth.sign_in_failed.invitation_password', row.user_id, null, correlationId);
        throw invalid();
      }
      await this.attemptSucceeded(row.email, address);
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
  /**
   * The reply is the same, with the same work done before it, for known and unknown addresses
   * (B2-S03, V6.3.8): only the input check and the attempt reservation run before replying; the
   * account lookup, the link and the email run afterwards in the background. If the process
   * stops before the email is sent, the person asks again.
   */
  async requestPasswordReset(input: { email?: unknown }, client: { address: string; correlationId: string }): Promise<void> {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (!EMAIL.test(email)) throw new AuthError(422, 'unprocessable', 'a valid email is required', ['email']);
    await this.reserve([['reset', email], ['address', client.address]]);
    this.background(client.correlationId, () => this.sendPasswordReset(email, client.correlationId));
  }

  private async sendPasswordReset(email: string, correlationId: string): Promise<void> {
    const user = await this.db.withIdentity(async (tx) => (await tx.raw.query<{ id: string }>(
      'select u.id from app_user u join user_credential c on c.user_id = u.id where u.email = $1 and c.password_hash is not null', [email])).rows[0]);
    await this.authEvent('auth.reset_requested', user?.id ?? null, null, correlationId);
    if (!user) return;
    const token = randomToken();
    await this.db.withIdentity(async (tx) => {
      await tx.raw.query("update auth_token set used_at = now() where user_id = $1 and kind = 'password_reset' and used_at is null", [user.id]);
      await tx.raw.query("insert into auth_token (kind, token_sha256, user_id, expires_at) values ('password_reset', $1, $2, $3)", [sha256(token), user.id, new Date(this.now() + (this.s.resetMinutes ?? 60) * 60_000)]);
    });
    await this.mailer.send({
      to: email,
      subject: 'Reset your PayClock password',
      text: `A password reset was requested for your PayClock account.\n\nChoose a new password here (the link works once and expires in 60 minutes):\n${this.s.publicUrl}/reset-password#token=${token}\n\nYour authenticator code is still required after the reset. If you did not ask for this, ignore this email.`,
      correlationId,
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
  /**
   * Operators must have TOTP (TRD 8.1) and the password alone must not be enough to choose it
   * (B2-S06): an operator's first authenticator needs a single-use enrolment token issued out of
   * band (`npm run auth:operator-enrolment`, 24 hours), sent to the operator's address.
   */
  async issueOperatorEnrolment(emailIn: string, correlationId: string): Promise<void> {
    const email = emailIn.trim().toLowerCase();
    const token = randomToken();
    const userId = await this.db.withIdentity(async (tx) => {
      const u = (await tx.raw.query<{ id: string }>(
        'select u.id from app_user u join user_credential c on c.user_id = u.id where u.email = $1 and u.is_operator and c.totp_enabled_at is null', [email])).rows[0];
      if (!u) throw new AuthError(404, 'not_found', 'no operator without an authenticator has this email');
      await tx.raw.query("update auth_token set used_at = now() where user_id = $1 and kind = 'totp_enrolment' and used_at is null", [u.id]);
      await tx.raw.query("insert into auth_token (kind, token_sha256, user_id, expires_at) values ('totp_enrolment', $1, $2, $3)", [sha256(token), u.id, new Date(this.now() + 24 * 3600_000)]);
      return u.id;
    });
    await this.authEvent('auth.operator_enrolment_issued', userId, null, correlationId);
    await this.mailer.send({
      to: email,
      subject: 'Set up your PayClock authenticator',
      text: `Use this one-time enrolment code when you add your authenticator app (it works once and expires in 24 hours):\n${token}\n\nIf you did not expect this, tell the PayClock founder.`,
      correlationId,
    });
  }

  async beginTotp(session: SessionContext, input: { enrolment_token?: unknown } = {}): Promise<{ secret: string; otpauth_uri: string }> {
    const secret = randomBytes(20);
    const done = await this.db.withIdentity(async (tx) => {
      const r = await tx.raw.query<{ email: string; enabled: Date | null }>(
        'select u.email, c.totp_enabled_at as enabled from app_user u join user_credential c on c.user_id = u.id where u.id = $1', [session.userId]);
      if (!r.rows[0]) throw new AuthError(404, 'not_found', 'account not found');
      if (r.rows[0].enabled) throw new AuthError(409, 'totp_already_enabled', 'an authenticator is already enrolled');
      if (session.restricted) {
        const t = typeof input.enrolment_token === 'string' ? input.enrolment_token : '';
        if (!t) throw new AuthError(403, 'enrolment_token_required', 'an operator needs the enrolment code sent to them', ['enrolment_token']);
        const used = await tx.raw.query(
          "update auth_token set used_at = now() where token_sha256 = $1 and kind = 'totp_enrolment' and user_id = $2 and used_at is null and expires_at > $3",
          [sha256(t), session.userId, new Date(this.now())]);
        if (!used.rowCount) throw linkInvalid();
      }
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
