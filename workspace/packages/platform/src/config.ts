import { z } from 'zod';

/**
 * One typed configuration, validated at start (TRD 8.3). Both apps import it. Secrets come from the
 * environment (host secret store in production; a git-ignored `.env.local` locally), never the repo.
 * Redis is deliberately absent: the TRD keeps the queue in Postgres (AD-05).
 */
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/;

const schema = z
  .object({
    APP_ENV: z.enum(['local', 'test', 'staging', 'production']),
    DATABASE_URL: z.string().url(),
    MIGRATOR_DATABASE_URL: z.string().url().optional(),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(8104),
    API_BIND_HOST: z.string().default('127.0.0.1'),
    APP_PUBLIC_URL: z.string().url().optional(),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    // B2: local sign-in (password plus TOTP, TRD 8.1). Supabase Auth is a deferred option, not
    // built; `fake` exists only for the test suite.
    AUTH_MODE: z.enum(['local', 'fake']).default('local'),
    /** 32 bytes, base64: encrypts TOTP secrets and signs file links. */
    AUTH_SECRET_KEY: z.string().optional(),
    SESSION_COOKIE_NAME: z.string().regex(/^__Host-[A-Za-z0-9_-]+$/).default('__Host-payclock_session'),
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(720).default(720),
    SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(720).default(168),
    PASSWORD_SCRYPT_LOG2N: z.coerce.number().int().min(14).max(20).default(17),
    SMTP_HOST: z.string().default('127.0.0.1'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_SECURE: z.enum(['true', 'false']).default('false'),
    SMTP_REQUIRE_TLS: z.enum(['true', 'false']).default('false'),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().default('PayClock <no-reply@payclock.localhost>'),
    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().default('ca-central-1'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'),
    /** Only `local-signature` exists (content-signature check, not a malware scan): local and test only. */
    FILE_SCANNER: z.enum(['local-signature', 'none']).default('none'),
  })
  .superRefine((c, ctx) => {
    const deployed = c.APP_ENV === 'staging' || c.APP_ENV === 'production';
    if (deployed) {
      if (!c.APP_PUBLIC_URL) ctx.addIssue({ code: 'custom', path: ['APP_PUBLIC_URL'], message: 'required outside local and test' });
      else if (LOOPBACK.test(new URL(c.APP_PUBLIC_URL).hostname)) {
        ctx.addIssue({ code: 'custom', path: ['APP_PUBLIC_URL'], message: 'must not be a loopback host outside local and test' });
      }
      if (c.FILE_SCANNER === 'local-signature') ctx.addIssue({ code: 'custom', path: ['FILE_SCANNER'], message: 'no malware scanner is configured; local-signature is local and test only (V5.4.3)' });
      if (c.SMTP_SECURE !== 'true' && c.SMTP_REQUIRE_TLS !== 'true') ctx.addIssue({ code: 'custom', path: ['SMTP_SECURE'], message: 'SMTP must use TLS outside local and test' });
      if (c.PASSWORD_SCRYPT_LOG2N < 17) ctx.addIssue({ code: 'custom', path: ['PASSWORD_SCRYPT_LOG2N'], message: 'scrypt cost below 2^17 is allowed only in local and test' });
    }
    if (c.AUTH_MODE === 'fake' && c.APP_ENV !== 'test') ctx.addIssue({ code: 'custom', path: ['AUTH_MODE'], message: 'fake auth is allowed only in the test suite' });
    if (c.AUTH_MODE === 'local') {
      const key = c.AUTH_SECRET_KEY ? Buffer.from(c.AUTH_SECRET_KEY, 'base64') : null;
      if (!key || key.length !== 32) ctx.addIssue({ code: 'custom', path: ['AUTH_SECRET_KEY'], message: 'local auth needs a 32-byte base64 AUTH_SECRET_KEY' });
      if (!c.APP_PUBLIC_URL) ctx.addIssue({ code: 'custom', path: ['APP_PUBLIC_URL'], message: 'local auth builds links from APP_PUBLIC_URL' });
    }
    // B1-008: fake auth also needs every other sign of a local machine, not just the label.
    if (c.AUTH_MODE === 'fake') {
      const host = (u: string) => new URL(u).hostname;
      if (!LOOPBACK.test(c.API_BIND_HOST)) ctx.addIssue({ code: 'custom', path: ['API_BIND_HOST'], message: 'fake auth requires a loopback bind address' });
      if (!LOOPBACK.test(host(c.DATABASE_URL))) ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'fake auth requires a database on localhost' });
      if (c.APP_PUBLIC_URL && !LOOPBACK.test(host(c.APP_PUBLIC_URL))) ctx.addIssue({ code: 'custom', path: ['APP_PUBLIC_URL'], message: 'fake auth requires a loopback APP_PUBLIC_URL' });
    }
  });

export type Config = z.infer<typeof schema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`invalid configuration: ${issues}`);
  }
  return parsed.data;
}
