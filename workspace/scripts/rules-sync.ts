/** `npm run rules:sync [-- --test]`: load encoded rule versions (new draft revision on any change)
 * and the holiday table for HOLIDAY_YEARS, then recompute every stored deadline if anything changed. */
import { TenantDb } from '@payclock/db';
import { syncDraftRules } from '@payclock/domain';
import { loadEnvFile } from './env.ts';

loadEnvFile(process.argv.includes('--test') ? '.env.test' : '.env.local');
const admin = new TenantDb(process.env.MIGRATOR_DATABASE_URL!, 2);
const app = new TenantDb(process.env.DATABASE_URL!, 2);
const report = await syncDraftRules(admin, undefined, { app });
console.log(`rules-sync: ${JSON.stringify(report)}`);
await admin.close();
await app.close();
process.exit(report.recompute.failed.length ? 1 : 0);
