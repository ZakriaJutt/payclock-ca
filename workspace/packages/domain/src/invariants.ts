import type { Tx } from '@payclock/db';

/** Nightly invariant (TRD 6.2, schema.md 8): one current deadline per (scope, clock); no current
 * deadline built on a superseded event. Returns violations; the job pages on any. */
export async function invariantCheck(tx: Tx): Promise<string[]> {
  const out: string[] = [];
  const dup = await tx.raw.query(
    `select subcontract_id, invoice_id, clock_code, variant, count(*) from deadline where is_current
     group by 1, 2, 3, 4 having count(*) > 1`,
  );
  for (const r of dup.rows) out.push(`more than one current deadline: ${r.clock_code}${r.variant} ${r.subcontract_id}`);
  const stale = await tx.raw.query(
    `select d.id from deadline d where d.is_current and exists (
       select 1 from event e where e.id = any(d.trigger_event_ids) and e.superseded_at is not null)`,
  );
  for (const r of stale.rows) out.push(`current deadline ${r.id} rests on a superseded event`);
  const retired = await tx.raw.query(
    `select d.id from deadline d join rule_clock c on c.id = d.rule_clock_id join rule_version v on v.id = c.rule_version_id
     where d.is_current and v.status = 'retired'`,
  );
  for (const r of retired.rows) out.push(`current deadline ${r.id} rests on a retired rule version`);
  return out;
}
