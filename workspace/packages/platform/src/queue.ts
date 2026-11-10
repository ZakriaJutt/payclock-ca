import PgBoss from 'pg-boss';
import { currentCorrelation, newCorrelationId } from './correlation.ts';

/**
 * Queue access lives here once (AGENTS.md section 5). pg-boss in the same Postgres (AD-05).
 * Every job payload carries the tenant and the correlation id; handlers refuse a payload without
 * a tenant (TRD 8.2).
 */
export interface JobEnvelope<T> {
  tenant_id: string;
  correlation_id: string;
  data: T;
}

export interface Queue {
  send<T>(name: string, tenantId: string, data: T, opts?: { singletonKey?: string; retryLimit?: number }): Promise<string | null>;
  work<T>(name: string, handler: (job: JobEnvelope<T>) => Promise<void>): Promise<void>;
  ping(): Promise<boolean>;
  stop(): Promise<void>;
}

export class MissingTenantError extends Error {
  constructor(job: string) {
    super(`job ${job} has no tenant_id; refusing to run`);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertEnvelope<T>(name: string, payload: unknown): JobEnvelope<T> {
  const p = payload as Partial<JobEnvelope<T>> | null;
  if (!p || typeof p.tenant_id !== 'string' || !UUID.test(p.tenant_id)) throw new MissingTenantError(name);
  return { tenant_id: p.tenant_id, correlation_id: p.correlation_id ?? newCorrelationId(), data: p.data as T };
}

export async function createPgBossQueue(connectionString: string, opts: { migrate: boolean }): Promise<Queue> {
  const boss = new PgBoss({ connectionString, migrate: opts.migrate, schedule: false, supervise: true });
  boss.on('error', () => undefined);
  await boss.start();
  const created = new Set<string>();
  const ensure = async (name: string) => {
    if (created.has(name)) return;
    await boss.createQueue(name);
    created.add(name);
  };
  return {
    async send(name, tenantId, data, o) {
      await ensure(name);
      const envelope: JobEnvelope<unknown> = {
        tenant_id: tenantId,
        correlation_id: currentCorrelation()?.correlationId ?? newCorrelationId(),
        data,
      };
      return boss.send(name, envelope as object, { singletonKey: o?.singletonKey, retryLimit: o?.retryLimit ?? 3, retryBackoff: true });
    },
    async work(name, handler) {
      await ensure(name);
      await boss.work(name, async (jobs) => {
        for (const job of jobs) await handler(assertEnvelope(name, job.data));
      });
    },
    async ping() {
      try {
        await boss.getQueues();
        return true;
      } catch {
        return false;
      }
    },
    async stop() {
      await boss.stop({ graceful: true, wait: true });
    },
  };
}

/** Install or upgrade the pg-boss schema as the migrator and grant the runtime role access to it. */
export async function installQueueSchema(migratorUrl: string, runtimeRole: string, queues: readonly string[]): Promise<void> {
  if (!/^[a-z_][a-z0-9_]*$/.test(runtimeRole)) throw new Error('bad role name');
  const boss = new PgBoss({ connectionString: migratorUrl, migrate: true, schedule: false, supervise: false });
  boss.on('error', () => undefined);
  await boss.start();
  for (const q of queues) await boss.createQueue(q);
  await boss.stop({ graceful: false, wait: true });
  const grant = new PgBoss({ connectionString: migratorUrl, migrate: false, schedule: false, supervise: false });
  grant.on('error', () => undefined);
  await grant.start();
  const db = grant.getDb();
  await db.executeSql(`grant usage, create on schema pgboss to ${runtimeRole}`, []);
  await db.executeSql(`grant select, insert, update, delete on all tables in schema pgboss to ${runtimeRole}`, []);
  await db.executeSql(`grant usage, select on all sequences in schema pgboss to ${runtimeRole}`, []);
  await db.executeSql(`grant execute on all functions in schema pgboss to ${runtimeRole}`, []);
  await db.executeSql(`alter default privileges in schema pgboss grant select, insert, update, delete on tables to ${runtimeRole}`, []);
  await grant.stop({ graceful: false, wait: true });
}

export const QUEUES = ['recompute.batch'] as const;
