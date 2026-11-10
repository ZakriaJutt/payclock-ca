/** Drop and re-migrate PayClock's own test database schemas (public, pgboss). Test database only. */
import { resetTestSchemas } from '@payclock/db';
import { loadEnvFile } from './env.ts';

loadEnvFile('.env.test');
await resetTestSchemas(process.env.MIGRATOR_DATABASE_URL!);
console.log('payclock_test: schemas dropped and recreated; run npm run db:migrate-test');
