import logger from '../../lib/logger.js';
import { redis } from '../../lib/redis.js';
import { contextLogSummary, safeLogError } from '../../lib/logPrivacy.js';

function parseBoolSafe(v, d = false) {
  if (v === undefined || v === null || v === '') return d;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return d;
}

function parseIntSafe(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
}

function makeCorrelationId(ctx) {
  const updateId = ctx?.update?.update_id ?? 0;
  const random = Math.random().toString(36).slice(2, 10);
  return `${updateId}-${random}`;
}

/**
 * Privacy-safe logging middleware:
 * - no raw Telegram actor/chat identifiers;
 * - no usernames, message fragments or full callback payloads;
 * - optional Redis trace stores only pseudonymous references.
 */
export function createLoggingMiddleware(opts = {}) {
  const log = opts.logger || logger;
  const traceRedisEnabled = parseBoolSafe(process.env.TRACE_REDIS_ENABLED, false);
  const traceTtlSec = Math.max(60, parseIntSafe(process.env.TRACE_REDIS_TTL_SEC, 900));

  return async (ctx, next) => {
    const cid = makeCorrelationId(ctx);
    ctx.state = ctx.state || {};
    ctx.state.cid = cid;

    const base = { cid, ...contextLogSummary(ctx) };
    const startedAt = Date.now();

    if (traceRedisEnabled && redis) {
      try {
        await redis.set(`trace:${cid}`, { ...base, ts: Date.now() }, { ex: traceTtlSec });
      } catch (error) {
        log.debug({ cid, err: safeLogError(error) }, 'trace.redis.fail');
      }
    }

    log.info(base, 'update.in');

    try {
      await next();
      log.info({ ...base, ms: Date.now() - startedAt }, 'update.ok');
    } catch (error) {
      log.error({ ...base, ms: Date.now() - startedAt, err: safeLogError(error) }, 'update.err');
      throw error;
    }
  };
}
