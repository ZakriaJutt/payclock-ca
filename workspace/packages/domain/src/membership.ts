import { and, eq, tables, type TenantDb } from '@payclock/db';
import type { Actor, Role } from './actor.ts';

/** A session is valid for a tenant only with a live membership, read under that tenant's RLS. */
export async function resolveMembership(db: TenantDb, userId: string, tenantId: string, correlationId: string): Promise<Actor | null> {
  return db.withTenant(tenantId, async (tx) => {
    const [m] = await tx
      .select({ role: tables.membership.role })
      .from(tables.membership)
      .where(and(eq(tables.membership.userId, userId), eq(tables.membership.status, 'active')));
    return m ? { userId, tenantId, role: m.role as Role, correlationId } : null;
  });
}
