import {
  annotateDbError,
  getDbErrorContext,
  isTransientDbConnectError,
} from './errorClassification.js';
import { DB_CONNECT_RETRY_POLICY } from './poolConfig.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(policy, randomFn) {
  const base = Math.max(0, Number(policy?.baseDelayMs) || 0);
  const jitter = Math.max(0, Number(policy?.jitterMs) || 0);
  const rnd = Math.max(0, Math.min(1, Number(randomFn()) || 0));
  return Math.floor(base + (jitter * rnd));
}

export async function acquireClientWithBoundedRetry({
  connect,
  prepare = null,
  destroy = null,
  policy = DB_CONNECT_RETRY_POLICY,
  sleepFn = sleep,
  randomFn = Math.random,
  onRetry = null,
} = {}) {
  if (typeof connect !== 'function') throw new TypeError('connect function is required');

  const maxRetries = Math.max(0, Number(policy?.maxRetries) || 0);
  let retriesUsed = 0;

  while (true) {
    let client = null;
    let phase = 'connect';
    try {
      client = await connect();
      phase = 'session_init';
      if (typeof prepare === 'function') await prepare(client);
      return client;
    } catch (rawErr) {
      const err = annotateDbError(rawErr, {
        phase,
        retryAttempted: retriesUsed > 0,
        retryCount: retriesUsed,
      });

      if (client && typeof destroy === 'function') {
        try { await destroy(client, err); } catch {}
      }

      const canRetry = retriesUsed < maxRetries && isTransientDbConnectError(err, { phase });
      if (!canRetry) {
        annotateDbError(err, {
          phase,
          retryAttempted: retriesUsed > 0,
          retryCount: retriesUsed,
        });
        throw err;
      }

      retriesUsed += 1;
      const delayMs = retryDelayMs(policy, randomFn);
      annotateDbError(err, {
        phase,
        retryAttempted: true,
        retryCount: retriesUsed,
      });
      if (typeof onRetry === 'function') {
        try {
          await onRetry({
            attempt: retriesUsed,
            delayMs,
            error: err,
            ...getDbErrorContext(err, { phase }),
          });
        } catch {}
      }
      await sleepFn(delayMs);
    }
  }
}
