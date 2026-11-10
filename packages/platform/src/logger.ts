import { currentCorrelation } from './correlation.ts';

/**
 * Shared structured logger (TRD 8.6). JSON lines with the correlation id. Identifiers only: keys
 * that could carry amounts, names, document contents, email bodies or tokens are redacted.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const REDACT_KEY =
  /(amount|cents|name|email|body|content|token|password|secret|authorization|cookie|reason|note|contractor|owner|number|address)/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEY.test(k) && !/_id$|Id$|^id$/.test(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

export type Sink = (line: string) => void;

export function createLogger(opts: { level?: Level; service: string; sink?: Sink; base?: Record<string, unknown> }): Logger {
  const min = ORDER[opts.level ?? 'info'];
  const sink: Sink = opts.sink ?? ((line) => process.stdout.write(`${line}\n`));
  const base = opts.base ?? {};
  const emit = (level: Level, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[level] < min) return;
    const ctx = currentCorrelation();
    sink(
      JSON.stringify({
        ts: new Date().toISOString(),
        level,
        service: opts.service,
        msg,
        correlation_id: ctx?.correlationId,
        tenant_id: ctx?.tenantId,
        ...(redact({ ...base, ...fields }) as Record<string, unknown>),
      }),
    );
  };
  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
    child: (fields) => createLogger({ ...opts, base: { ...base, ...fields } }),
  };
}
