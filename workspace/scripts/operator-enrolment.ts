/**
 * `npm run auth:operator-enrolment -- --email <operator email> [--test]`: issues the single-use
 * code an operator needs to enrol their first authenticator (B2-S06) and emails it to them. Run
 * by the founder from a trusted machine; there is no API route for it.
 */
import { randomUUID } from 'node:crypto';
import { TenantDb } from '@payclock/db';
import { LocalAuthService } from '@payclock/domain';
import { createSmtpMailer, loadConfig } from '@payclock/platform';
import { loadEnvFile } from './env.ts';

loadEnvFile(process.argv.includes('--test') ? '.env.test' : '.env.local');
const config = loadConfig();
const i = process.argv.indexOf('--email');
const email = i > 0 ? process.argv[i + 1] : undefined;
if (!email) throw new Error('usage: --email <operator email>');
const db = new TenantDb(config.DATABASE_URL, 2);
const auth = new LocalAuthService(db, createSmtpMailer(config), {
  secretKey: Buffer.from(config.AUTH_SECRET_KEY!, 'base64'), publicUrl: config.APP_PUBLIC_URL!,
  idleMinutes: config.SESSION_IDLE_MINUTES, absoluteHours: config.SESSION_ABSOLUTE_HOURS, scryptLog2n: config.PASSWORD_SCRYPT_LOG2N,
});
await auth.issueOperatorEnrolment(email, randomUUID());
console.log('enrolment code sent to the operator by email');
await db.close();
