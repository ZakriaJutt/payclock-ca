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
    AUTH_MODE: z.enum(['fake', 'supabase']).default('fake'),
    FAKE_AUTH_SESSIONS: z.string().optional(),
  })
  .superRefine((c, ctx) => {
    const deployed = c.APP_ENV === 'staging' || c.APP_ENV === 'production';
    if (deployed) {
      if (!c.APP_PUBLIC_URL) ctx.addIssue({ code: 'custom', path: ['APP_PUBLIC_URL'], message: 'required outside local and test' });
      else if (LOOPBACK.test(new URL(c.APP_PUBLIC_URL).hostname)) {
        ctx.addIssue({ code: 'custom', path: ['APP_PUBLIC_URL'], message: 'must not be a loopback host outside local and test' });
      }
      if (c.AUTH_MODE === 'fake') ctx.addIssue({ code: 'custom', path: ['AUTH_MODE'], message: 'fake auth is allowed only in local and test' });
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
