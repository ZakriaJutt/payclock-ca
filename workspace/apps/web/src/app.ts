import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tables, type TenantDb, type Tx } from '@payclock/db';
import {
  addEvent, correctEvent, createInvoice, createProject, createSubcontract, DomainError, getInvoice, getRecomputation,
  resolveMembership, type Actor,
} from '@payclock/domain';
import { normaliseCorrelationId, withCorrelation, type Logger, type Queue } from '@payclock/platform';
import { canonicalJson } from '@payclock/rules';
import type { AuthProvider } from './auth.ts';

/**
 * `/api/v1` core path (TRD 5.2). Framework-free handlers on node:http for B1; a Next.js route
 * handler can wrap `handle` unchanged (AD-01 departure recorded in the verification report).
 */
export interface AppDeps {
  db: TenantDb;
  auth: AuthProvider;
  logger: Logger;
  queue?: Queue | null;
}

interface Reply {
  status: number;
  body: unknown;
}

type Handler = (ctx: { actor: Actor; tx: Tx; body: Record<string, unknown>; params: string[] }) => Promise<Reply>;

interface Route {
  method: 'GET' | 'POST';
  pattern: RegExp;
  mutating: boolean;
  handler: Handler;
}

const ID = '([^/]+)';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 64 * 1024;

const routes: Route[] = [
  { method: 'POST', pattern: /^\/api\/v1\/projects$/, mutating: true, handler: async ({ tx, actor, body }) => ({ status: 201, body: present(await createProject(tx, actor, body as never)) }) },
  { method: 'POST', pattern: /^\/api\/v1\/subcontracts$/, mutating: true, handler: async ({ tx, actor, body }) => ({ status: 201, body: present(await createSubcontract(tx, actor, body as never)) }) },
  { method: 'POST', pattern: /^\/api\/v1\/invoices$/, mutating: true, handler: async ({ tx, actor, body }) => ({ status: 201, body: present(await createInvoice(tx, actor, body as never)) }) },
  {
    method: 'POST', pattern: /^\/api\/v1\/events$/, mutating: true,
    handler: async ({ tx, actor, body }) => {
      const r = await addEvent(tx, actor, body as never);
      return { status: 201, body: { event: present(r.event), recomputation_id: r.recomputation.runId } };
    },
  },
  {
    method: 'POST', pattern: new RegExp(`^/api/v1/events/${ID}/corrections$`), mutating: true,
    handler: async ({ tx, actor, body, params }) => {
      const r = await correctEvent(tx, actor, params[0]!, body as never);
      return { status: 200, body: { event: present(r.event), recomputation_id: r.recomputation.runId } };
    },
  },
  { method: 'GET', pattern: new RegExp(`^/api/v1/invoices/${ID}$`), mutating: false, handler: async ({ tx, actor, params }) => ({ status: 200, body: await getInvoice(tx, actor, params[0]!) }) },
  { method: 'GET', pattern: new RegExp(`^/api/v1/recomputations/${ID}$`), mutating: false, handler: async ({ tx, actor, params }) => ({ status: 200, body: await getRecomputation(tx, actor, params[0]!) }) },
  {
    method: 'GET', pattern: /^\/api\/v1\/rules\/versions$/, mutating: false,
    handler: async ({ tx }) => {
      const v = await tx.select().from(tables.ruleVersion);
      return { status: 200, body: { versions: v.map((x) => ({ code: x.code, revision: x.revision, status: x.status, effective_from: x.effectiveFrom, effective_to: x.effectiveTo, legal_source: x.legalSource, signoff_id: x.signoffId })) } };
    },
  },
];

/** snake_case view of a row; amounts and dates as stored. */
function present(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), v]));
}

const err = (status: number, code: string, message: string, fields: string[] = [], extra: Record<string, unknown> = {}): Reply => ({ status, body: { code, message, fields, ...extra } });

type BodyResult = { ok: true; value: Record<string, unknown> } | { ok: false; reply: Reply };

async function readBody(req: IncomingMessage): Promise<BodyResult> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) return { ok: false, reply: err(413, 'payload_too_large', 'request body too large') };
    chunks.push(c as Buffer);
  }
  if (size === 0) return { ok: true, value: {} };
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, reply: err(400, 'bad_request', 'body must be a JSON object') };
    return { ok: true, value: v as Record<string, unknown> };
  } catch {
    return { ok: false, reply: err(400, 'bad_request', 'body is not valid JSON') };
  }
}

export function createApp(deps: AppDeps) {
  async function dispatch(req: IncomingMessage, correlationId: string): Promise<Reply> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/healthz') return { status: 200, body: { status: 'ok' } };
    if (req.method === 'GET' && url.pathname === '/readyz') {
      const database = await deps.db.ping();
      const queue = deps.queue ? await deps.queue.ping() : null;
      const ok = database && queue !== false;
      return { status: ok ? 200 : 503, body: { status: ok ? 'ready' : 'unavailable', checks: { database, queue } } };
    }
    const route = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));
    if (!route) return err(404, 'not_found', 'no such route');
    const params = route.pattern.exec(url.pathname)!.slice(1);
    if (params.some((x) => !UUID.test(x))) return err(422, 'unprocessable', 'id must be a UUID', ['id']);

    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    const session = token ? await deps.auth.verify(token) : null;
    if (!session) return err(401, 'unauthenticated', 'sign in required');
    const actor = await resolveMembership(deps.db, session.userId, session.tenantId, correlationId);
    if (!actor) return err(401, 'unauthenticated', 'no active membership');

    const parsed: BodyResult = route.mutating ? await readBody(req) : { ok: true, value: {} };
    if (!parsed.ok) return parsed.reply;
    const body = parsed.value;
    const key = req.headers['idempotency-key'];
    if (route.mutating && (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(key))) {
      return err(400, 'idempotency_key_required', 'mutating calls need an Idempotency-Key header (8-128 characters)', ['Idempotency-Key']);
    }
    const requestHash = createHash('sha256').update(`${req.method} ${url.pathname} ${canonicalJson(body)}`).digest('hex');

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
        const reply = await route.handler({ actor, tx, body, params });
        if (route.mutating) {
          await tx.raw.query(
            'insert into api_idempotency (tenant_id, idempotency_key, method, path, request_sha256, status_code, response) values ($1, $2, $3, $4, $5, $6, $7)',
            [actor.tenantId, key, req.method, url.pathname, requestHash, reply.status, JSON.stringify(reply.body)],
          );
        }
        return reply;
      });

    try {
      return await run();
    } catch (e) {
      const pgCode = (e as { code?: string }).code;
      if (route.mutating && pgCode === '23505' && String((e as Error).message).includes('api_idempotency_key')) {
        return run(); // a concurrent request with the same key committed first: return its stored reply
      }
      throw e;
    }
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const correlationId = normaliseCorrelationId(req.headers['x-correlation-id'] as string | undefined);
    await withCorrelation({ correlationId }, async () => {
      let reply: Reply;
      const started = Date.now();
      try {
        reply = await dispatch(req, correlationId);
      } catch (e) {
        if (e instanceof DomainError) reply = err(e.status, e.code, e.message, e.fields, Object.keys(e.details).length ? { details: e.details } : {});
        else {
          deps.logger.error('request.failed', { error_class: (e as Error).name, pg_code: (e as { code?: string }).code });
          reply = err(500, 'internal', 'internal error');
        }
      }
      deps.logger.info('request', { method: req.method, route: (req.url ?? '').split('?')[0]!.replace(/[0-9a-f-]{36}/g, ':id'), status: reply.status, ms: Date.now() - started });
      res.writeHead(reply.status, { 'content-type': 'application/json; charset=utf-8', 'x-correlation-id': correlationId, 'cache-control': 'no-store' });
      res.end(JSON.stringify(reply.body));
    });
  };
}
