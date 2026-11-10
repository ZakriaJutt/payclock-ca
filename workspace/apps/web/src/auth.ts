/**
 * Authentication behind an interface (TRD 8.1 names Supabase Auth; no account exists in B1).
 * `FakeAuthProvider` maps opaque bearer tokens to a user and tenant. Configuration refuses fake
 * auth outside APP_ENV local/test, so it can never serve real users.
 */
export interface Session {
  userId: string;
  tenantId: string;
}

export interface AuthProvider {
  verify(bearerToken: string): Promise<Session | null>;
}

export class FakeAuthProvider implements AuthProvider {
  private readonly sessions: Map<string, Session>;

  constructor(sessions: Record<string, Session> = {}) {
    this.sessions = new Map(Object.entries(sessions));
  }

  static fromEnv(json: string | undefined): FakeAuthProvider {
    if (!json) return new FakeAuthProvider();
    const parsed = JSON.parse(json) as Record<string, { user_id: string; tenant_id: string }>;
    return new FakeAuthProvider(Object.fromEntries(Object.entries(parsed).map(([t, s]) => [t, { userId: s.user_id, tenantId: s.tenant_id }])));
  }

  add(token: string, session: Session): void {
    this.sessions.set(token, session);
  }

  async verify(token: string): Promise<Session | null> {
    return this.sessions.get(token) ?? null;
  }
}
