/** `npm run db:migrate [-- --test]`: SQL migrations, then the queue schema. Runs as the migrator. */
import { installQueueSchema, QUEUES } from '@payclock/platform';
import { migrate } from './migrate.ts';
import { loadEnvFile } from '../../../scripts/env.ts';

loadEnvFile(process.argv.includes('--test') ? '.env.test' : '.env.local');
const url = process.env.MIGRATOR_DATABASE_URL;
if (!url) throw new Error('MIGRATOR_DATABASE_URL is not set');
const applied = await migrate(url, (m) => console.log(m));
await installQueueSchema(url, 'payclock_app', QUEUES);
console.log(`migrations: ${applied.length} applied; queue schema ready`);
