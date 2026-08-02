// STEP590G1: Audit flush cron job.
// Compatibility extraction only: preserve cron behavior, locks, TTLs and route contracts.
import * as db from '../../db/queries.js';
import { CFG } from '../../lib/config.js';
import { CRON_LOCK_TTL_SEC, k, withLock, writeCronLastRun } from './cronRuntime.js';

// BEGIN MOVED CRON BODY: audit
export async function auditFlushTick() {
  const startedAt = Date.now();
  const lockKey = k(['lock', 'cron', 'audit_flush_tick']);

  const r = await withLock(lockKey, CRON_LOCK_TTL_SEC, async () => {
    const out = await db.flushWorkspaceAuditBuffer({
      batchSize: CFG.AUDIT_BUFFER_FLUSH_BATCH,
      maxMs: CFG.AUDIT_BUFFER_FLUSH_MAX_MS,
    });
    return out;
  });

  if (r.locked) {
    const out = { status: 'locked' };
    try {
      await writeCronLastRun('audit_flush_tick', { ts: new Date().toISOString(), ...out });
    } catch {}
    return out;
  }

  const res = r.result || {};
  const out = {
    status: res.ok ? 'ok' : (res.skipped ? 'skipped' : 'error'),
    ...(res.skipped ? { skipped: res.skipped } : {}),
    ...(res.ok ? { flushed: res.flushed, dropped: res.dropped, batches: res.batches, remaining: res.remaining } : {}),
    duration_ms: Date.now() - startedAt,
  };

  try {
    await writeCronLastRun('audit_flush_tick', { ts: new Date().toISOString(), ...out });
  } catch {}

  return out;
}
// END MOVED CRON BODY: audit
