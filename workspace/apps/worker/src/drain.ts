import type { TenantDb } from '@payclock/db';
import { drainPending, enqueueStale } from '@payclock/domain';
import { newCorrelationId, type Logger } from '@payclock/platform';

/**
 * Pending-recompute loop (B1-005): queue anything stale, then drain; repeat every `intervalMs`.
 * Each pass is idempotent and resumable; a failed project keeps its row and is retried next pass.
 */
export function startDrainLoop(db: TenantDb, logger: Logger, intervalMs = 15_000): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  const pass = async () => {
    if (stopped) return;
    try {
      await db.withGlobalWrite((tx) => enqueueStale(tx));
      const r = await drainPending(db, newCorrelationId());
      if (r.done || r.failed.length) logger.info('recompute.pending', { done: r.done, failed: r.failed.length, remaining: r.remaining });
    } catch (e) {
      logger.error('recompute.pending.error', { error_class: (e as Error).name });
    }
    if (!stopped) timer = setTimeout(pass, intervalMs);
  };
  void pass();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
