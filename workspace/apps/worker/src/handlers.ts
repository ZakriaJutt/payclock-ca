import type { TenantDb } from '@payclock/db';
import { recomputeBatch } from '@payclock/domain';
import { assertEnvelope, withCorrelation, type Logger } from '@payclock/platform';

export class RequeueError extends Error {}

/**
 * `recompute.batch`: the tenant comes from the job payload; a payload without one is refused
 * before any data is read (TRD 8.2). A result computed from stale facts is discarded and the job
 * is retried by the queue (compare-and-set, R-01).
 */
export function recomputeBatchHandler(db: TenantDb, logger: Logger) {
  return async (payload: unknown): Promise<void> => {
    const job = assertEnvelope<{ project_id?: string }>('recompute.batch', payload);
    await withCorrelation({ correlationId: job.correlation_id, tenantId: job.tenant_id }, async () => {
      const projectId = job.data?.project_id;
      if (typeof projectId !== 'string') throw new Error('recompute.batch needs data.project_id');
      const out = await recomputeBatch(db, job.tenant_id, projectId, job.correlation_id);
      logger.info('recompute.batch', { project_id: projectId, status: out.status });
      if (out.status === 'discarded' && out.reason.startsWith('fact_version')) throw new RequeueError(out.reason);
    });
  };
}
