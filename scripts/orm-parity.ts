/** Proposed `scripts/orm-parity`: diff the ORM model against the migrated database. */
import { ormParity } from '@payclock/db';
import { loadEnvFile } from './env.ts';

loadEnvFile(process.argv.includes('--test') ? '.env.test' : '.env.local');
const diffs = await ormParity(process.env.MIGRATOR_DATABASE_URL!);
for (const d of diffs) console.log(`  DIFF ${d}`);
console.log(`orm-parity: ${diffs.length} difference(s)`);
process.exit(diffs.length === 0 ? 0 : 1);
