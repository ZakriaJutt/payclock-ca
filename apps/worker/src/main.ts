/** Worker process: `tsx apps/worker/src/main.ts`. Imports no web-framework or apps/web module. */
import { TenantDb } from '@payclock/db';
import { createLogger, createPgBossQueue, loadConfig } from '@payclock/platform';
import { recomputeBatchHandler } from './handlers.ts';

const config = loadConfig();
const logger = createLogger({ service: 'worker', level: config.LOG_LEVEL });
const db = new TenantDb(config.DATABASE_URL, 4);
if (!(await db.ping())) {
  logger.error('worker.unhealthy', { dependency: 'database' });
  process.exit(1);
}
const queue = await createPgBossQueue(config.DATABASE_URL, { migrate: false });
const handler = recomputeBatchHandler(db, logger);
await queue.work('recompute.batch', (job) => handler(job));
logger.info('worker.ready', { queues: ['recompute.batch'] });
const stop = async () => {
  await queue.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
