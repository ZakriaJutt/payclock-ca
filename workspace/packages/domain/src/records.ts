import { eq, tables, type Tx } from '@payclock/db';
import { isCivilDate } from '@payclock/rules';
import { authorize, type Actor } from './actor.ts';
import { audit } from './audit.ts';
import { conflict, notFound, unprocessable, uuidField } from './errors.ts';
import { recomputeInTx } from './recompute.ts';

const TRI = ['yes', 'no', 'unknown'] as const;
type Tri = (typeof TRI)[number];

function str(v: unknown, field: string, max = 200): string {
  if (typeof v !== 'string' || v.trim() === '' || v.length > max) throw unprocessable(`${field} is required`, [field]);
  return v.trim();
}
function optStr(v: unknown, field: string, max = 200): string | null {
  if (v === undefined || v === null || v === '') return null;
  return str(v, field, max);
}
function cents(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw unprocessable(`${field} must be integer cents >= 0`, [field]);
  return v;
}

export interface ProjectInput {
  name: unknown;
  contractor_name: unknown;
  owner_name?: unknown;
  premises_leased?: unknown;
  lease_first_entered_on?: unknown;
  municipal_interest?: unknown;
}

/** MH-01: the project collects regime-selecting facts; EV-11/EV-12 are events, not columns. */
export async function createProject(tx: Tx, actor: Actor, input: ProjectInput) {
  authorize(actor, 'write_records');
  const leased = (input.premises_leased ?? 'unknown') as Tri;
  const municipal = (input.municipal_interest ?? 'unknown') as Tri;
  if (!TRI.includes(leased)) throw unprocessable('premises_leased must be yes, no or unknown', ['premises_leased']);
  if (!TRI.includes(municipal)) throw unprocessable('municipal_interest must be yes, no or unknown', ['municipal_interest']);
  const lease = input.lease_first_entered_on ?? null;
  if (lease !== null && !isCivilDate(lease)) throw unprocessable('lease_first_entered_on must be YYYY-MM-DD or null', ['lease_first_entered_on']);
  const [row] = await tx
    .insert(tables.project)
    .values({
      tenantId: actor.tenantId,
      name: str(input.name, 'name'),
      contractorName: str(input.contractor_name, 'contractor_name'),
      ownerName: optStr(input.owner_name, 'owner_name'),
      premisesLeased: leased,
      leaseFirstEnteredOn: lease as string | null,
      municipalInterest: municipal,
    })
    .returning();
  await audit(tx, actor, 'project.create', 'project', row!.id, undefined, row);
  return row!;
}

export async function createSubcontract(tx: Tx, actor: Actor, input: { project_id: unknown; reference?: unknown; has_sub_subs?: unknown }) {
  authorize(actor, 'write_records');
  const projectId = uuidField(input.project_id, 'project_id');
  const [project] = await tx.select({ id: tables.project.id }).from(tables.project).where(eq(tables.project.id, projectId));
  if (!project) throw notFound('project');
  const hasSubSubs = input.has_sub_subs === undefined ? null : input.has_sub_subs;
  if (hasSubSubs !== null && typeof hasSubSubs !== 'boolean') throw unprocessable('has_sub_subs must be true, false or null', ['has_sub_subs']);
  const [row] = await tx
    .insert(tables.subcontract)
    .values({ tenantId: actor.tenantId, projectId, reference: optStr(input.reference, 'reference'), hasSubSubs })
    .returning();
  await audit(tx, actor, 'subcontract.create', 'subcontract', row!.id, undefined, row);
  await recomputeInTx(tx, actor, { projectId, scopeType: 'subcontract', scopeId: row!.id, cause: 'new_event', causeEventId: null, subcontractIds: [row!.id] });
  return row!;
}

export async function createInvoice(
  tx: Tx,
  actor: Actor,
  input: { subcontract_id: unknown; number: unknown; amount_cents: unknown; holdback_cents?: unknown; given_to_contractor_on?: unknown },
) {
  authorize(actor, 'write_records');
  const subcontractId = uuidField(input.subcontract_id, 'subcontract_id');
  const [sc] = await tx.select().from(tables.subcontract).where(eq(tables.subcontract.id, subcontractId));
  if (!sc) throw notFound('subcontract');
  const amount = cents(input.amount_cents, 'amount_cents');
  const holdback = input.holdback_cents === undefined ? 0 : cents(input.holdback_cents, 'holdback_cents');
  if (holdback > amount) throw unprocessable('holdback_cents cannot exceed amount_cents', ['holdback_cents']);
  const given = input.given_to_contractor_on ?? null;
  if (given !== null && !isCivilDate(given)) throw unprocessable('given_to_contractor_on must be YYYY-MM-DD or null', ['given_to_contractor_on']);
  const number = str(input.number, 'number', 64);
  const dup = await tx.raw.query('select 1 from invoice where subcontract_id = $1 and number = $2', [subcontractId, number]);
  if (dup.rowCount) throw conflict('duplicate_invoice', 'an invoice with this number already exists for the subcontract');
  const [row] = await tx
    .insert(tables.invoice)
    .values({ tenantId: actor.tenantId, subcontractId, number, amountCents: amount, holdbackCents: holdback, givenToContractorOn: given as string | null })
    .returning();
  await audit(tx, actor, 'invoice.create', 'invoice', row!.id, undefined, row);
  await recomputeInTx(tx, actor, { projectId: sc.projectId, scopeType: 'invoice', scopeId: row!.id, cause: 'new_event', causeEventId: null, subcontractIds: [subcontractId] });
  return row!;
}
