import { describe, expect, it } from 'vitest';
import { assertEnvelope, createLogger, loadConfig, MissingTenantError, normaliseCorrelationId, withCorrelation } from '../src/index.ts';

const DB = 'postgres://payclock_app@localhost:5432/payclock_test';

describe('T-2.1.5 platform', () => {
  const KEY = Buffer.alloc(32, 7).toString('base64');
  const local = { APP_ENV: 'local', DATABASE_URL: DB, AUTH_SECRET_KEY: KEY, APP_PUBLIC_URL: 'http://localhost:3104' };
  const prod = { APP_ENV: 'production', DATABASE_URL: DB, AUTH_SECRET_KEY: KEY, SMTP_SECURE: 'true' };

  it('config: validates at start; deployed environments need a non-loopback APP_PUBLIC_URL, TLS mail and no local-only scanner', () => {
    expect(loadConfig(local).API_PORT).toBe(8104);
    expect(loadConfig(local).AUTH_MODE).toBe('local');
    expect(() => loadConfig(prod)).toThrow(/APP_PUBLIC_URL/);
    expect(() => loadConfig({ ...prod, APP_PUBLIC_URL: 'http://localhost:3104' })).toThrow(/loopback/);
    expect(loadConfig({ ...prod, APP_PUBLIC_URL: 'https://app.payclock.example' }).PASSWORD_SCRYPT_LOG2N).toBe(17);
    expect(() => loadConfig({ ...prod, APP_PUBLIC_URL: 'https://app.payclock.example', SMTP_SECURE: 'false' })).toThrow(/TLS/);
    expect(() => loadConfig({ ...prod, APP_PUBLIC_URL: 'https://app.payclock.example', FILE_SCANNER: 'local-signature' })).toThrow(/V5.4.3/);
    expect(() => loadConfig({ ...prod, APP_PUBLIC_URL: 'https://app.payclock.example', PASSWORD_SCRYPT_LOG2N: '15' })).toThrow(/scrypt/);
    expect(() => loadConfig({ APP_ENV: 'local' })).toThrow(/DATABASE_URL/);
  });

  it('B2: local auth needs a 32-byte key; Supabase is not a mode (deferred); the session cookie keeps the __Host- prefix', () => {
    expect(() => loadConfig({ ...local, AUTH_SECRET_KEY: undefined })).toThrow(/AUTH_SECRET_KEY/);
    expect(() => loadConfig({ ...local, AUTH_SECRET_KEY: Buffer.alloc(16).toString('base64') })).toThrow(/AUTH_SECRET_KEY/);
    expect(() => loadConfig({ ...local, AUTH_MODE: 'supabase' })).toThrow(/AUTH_MODE/);
    expect(() => loadConfig({ ...local, SESSION_COOKIE_NAME: 'payclock_session' })).toThrow(/SESSION_COOKIE_NAME/);
    expect(() => loadConfig({ ...local, SESSION_IDLE_MINUTES: '721' })).toThrow(/SESSION_IDLE_MINUTES/);
  });

  it('B1-008 / B2: fake auth only in the test suite, and only on a local machine', () => {
    const base = { APP_ENV: 'test', DATABASE_URL: DB, AUTH_MODE: 'fake' };
    expect(loadConfig(base).AUTH_MODE).toBe('fake');
    expect(() => loadConfig({ ...base, APP_ENV: 'local' })).toThrow(/test suite/);
    expect(() => loadConfig({ ...base, APP_ENV: 'staging', APP_PUBLIC_URL: 'https://staging.example.test' })).toThrow(/fake auth/);
    expect(() => loadConfig({ ...base, APP_PUBLIC_URL: 'https://app.payclock.example' })).toThrow(/APP_PUBLIC_URL/);
    expect(() => loadConfig({ ...base, DATABASE_URL: 'postgres://u@db.payclock.example:5432/x' })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...base, API_BIND_HOST: '0.0.0.0' })).toThrow(/API_BIND_HOST/);
    expect(loadConfig({ ...base, APP_PUBLIC_URL: 'http://localhost:3104' }).API_BIND_HOST).toBe('127.0.0.1');
  });

  it('logger: carries the correlation id and redacts amounts, names, emails and tokens (redaction test)', () => {
    const lines: string[] = [];
    const log = createLogger({ service: 'test', sink: (l) => lines.push(l) });
    withCorrelation({ correlationId: '11111111-1111-4111-8111-111111111111', tenantId: 't-1' }, () =>
      log.info('event.corrected', {
        event_id: 'e-1',
        amount_cents: 4_800_000,
        contractor_name: 'Harbourgate Builders Inc.',
        email: 'office@example.test',
        token: 'abc',
        nested: { owner_name: 'X', invoice_number: 'INV-1042' },
      }),
    );
    const rec = JSON.parse(lines[0]!);
    expect(rec.correlation_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(rec.event_id).toBe('e-1');
    const text = lines[0]!;
    for (const secret of ['4800000', 'Harbourgate', 'office@example.test', 'abc', 'INV-1042']) expect(text).not.toContain(secret);
  });

  it('correlation: a non-UUID incoming id is replaced', () => {
    expect(normaliseCorrelationId('not-a-uuid\nINJECT')).toMatch(/^[0-9a-f-]{36}$/);
    expect(normaliseCorrelationId('11111111-1111-4111-8111-111111111111')).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('jobs: a payload without a tenant is refused before any data is read', () => {
    expect(() => assertEnvelope('recompute.batch', { data: {} })).toThrow(MissingTenantError);
    expect(() => assertEnvelope('recompute.batch', null)).toThrow(MissingTenantError);
    expect(assertEnvelope('x', { tenant_id: '11111111-1111-4111-8111-111111111111', data: 1 }).tenant_id).toBeTruthy();
  });
});
