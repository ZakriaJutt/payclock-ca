/**
 * Proposed `scripts/seed-synthetic`: synthetic tenants and the Decision.md 4.5 example. Refuses to
 * run outside APP_ENV local/test. Idempotent: an existing synthetic tenant is left as it is.
 * Writes git-ignored `.local-data/dev-sessions.json` (fake bearer tokens for local curl only).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { TenantDb } from '@payclock/db';
import { addEvent, createInvoice, createProject, createSubcontract, syncDraftRules, type Actor } from '@payclock/domain';
import { loadConfig } from '@payclock/platform';
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
const sessions: Record<string, { user_id: string; tenant_id: string }> = {};
for (const t of TENANTS) {
  const fresh = await admin.withGlobalWrite(async (tx) => {
    const r = await tx.raw.query('insert into tenant (id, legal_name, trade) values ($1, $2, $3) on conflict do nothing', [t.id, t.name, 'electrical']);
    await tx.raw.query('insert into app_user (id, email, display_name) values ($1, $2, $3) on conflict do nothing', [t.user, `owner.${t.id.slice(0, 2)}@example.test`, 'Synthetic owner']);
    await tx.raw.query("insert into membership (tenant_id, user_id, role, status) values ($1, $2, 'owner', 'active') on conflict do nothing", [t.id, t.user]);
    return (r.rowCount ?? 0) > 0;
  });
  sessions[`dev-${randomBytes(12).toString('hex')}`] = { user_id: t.user, tenant_id: t.id };
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
mkdirSync(new URL('../.local-data', import.meta.url), { recursive: true });
writeFileSync(new URL('../.local-data/dev-sessions.json', import.meta.url), JSON.stringify(sessions, null, 2), { mode: 0o600 });
console.log('wrote .local-data/dev-sessions.json (fake local tokens)');
await admin.close();
await app.close();
