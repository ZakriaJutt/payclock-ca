import { canonicalJson, sha256Hex } from '@payclock/rules';
import { tables, type Tx } from '@payclock/db';
import type { Actor } from './actor.ts';

const hash = (v: unknown) => (v === undefined ? null : Buffer.from(sha256Hex(canonicalJson(v)), 'hex'));

/** Append-only audit row (TRD 8.5): who, when, tenant, action, entity, before/after hashes, correlation. */
export async function audit(tx: Tx, actor: Actor, action: string, entityType: string, entityId: string | null, before?: unknown, after?: unknown): Promise<void> {
  await tx.insert(tables.auditEvent).values({
    tenantId: actor.tenantId,
    actorId: actor.userId,
    action,
    entityType,
    entityId,
    beforeHash: hash(before),
    afterHash: hash(after),
    correlationId: actor.correlationId,
  });
}
