import type { SessionContext } from '@payclock/domain';

/**
 * Authentication behind one interface (TRD 8.1). Since B2 the only provider outside the test
 * suite is `LocalAuthService` (packages/domain): password plus TOTP, database sessions in a
 * `__Host-` cookie. Supabase Auth, named in the TRD, is a deferred option that would implement
 * this same interface; it is not built. A fake provider exists only under apps/web/test.
 */
export type { SessionContext };

export interface AuthProvider {
  /** Server-side check of the session cookie on every request (V7.2.1). */
  authenticate(token: string): Promise<SessionContext | null>;
  /** Anti-forgery token check for state-changing requests (V3.5.1). */
  checkCsrf(session: SessionContext, presented: string | undefined): boolean;
}

/** Cookie header parsing; returns the named cookie value or null. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || null;
  }
  return null;
}

/** Session cookie (V3.3.1-V3.3.4): __Host- prefix, Secure, HttpOnly, SameSite=Strict, Path=/. */
export function sessionCookie(name: string, token: string, maxAgeS: number): string {
  return `${name}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.max(0, Math.floor(maxAgeS))}`;
}
export const clearedCookie = (name: string): string => `${name}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
