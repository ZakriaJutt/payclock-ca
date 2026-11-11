import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tables, type TenantDb, type Tx } from '@payclock/db';
import {
  addEvent, AuthError, correctEvent, createInvoice, createProject, createSubcontract, documentLink, DomainError, downloadDocument, getInvoice,
  getRecomputation, MAX_FILE_BYTES, resolveMembership, uploadDocument, type Actor, type DocumentDeps, type LocalAuthService, type SessionContext,
} from '@payclock/domain';
import { normaliseCorrelationId, withCorrelation, type Logger, type Queue } from '@payclock/platform';
import { canonicalJson } from '@payclock/rules';
import { clearedCookie, readCookie, sessionCookie, type AuthProvider } from './auth.ts';

/**
 * `/api/v1` (TRD 5.2). Framework-free handlers on node:http; a Next.js route handler can wrap
 * `handle` unchanged (AD-01 departure recorded in the verification report).
 *
 * B2: the caller is identified only by the session cookie, checked in the database on every
 * request, then by a live membership of the session's tenant. State-changing requests need the
 * session's anti-forgery token in `X-CSRF-Token`, a JSON or file content type (never a
 * form-encodable one) and, when the browser sends `Origin`, the APP_PUBLIC_URL origin.
 */
export interface AppDeps {
  db: TenantDb;
  auth: AuthProvider;
  /** Sign-in, links, TOTP and team routes; absent in tests that only exercise the core path. */
  localAuth?: LocalAuthService | null;
  documents?: DocumentDeps | null;
  logger: Logger;
  queue?: Queue | null;
  cookieName?: string;
  publicUrl?: string;
  sessionMaxAgeS?: number;
  storagePing?: () => Promise<boolean>;
}

interface Reply {
  status: number;
  body: unknown;
  headers?: Record<string, string | string[]>;
  raw?: { body: Buffer; contentType: string; filename: string };
  /** Runs after the transaction commits (email), never on an idempotent replay. */
  after?: () => Promise<void>;
}

interface Ctx {
  actor: Actor;
  tx: Tx;
  body: Record<string, unknown>;
  rawBody: Buffer;
  contentType: string;
  params: string[];
  query: URLSearchParams;
}
type TenantHandler = (ctx: Ctx) => Promise<Reply>;
interface SessionCtx {
  session: SessionContext;
  body: Record<string, unknown>;
  correlationId: string;
}
interface PublicCtx {
  body: Record<string, unknown>;
  correlationId: string;
  address: string;
  priorToken: string | null;
  deviceToken: string | null;
}

type Route =
  | { kind: 'tenant'; method: 'GET' | 'POST' | 'DELETE'; pattern: RegExp; mutating: boolean; raw?: boolean; handler: TenantHandler }
  | { kind: 'session'; method: 'GET' | 'POST'; pattern: RegExp; allowRestricted: boolean; handler: (ctx: SessionCtx) => Promise<Reply> }
  | { kind: 'public'; method: 'POST'; pattern: RegExp; handler: (ctx: PublicCtx) => Promise<Reply> };

const ID = '([^/]+)';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 64 * 1024;

const err = (status: number, code: string, message: string, fields: string[] = [], extra: Record<string, unknown> = {}): Reply => ({ status, body: { code, message, fields, ...extra } });

/** snake_case view of a row; amounts and dates as stored. */
function present(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), v]));
}

export function createApp(deps: AppDeps) {
  const cookieName = deps.cookieName ?? '__Host-payclock_session';
  const deviceCookieName = `${cookieName}_device`;
  const publicOrigin = deps.publicUrl ? new URL(deps.publicUrl).origin : null;
  const needAuth = () => {
    if (!deps.localAuth) throw new DomainError(404, 'not_found', 'no such route');
    return deps.localAuth;
  };
  const needDocs = () => {
    if (!deps.documents) throw new DomainError(404, 'not_found', 'no such route');
    return deps.documents;
  };
  const sessionReply = (s: SessionContext & { role?: string | null }) => ({
    user_id: s.userId, tenant_id: s.tenantId, role: s.role ?? null, restricted: s.restricted, totp_verified: s.totpVerified, csrf_token: s.csrfToken, idle_expires_at: s.idleExpiresAt,
  });

  const routes: Route[] = [
    // ---------- sign-in and links (no session) ----------
    {
      kind: 'public', method: 'POST', pattern: /^\/api\/v1\/auth\/sign-in$/,
      handler: async ({ body, correlationId, address, priorToken, deviceToken }) => {
        const r = await needAuth().signIn(body, { address, correlationId, priorToken, deviceToken });
        return {
          status: 200, body: sessionReply(r),
          headers: { 'set-cookie': [sessionCookie(cookieName, r.token, deps.sessionMaxAgeS ?? 7 * 86400), sessionCookie(deviceCookieName, r.deviceToken, 180 * 86400)] },
        };
      },
    },
    {
      kind: 'public', method: 'POST', pattern: /^\/api\/v1\/auth\/password-reset\/request$/,
      handler: async ({ body, correlationId, address }) => {
        await needAuth().requestPasswordReset(body, { address, correlationId });
        return { status: 202, body: { status: 'if an account exists, an email is on its way' } };
      },
    },
    {
      kind: 'public', method: 'POST', pattern: /^\/api\/v1\/auth\/password-reset\/complete$/,
      handler: async ({ body, correlationId }) => {
        await needAuth().completePasswordReset(body, correlationId);
        return { status: 200, body: { status: 'password changed; sign in again' } };
      },
    },
    {
      kind: 'public', method: 'POST', pattern: /^\/api\/v1\/auth\/invitations\/accept$/,
      handler: async ({ body, correlationId, address }) => ({ status: 200, body: await needAuth().acceptInvitation(body, correlationId, address) }),
    },
    // ---------- current session ----------
    { kind: 'session', method: 'GET', pattern: /^\/api\/v1\/auth\/session$/, allowRestricted: true, handler: async ({ session }) => ({ status: 200, body: sessionReply(session) }) },
    {
      kind: 'session', method: 'POST', pattern: /^\/api\/v1\/auth\/sign-out$/, allowRestricted: true,
      handler: async ({ session, correlationId }) => {
        await needAuth().signOut(session, correlationId);
        return { status: 200, body: { status: 'signed out' }, headers: { 'set-cookie': clearedCookie(cookieName) } };
      },
    },
    {
      kind: 'session', method: 'POST', pattern: /^\/api\/v1\/auth\/sessions\/revoke-all$/, allowRestricted: true,
      handler: async ({ session }) => ({ status: 200, body: { revoked: await needAuth().revokeAllForUser(session.userId, 'user_revoked_all') }, headers: { 'set-cookie': clearedCookie(cookieName) } }),
    },
    { kind: 'session', method: 'POST', pattern: /^\/api\/v1\/auth\/totp\/enroll$/, allowRestricted: true, handler: async ({ session, body }) => ({ status: 200, body: await needAuth().beginTotp(session, body) }) },
    {
      kind: 'session', method: 'POST', pattern: /^\/api\/v1\/auth\/totp\/confirm$/, allowRestricted: true,
      handler: async ({ session, body, correlationId }) => {
        await needAuth().confirmTotp(session, body.code, correlationId);
        return { status: 200, body: { status: 'authenticator enrolled; it is required at every sign-in' } };
      },
    },
    // ---------- team ----------
    {
      kind: 'tenant', method: 'POST', pattern: /^\/api\/v1\/invitations$/, mutating: true,
      handler: async ({ actor, body }) => needAuth().invite(actor, body),
    },
    { kind: 'tenant', method: 'GET', pattern: /^\/api\/v1\/memberships$/, mutating: false, handler: async ({ actor }) => ({ status: 200, body: { memberships: await needAuth().listMemberships(actor) } }) },
    { kind: 'tenant', method: 'DELETE', pattern: new RegExp(`^/api/v1/memberships/${ID}$`), mutating: true, handler: async ({ actor, params }) => ({ status: 200, body: await needAuth().removeMembership(actor, params[0]!) }) },
    // ---------- documents ----------
    {
      kind: 'tenant', method: 'POST', pattern: /^\/api\/v1\/documents$/, mutating: true, raw: true,
      handler: async ({ actor, rawBody, contentType, query }) => ({
        status: 201,
        body: await uploadDocument(needDocs(), actor, { purpose: query.get('purpose'), entity_type: query.get('entity_type'), entity_id: query.get('entity_id'), mime: contentType, body: rawBody }),
      }),
    },
    { kind: 'tenant', method: 'GET', pattern: new RegExp(`^/api/v1/documents/${ID}/link$`), mutating: false, handler: async ({ actor, params }) => ({ status: 200, body: await documentLink(needDocs(), actor, params[0]!) }) },
    {
      kind: 'tenant', method: 'GET', pattern: new RegExp(`^/api/v1/documents/${ID}/content$`), mutating: false,
      handler: async ({ actor, params, query }) => {
        const f = await downloadDocument(needDocs(), actor, params[0]!, query.get('exp'), query.get('sig'));
        return { status: 200, body: null, raw: { body: f.body, contentType: f.mime, filename: f.filename } };
      },
    },
    // ---------- core path (B1) ----------
    { kind: 'tenant', method: 'POST', pattern: /^\/api\/v1\/projects$/, mutating: true, handler: async ({ tx, actor, body }) => ({ status: 201, body: present(await createProject(tx, actor, body as never)) }) },
    { kind: 'tenant', method: 'POST', pattern: /^\/api\/v1\/subcontracts$/, mutating: true, handler: async ({ tx, actor, body }) => ({ status: 201, body: present(await createSubcontract(tx, actor, body as never)) }) },
    { kind: 'tenant', method: 'POST', pattern: /^\/api\/v1\/invoices$/, mutating: true, handler: async ({ tx, actor, body }) => ({ status: 201, body: present(await createInvoice(tx, actor, body as never)) }) },
    {
      kind: 'tenant', method: 'POST', pattern: /^\/api\/v1\/events$/, mutating: true,
      handler: async ({ tx, actor, body }) => {
        const r = await addEvent(tx, actor, body as never);
        return { status: 201, body: { event: present(r.event), recomputation_id: r.recomputation.runId } };
      },
    },
    {
      kind: 'tenant', method: 'POST', pattern: new RegExp(`^/api/v1/events/${ID}/corrections$`), mutating: true,
      handler: async ({ tx, actor, body, params }) => {
        const r = await correctEvent(tx, actor, params[0]!, body as never);
        return { status: 200, body: { event: present(r.event), recomputation_id: r.recomputation.runId } };
      },
    },
    { kind: 'tenant', method: 'GET', pattern: new RegExp(`^/api/v1/invoices/${ID}$`), mutating: false, handler: async ({ tx, actor, params }) => ({ status: 200, body: await getInvoice(tx, actor, params[0]!) }) },
    { kind: 'tenant', method: 'GET', pattern: new RegExp(`^/api/v1/recomputations/${ID}$`), mutating: false, handler: async ({ tx, actor, params }) => ({ status: 200, body: await getRecomputation(tx, actor, params[0]!) }) },
    {
      kind: 'tenant', method: 'GET', pattern: /^\/api\/v1\/rules\/versions$/, mutating: false,
      handler: async ({ tx }) => {
        const v = await tx.select().from(tables.ruleVersion);
        return { status: 200, body: { versions: v.map((x) => ({ code: x.code, revision: x.revision, status: x.status, effective_from: x.effectiveFrom, effective_to: x.effectiveTo, legal_source: x.legalSource, signoff_id: x.signoffId })) } };
      },
    },
  ];

  async function readRaw(req: IncomingMessage, limit: number): Promise<Buffer | null> {
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > limit) return null;
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > limit) return null;
      chunks.push(c as Buffer);
    }
    return Buffer.concat(chunks);
  }

  function parseJson(buf: Buffer): Record<string, unknown> | Reply {
    if (buf.length === 0) return {};
    try {
      const v = JSON.parse(buf.toString('utf8'));
      if (!v || typeof v !== 'object' || Array.isArray(v)) return err(400, 'bad_request', 'body must be a JSON object');
      return v as Record<string, unknown>;
    } catch {
      return err(400, 'bad_request', 'body is not valid JSON');
    }
  }
  const isReply = (v: unknown): v is Reply => !!v && typeof v === 'object' && 'status' in v && 'body' in v && typeof (v as Reply).status === 'number';

  async function dispatch(req: IncomingMessage, correlationId: string): Promise<Reply> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/healthz') return { status: 200, body: { status: 'ok' } };
    if (req.method === 'GET' && url.pathname === '/readyz') {
      const database = await deps.db.ping();
      const queue = deps.queue ? await deps.queue.ping() : null;
      const storage = deps.storagePing ? await deps.storagePing() : null;
      const ok = database && queue !== false && storage !== false;
      return { status: ok ? 200 : 503, body: { status: ok ? 'ready' : 'unavailable', checks: { database, queue, storage } } };
    }
    const route = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));
    if (!route) return err(404, 'not_found', 'no such route');
    const params = route.pattern.exec(url.pathname)!.slice(1);
    if (params.some((x) => !UUID.test(x))) return err(422, 'unprocessable', 'id must be a UUID', ['id']);

    const changing = req.method !== 'GET';
    const contentType = String(req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
    const isRaw = route.kind === 'tenant' && route.raw === true;
    if (changing) {
      // Anti-forgery, layer 1: same origin when the browser says where it comes from.
      const origin = req.headers.origin;
      if (origin && origin !== publicOrigin) return err(403, 'origin_refused', 'request origin not allowed');
    }
    const raw = await readRaw(req, isRaw ? MAX_FILE_BYTES : MAX_BODY);
    if (raw === null) return err(413, 'payload_too_large', 'request body too large');
    // Layer 2: no form-encodable content type, so a cross-site form cannot reach a handler.
    if (changing && !isRaw && raw.length > 0 && contentType !== 'application/json') return err(415, 'unsupported_media_type', 'send application/json');
    if (changing && isRaw && /^(application\/x-www-form-urlencoded|multipart\/form-data|text\/plain|)$/.test(contentType)) return err(415, 'unsupported_media_type', 'send the file with its own content type');
    const parsed = isRaw ? {} : parseJson(raw);
    if (isReply(parsed)) return parsed;
    const body = parsed;

    const token = readCookie(req.headers.cookie, cookieName);
    const address = req.socket.remoteAddress ?? 'unknown';
    if (route.kind === 'public') return route.handler({ body, correlationId, address, priorToken: token, deviceToken: readCookie(req.headers.cookie, deviceCookieName) });

    const session = token ? await deps.auth.authenticate(token) : null;
    if (!session) return err(401, 'unauthenticated', 'sign in required');
    // Layer 3: the session's own anti-forgery token on every state-changing call.
    if (changing && !deps.auth.checkCsrf(session, req.headers['x-csrf-token'] as string | undefined)) return err(403, 'csrf_refused', 'missing or wrong X-CSRF-Token');
    if (route.kind === 'session') {
      if (session.restricted && !route.allowRestricted) return err(403, 'totp_enrolment_required', 'enrol an authenticator first');
      return route.handler({ session, body, correlationId });
    }
    if (session.restricted) return err(403, 'totp_enrolment_required', 'enrol an authenticator first');
    if (!session.tenantId) return err(403, 'no_workspace', 'this session has no workspace');
    const actor = await resolveMembership(deps.db, session.userId, session.tenantId, correlationId);
    if (!actor) return err(401, 'unauthenticated', 'no active membership');

    const key = req.headers['idempotency-key'];
    if (route.mutating && (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(key))) {
      return err(400, 'idempotency_key_required', 'mutating calls need an Idempotency-Key header (8-128 characters)', ['Idempotency-Key']);
    }
    const bodyHash = isRaw ? createHash('sha256').update(raw).digest('hex') + url.search : canonicalJson(body);
    const requestHash = createHash('sha256').update(`${req.method} ${url.pathname} ${bodyHash}`).digest('hex');

    const run = () =>
      deps.db.withTenant(actor.tenantId, async (tx) => {
        if (route.mutating) {
          // Serialise requests sharing a key: the second waits here, then replays the stored reply.
          await tx.raw.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`idem:${actor.tenantId}:${key}`]);
          const prior = await tx.raw.query<{ request_sha256: string; status_code: number; response: unknown }>(
            'select request_sha256, status_code, response from api_idempotency where idempotency_key = $1',
            [key],
          );
          if (prior.rows[0]) {
            if (prior.rows[0].request_sha256 !== requestHash) return err(422, 'idempotency_key_reused', 'this Idempotency-Key was used for a different request', ['Idempotency-Key']);
            return { status: prior.rows[0].status_code, body: prior.rows[0].response };
          }
        }
        const reply = await route.handler({ actor, tx, body, rawBody: raw, contentType, params, query: url.searchParams });
        if (route.mutating) {
          await tx.raw.query(
            'insert into api_idempotency (tenant_id, idempotency_key, method, path, request_sha256, status_code, response) values ($1, $2, $3, $4, $5, $6, $7)',
            [actor.tenantId, key, req.method, url.pathname, requestHash, reply.status, JSON.stringify(reply.body)],
          );
        }
        return reply;
      });

    let reply: Reply;
    try {
      reply = await run();
    } catch (e) {
      const pgCode = (e as { code?: string }).code;
      if (!(route.mutating && pgCode === '23505' && String((e as Error).message).includes('api_idempotency_key'))) throw e;
      reply = await run(); // a concurrent request with the same key committed first: return its stored reply
    }
    if (reply.after) {
      try {
        await reply.after();
      } catch (e) {
        deps.logger.error('request.after_commit_failed', { error_class: (e as Error).name });
      }
    }
    return reply;
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const correlationId = normaliseCorrelationId(req.headers['x-correlation-id'] as string | undefined);
    await withCorrelation({ correlationId }, async () => {
      let reply: Reply;
      const started = Date.now();
      try {
        reply = await dispatch(req, correlationId);
      } catch (e) {
        if (e instanceof AuthError) {
          reply = err(e.status, e.code, e.message, e.fields, Object.keys(e.details).length ? { details: e.details } : {});
          if (e.retryAfterS) reply.headers = { 'retry-after': String(e.retryAfterS) };
        } else if (e instanceof DomainError) reply = err(e.status, e.code, e.message, e.fields, Object.keys(e.details).length ? { details: e.details } : {});
        else {
          deps.logger.error('request.failed', { error_class: (e as Error).name, pg_code: (e as { code?: string }).code });
          reply = err(500, 'internal', 'internal error');
        }
      }
      deps.logger.info('request', { method: req.method, route: (req.url ?? '').split('?')[0]!.replace(/[0-9a-f-]{36}/g, ':id'), status: reply.status, ms: Date.now() - started });
      const common = { 'x-correlation-id': correlationId, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...reply.headers };
      if (reply.raw) {
        res.writeHead(reply.status, { ...common, 'content-type': reply.raw.contentType, 'content-disposition': `attachment; filename="${reply.raw.filename}"`, 'content-length': String(reply.raw.body.length) });
        res.end(reply.raw.body);
        return;
      }
      res.writeHead(reply.status, { ...common, 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(reply.body));
    });
  };
}
