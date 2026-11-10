/** Integration suite: drop and re-migrate payclock_test, then load draft rules and holidays. */
import { migrate, resetTestSchemas, TenantDb } from '@payclock/db';
import { syncDraftRules } from '@payclock/domain';
import { installQueueSchema, QUEUES } from '@payclock/platform';
import { loadEnvFile } from '../scripts/env.ts';

export default async function setup(): Promise<void> {
  loadEnvFile('.env.test');
  const url = process.env.MIGRATOR_DATABASE_URL!;
  await resetTestSchemas(url);
  await migrate(url);
  await installQueueSchema(url, 'payclock_app', QUEUES);
  const db = new TenantDb(url, 2);
  await syncDraftRules(db, [2025, 2026, 2027, 2028]);
  await db.close();
}
