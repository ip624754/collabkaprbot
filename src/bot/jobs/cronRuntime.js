// STEP590G1: Shared cron runtime.
// Compatibility extraction only: preserve cron behavior, locks, TTLs and route contracts.
import * as R from '../../lib/redis.js';
import { getBot } from '../bot.js';
import { queueOpsAlert } from '../opsAlerts.js';
import { reportCronJobFailure } from '../../lib/cronFailure.js';

// BEGIN MOVED CRON BODY: runtime
export const redis = R.redis;

export const k = R.k;

export const acquireLock = R.acquireLock;

export const releaseLock = R.releaseLock;

export const CRON_LOCK_TTL_SEC = 55;

export const CRON_LAST_RUN_TTL_SEC = 14 * 24 * 60 * 60;

export async function writeCronLastRun(name, payload) {
  try {
    const key = k(['cron', String(name || 'tick'), 'last_run']);
    await redis.set(key, payload, { ex: CRON_LAST_RUN_TTL_SEC });
  } catch {
    // ignore metrics failures
  }
}

export async function recordCronTickFailure(redisName, routeJob, error) {
  await reportCronJobFailure({
    job: routeJob,
    error,
    beforeQueue: async (alert) => {
      await writeCronLastRun(redisName, {
        ts: new Date().toISOString(),
        status: 'error',
        error_class: alert.metadata.error_class,
        phase: alert.metadata.phase,
        retry_attempted: alert.metadata.retry_attempted,
        retry_count: alert.metadata.retry_count,
      });
    },
    queueAlert: async ({ metadata, ...opsArgs }) => {
      return await queueOpsAlert(getBot().api, opsArgs);
    },
  });
}

export async function withLock(lockKey, ttlSec, fn) {
  const lock = await acquireLock(lockKey, ttlSec);
  if (!lock) return { locked: true };
  try {
    const r = await fn();
    return { locked: false, result: r };
  } finally {
    await releaseLock(lockKey, lock.token);
  }
}
// END MOVED CRON BODY: runtime
