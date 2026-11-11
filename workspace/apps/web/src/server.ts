/** API process: `tsx apps/web/src/server.ts`. Listens on API_PORT (8104 locally). */
import { createServer } from 'node:http';
import { TenantDb } from '@payclock/db';
import { LocalAuthService, localSignatureScanner, noScanner } from '@payclock/domain';
import { createLogger, createPgBossQueue, createS3BlobStore, createSmtpMailer, loadConfig } from '@payclock/platform';
import { createApp } from './app.ts';

const config = loadConfig();
const logger = createLogger({ service: 'web', level: config.LOG_LEVEL });
// The fake provider lives only in the test suite (B2); a server always runs local sign-in.
if (config.AUTH_MODE !== 'local') throw new Error('the API server runs only with AUTH_MODE=local (Supabase Auth is a deferred option, not built)');
const db = new TenantDb(config.DATABASE_URL);
const queue = await createPgBossQueue(config.DATABASE_URL, { migrate: false });
const secretKey = Buffer.from(config.AUTH_SECRET_KEY!, 'base64');
const auth = new LocalAuthService(db, createSmtpMailer(config), {
  secretKey,
  publicUrl: config.APP_PUBLIC_URL!,
  idleMinutes: config.SESSION_IDLE_MINUTES,
  absoluteHours: config.SESSION_ABSOLUTE_HOURS,
  scryptLog2n: config.PASSWORD_SCRYPT_LOG2N,
});
const store = config.S3_BUCKET ? createS3BlobStore(config) : null;
const documents = store
  ? { db, store, scanner: config.FILE_SCANNER === 'local-signature' ? localSignatureScanner : noScanner, linkKey: secretKey, publicUrl: config.APP_PUBLIC_URL! }
  : null;
const server = createServer(createApp({
  db, auth, localAuth: auth, documents, logger, queue,
  cookieName: config.SESSION_COOKIE_NAME,
  publicUrl: config.APP_PUBLIC_URL,
  sessionMaxAgeS: config.SESSION_ABSOLUTE_HOURS * 3600,
  storagePing: store ? () => store.ping() : undefined,
}));
server.requestTimeout = 15_000;
server.listen(config.API_PORT, config.API_BIND_HOST, () => logger.info('web.listening', { port: config.API_PORT }));
const stop = async () => {
  server.close();
  await queue.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
