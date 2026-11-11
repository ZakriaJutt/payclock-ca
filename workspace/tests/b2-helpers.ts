/**
 * B2 integration helpers: a real API server wired to local sign-in, the Mailpit SMTP inbox and
 * MinIO, plus a small Mailpit API client. Every test address is unique to the run, and only the
 * messages and objects a test created are deleted.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import type { TenantDb } from '@payclock/db';
import { LocalAuthService, localSignatureScanner, type DocumentDeps } from '@payclock/domain';
import { createLogger, createS3BlobStore, createSmtpMailer, loadConfig, type BlobStore } from '@payclock/platform';
import { createApp } from '../apps/web/src/app.ts';

export const config = () => loadConfig(process.env);
const MAILPIT = () => process.env.MAILPIT_API_URL ?? 'http://127.0.0.1:8025/api/v1';

export interface Harness {
  base: string;
  server: Server;
  auth: LocalAuthService;
  store: BlobStore;
  documents: DocumentDeps;
  /** Shifts the clock used for sessions, links and TOTP (milliseconds). */
  shift: (ms: number) => void;
  close: () => Promise<void>;
}

export async function startHarness(db: TenantDb): Promise<Harness> {
  const c = config();
  let offset = 0;
  const now = () => Date.now() + offset;
  const secretKey = Buffer.from(c.AUTH_SECRET_KEY!, 'base64');
  const auth = new LocalAuthService(db, createSmtpMailer(c), {
    secretKey, publicUrl: c.APP_PUBLIC_URL!, idleMinutes: c.SESSION_IDLE_MINUTES, absoluteHours: c.SESSION_ABSOLUTE_HOURS, scryptLog2n: c.PASSWORD_SCRYPT_LOG2N, now,
  });
  const store = createS3BlobStore(c);
  const documents: DocumentDeps = { db, store, scanner: localSignatureScanner, linkKey: secretKey, publicUrl: c.APP_PUBLIC_URL!, now };
  const server = createServer(createApp({
    db, auth, localAuth: auth, documents, logger: createLogger({ service: 'web-test', sink: (l) => { if (l.includes('"level":"error"')) console.error(l); } }), queue: null,
    cookieName: c.SESSION_COOKIE_NAME, publicUrl: c.APP_PUBLIC_URL, sessionMaxAgeS: c.SESSION_ABSOLUTE_HOURS * 3600, storagePing: () => store.ping(),
  }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    server, auth, store, documents,
    shift: (ms) => (offset += ms),
    close: () => new Promise((r) => server.close(() => r())),
  };
}

export const uniqueEmail = (role: string) => `${role}.${randomUUID().slice(0, 8)}@example.test`;

// ---------- HTTP client keeping one session cookie ----------
export class Client {
  cookie: string | null = null;
  csrf: string | null = null;
  setCookie: string | null = null;

  constructor(readonly base: string) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON in tests
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: Record<string, any>; headers: Headers }> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(this.cookie ? { cookie: `__Host-payclock_session=${this.cookie}` } : {}),
        ...(this.csrf && method !== 'GET' ? { 'x-csrf-token': this.csrf } : {}),
        ...(method !== 'GET' && !path.startsWith('/api/v1/auth/') ? { 'idempotency-key': randomUUID() } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }
    return { status: res.status, body: parsed, headers: res.headers };
  }

  async signIn(email: string, password: string, extra: Record<string, unknown> = {}) {
    const r = await this.req('POST', '/api/v1/auth/sign-in', { email, password, ...extra });
    if (r.status === 200) {
      this.setCookie = r.headers.get('set-cookie');
      this.cookie = /__Host-payclock_session=([^;]+)/.exec(this.setCookie ?? '')![1]!;
      this.csrf = r.body.csrf_token;
    }
    return r;
  }
}

// ---------- Mailpit ----------
interface MailSummary { ID: string; Subject: string; To: Array<{ Address: string }> }
const createdMessages: string[] = [];

/** Waits for the newest message to `to` whose subject matches, returns its text body. */
export async function waitForMail(to: string, subject: RegExp, timeoutMs = 10_000): Promise<{ id: string; subject: string; text: string }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const r = await fetch(`${MAILPIT()}/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const list = ((await r.json()) as { messages: MailSummary[] }).messages ?? [];
    const hit = list.find((m) => subject.test(m.Subject));
    if (hit) {
      createdMessages.push(hit.ID);
      const m = (await (await fetch(`${MAILPIT()}/message/${hit.ID}`)).json()) as { Text: string; Subject: string };
      return { id: hit.ID, subject: m.Subject, text: m.Text };
    }
    if (Date.now() > deadline) throw new Error(`no mail to ${to} matching ${subject}`);
    await new Promise((res) => setTimeout(res, 150));
  }
}

export async function mailCount(to: string): Promise<number> {
  const r = await fetch(`${MAILPIT()}/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  const list = ((await r.json()) as { messages: MailSummary[] }).messages ?? [];
  for (const m of list) if (!createdMessages.includes(m.ID)) createdMessages.push(m.ID);
  return list.length;
}

export const tokenFrom = (text: string): string => /#token=([A-Za-z0-9_-]+)/.exec(text)![1]!;

/** Deletes only the messages this run read (Mailpit may be shared with other local projects). */
export async function cleanupMail(): Promise<void> {
  if (!createdMessages.length) return;
  await fetch(`${MAILPIT()}/messages`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ IDs: createdMessages.splice(0) }) });
}
