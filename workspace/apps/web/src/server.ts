/** API process: `tsx apps/web/src/server.ts`. Listens on API_PORT (8104 locally). */
import { createServer } from 'node:http';
import { TenantDb } from '@payclock/db';
import { createLogger, createPgBossQueue, loadConfig } from '@payclock/platform';
import { createApp } from './app.ts';
import { FakeAuthProvider } from './auth.ts';

const config = loadConfig();
const logger = createLogger({ service: 'web', level: config.LOG_LEVEL });
const db = new TenantDb(config.DATABASE_URL);
const queue = await createPgBossQueue(config.DATABASE_URL, { migrate: false });
if (config.AUTH_MODE !== 'fake') throw new Error('only fake auth is implemented in B1 (Supabase Auth is blocked: no account)');
const auth = FakeAuthProvider.fromEnv(config.FAKE_AUTH_SESSIONS);
const server = createServer(createApp({ db, auth, logger, queue }));
server.requestTimeout = 15_000;
server.listen(config.API_PORT, '127.0.0.1', () => logger.info('web.listening', { port: config.API_PORT }));
const stop = async () => {
  server.close();
  await queue.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
