import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/** Correlation id carried from request to job payload to outbound mail metadata (TRD 8.6). */
interface Context {
  correlationId: string;
  tenantId?: string;
}

const storage = new AsyncLocalStorage<Context>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function newCorrelationId(): string {
  return randomUUID();
}

/** Accept an incoming id only if it is a UUID; otherwise mint one (no log injection). */
export function normaliseCorrelationId(incoming: string | undefined | null): string {
  return incoming && UUID.test(incoming) ? incoming.toLowerCase() : newCorrelationId();
}

export function withCorrelation<T>(ctx: Context, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentCorrelation(): Context | undefined {
  return storage.getStore();
}

/** Today's civil date in America/Toronto (YYYY-MM-DD). Only outside packages/rules. */
export function torontoToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
