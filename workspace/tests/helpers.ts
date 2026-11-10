import { randomUUID } from 'node:crypto';
import { TenantDb } from '@payclock/db';
import type { Actor, Role } from '@payclock/domain';
import { loadEnvFile } from '../scripts/env.ts';

loadEnvFile('.env.test');

/** Runtime connection: payclock_app, NOSUPERUSER NOBYPASSRLS. */
export const appDb = () => new TenantDb(process.env.DATABASE_URL!, 6);
/** Migrator connection (owner, superuser): used only to seed tenants and users, like onboarding would. */
export const adminDb = () => new TenantDb(process.env.MIGRATOR_DATABASE_URL!, 2);

export interface SeededTenant {
  tenantId: string;
  owner: Actor;
  member: Actor;
  viewer: Actor;
}

export async function seedTenant(admin: TenantDb, legalName: string): Promise<SeededTenant> {
  const tenantId = randomUUID();
  const actors: Partial<Record<Role, Actor>> = {};
  await admin.withGlobalWrite(async (tx) => {
    await tx.raw.query('insert into tenant (id, legal_name, trade) values ($1, $2, $3)', [tenantId, legalName, 'electrical']);
    for (const role of ['owner', 'member', 'viewer'] as const) {
      const userId = randomUUID();
      await tx.raw.query('insert into app_user (id, email, display_name) values ($1, $2, $3)', [userId, `${role}.${userId.slice(0, 8)}@example.test`, `Synthetic ${role}`]);
      await tx.raw.query("insert into membership (tenant_id, user_id, role, status) values ($1, $2, $3, 'active')", [tenantId, userId, role]);
      actors[role] = { userId, tenantId, role, correlationId: randomUUID() };
    }
  });
  return { tenantId, owner: actors.owner!, member: actors.member!, viewer: actors.viewer! };
}
