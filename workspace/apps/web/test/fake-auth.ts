import type { SessionContext } from '@payclock/domain';
import type { AuthProvider } from '../src/auth.ts';

/** Test-only provider: maps opaque cookie values to a user and tenant; CSRF token "fake-csrf". */
export class FakeAuthProvider implements AuthProvider {
  private readonly sessions = new Map<string, { userId: string; tenantId: string }>();

  add(token: string, session: { userId: string; tenantId: string }): void {
    this.sessions.set(token, session);
  }

  async authenticate(token: string): Promise<SessionContext | null> {
    const s = this.sessions.get(token);
    return s ? { sessionId: token, userId: s.userId, tenantId: s.tenantId, restricted: false, totpVerified: false, csrfToken: 'fake-csrf', idleExpiresAt: '' } : null;
  }

  checkCsrf(session: SessionContext, presented: string | undefined): boolean {
    return presented === session.csrfToken;
  }
}
