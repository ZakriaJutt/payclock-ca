/**
 * Proposed `scripts/seed-synthetic`: synthetic tenants and the Decision.md 4.5 example. Refuses to
 * run outside APP_ENV local/test. Idempotent: an existing synthetic tenant is left as it is.
 * B2: each synthetic owner without a password gets a first-owner invitation by email; open it in
 * Mailpit (http://127.0.0.1:8025), set a password, then sign in at POST /api/v1/auth/sign-in.
 */
import { TenantDb } from '@payclock/db';
import { addEvent, createInvoice, createProject, createSubcontract, LocalAuthService, syncDraftRules, type Actor } from '@payclock/domain';
import { createSmtpMailer, loadConfig } from '@payclock/platform';
import { loadEnvFile } from './env.ts';

loadEnvFile(process.argv.includes('--test') ? '.env.test' : '.env.local');
const config = loadConfig();
if (config.APP_ENV !== 'local' && config.APP_ENV !== 'test') throw new Error('seed-synthetic refuses to run outside local and test');

const TENANTS = [
  { id: '0a000000-0000-4000-8000-00000000000a', name: 'Northline Electric Ltd.', user: '0a000000-0000-4000-8000-0000000000a1' },
  { id: '0b000000-0000-4000-8000-00000000000b', name: 'Baycrest Mechanical Inc.', user: '0b000000-0000-4000-8000-0000000000b1' },
];
const admin = new TenantDb(config.MIGRATOR_DATABASE_URL!, 2);
const app = new TenantDb(config.DATABASE_URL, 2);
const sync = await syncDraftRules(admin, undefined, { app });
console.log(`rules: ${JSON.stringify(sync)}`);
const auth = new LocalAuthService(app, createSmtpMailer(config), {
  secretKey: Buffer.from(config.AUTH_SECRET_KEY!, 'base64'), publicUrl: config.APP_PUBLIC_URL!,
  idleMinutes: config.SESSION_IDLE_MINUTES, absoluteHours: config.SESSION_ABSOLUTE_HOURS, scryptLog2n: config.PASSWORD_SCRYPT_LOG2N,
});
for (const t of TENANTS) {
  const fresh = await admin.withGlobalWrite(async (tx) => {
    const r = await tx.raw.query('insert into tenant (id, legal_name, trade) values ($1, $2, $3) on conflict do nothing', [t.id, t.name, 'electrical']);
    await tx.raw.query('insert into app_user (id, email, display_name) values ($1, $2, $3) on conflict do nothing', [t.user, `owner.${t.id.slice(0, 2)}@example.test`, 'Synthetic owner']);
    // An owner who has never set a password is (re)invited; one with a password is left alone.
    await tx.raw.query(
      `insert into membership (tenant_id, user_id, role, status) values ($1, $2, 'owner', 'invited')
       on conflict (tenant_id, user_id) do update set status = 'invited'
       where not exists (select 1 from user_credential c where c.user_id = excluded.user_id and c.password_hash is not null)`,
      [t.id, t.user],
    );
    return (r.rowCount ?? 0) > 0;
  });
  // Invite only when no live invitation exists, so repeated `make dev` runs do not fill the inbox.
  const invited = await admin.withGlobalWrite(async (tx) => (await tx.raw.query(
    `select 1 from membership m where m.tenant_id = $1 and m.user_id = $2 and m.status = 'invited'
       and not exists (select 1 from auth_token a where a.membership_id = m.id and a.used_at is null and a.expires_at > now())`, [t.id, t.user])).rowCount);
  if (invited) {
    await auth.inviteFirstOwner(t.id, `owner.${t.id.slice(0, 2)}@example.test`, '0c000000-0000-4000-8000-000000000002');
    console.log(`first-owner invitation for ${t.name} sent to the local Mailpit inbox`);
  }
  if (!fresh || t.id !== TENANTS[0]!.id) continue;
  const actor: Actor = { userId: t.user, tenantId: t.id, role: 'owner', correlationId: '0c000000-0000-4000-8000-000000000001' };
  await app.withTenant(t.id, async (tx) => {
    const p = await createProject(tx, actor, { name: 'Lakeshore Clinic Fit-out', contractor_name: 'Harbourgate Builders Inc.', premises_leased: 'no', municipal_interest: 'no' });
    await addEvent(tx, actor, { scope_type: 'project', scope_id: p.id, type: 'EV-11', occurred_on: '2026-02-10', certainty: 'confirmed' });
    await addEvent(tx, actor, { scope_type: 'project', scope_id: p.id, type: 'EV-12', occurred_on: '2025-11-03', certainty: 'confirmed' });
    const sc = await createSubcontract(tx, actor, { project_id: p.id, reference: 'Electrical', has_sub_subs: true });
    const inv = await createInvoice(tx, actor, { subcontract_id: sc.id, number: 'INV-1042', amount_cents: 4_800_000, holdback_cents: 480_000 });
    await addEvent(tx, actor, { scope_type: 'invoice', scope_id: inv.id, type: 'EV-01', occurred_on: '2026-10-01', certainty: 'estimated' });
    await addEvent(tx, actor, { scope_type: 'subcontract', scope_id: sc.id, type: 'EV-07', occurred_on: '2026-09-30', certainty: 'confirmed' });
    console.log(`seeded ${t.name}: invoice ${inv.id}`);
  });
}
await admin.close();
await app.close();
