import { forbidden } from './errors.ts';

export type Role = 'owner' | 'member' | 'viewer';

/** The authenticated caller, resolved by apps/web from the session and a live membership. */
export interface Actor {
  userId: string;
  tenantId: string;
  role: Role;
  correlationId: string;
}

type Action = 'read' | 'write_records' | 'write_events';

const ALLOWED: Record<Role, ReadonlySet<Action>> = {
  owner: new Set(['read', 'write_records', 'write_events']),
  member: new Set(['read', 'write_records', 'write_events']),
  viewer: new Set(['read']),
};

/** Layer 3 of tenancy and authorization (TRD 8.2); PRD section 6 roles. */
export function authorize(actor: Actor, action: Action): void {
  if (!ALLOWED[actor.role].has(action)) throw forbidden();
}
