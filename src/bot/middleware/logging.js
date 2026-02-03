import logger from '../../lib/logger.js';
import { redis } from '../../lib/redis.js';

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

function short(s, max = 180) {
  const t = String(s || '');
  if (t.length <= max) return t;
  return t.slice(0, max) + '…';
}

function makeCorrelationId(ctx) {
  const upd = ctx?.update?.update_id ?? 0;
  const uid = ctx?.from?.id ?? 0;
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${upd}-${uid}-${rnd}`;
}

function summarizeAction(ctx) {
  // Keep logs safe: we do NOT log full arbitrary user text.
  if (ctx?.callbackQuery?.data) {
    const data = String(ctx.callbackQuery.data);
    const action = data.split('|')[0] || 'callback';
    return {
      kind: 'callback_query',
      action,
      cb: short(data, 200),
    };
  }

  const txt = ctx?.message?.text ? String(ctx.message.text) : '';
  if (txt && txt.startsWith('/')) {
    const cmd = txt.split(/\s+/)[0];
    return { kind: 'command', action: cmd };
  }

  if (ctx?.message) {
    // Do not log message body (privacy). Only type.
    return { kind: 'message', action: 'message' };
  }

  if (ctx?.inlineQuery) return { kind: 'inline_query', action: 'inline_query' };
  if (ctx?.chatJoinRequest) return { kind: 'chat_join_request', action: 'chat_join_request' };
  return { kind: 'update', action: 'update' };
}

function safeErr(e) {
  const inner = e?.error || e || null;
  return {
    name: String(inner?.name || 'Error'),
    message: String(inner?.message || ''),
  };
}

/**
 * Logging middleware (P0 observability):
 * - assigns correlation id (ctx.state.cid)
 * - logs update start/end + duration
 * - optional trace snapshot to Redis (disabled by default)
 *
 * Zero UI/behavior change.
 */
export function createLoggingMiddleware(opts = {}) {
  const log = opts.logger || logger;

  const traceRedisEnabled = parseBoolSafe(process.env.TRACE_REDIS_ENABLED, false);
  const traceTtlSec = parseIntSafe(process.env.TRACE_REDIS_TTL_SEC, 900);

  return async (ctx, next) => {
    const cid = makeCorrelationId(ctx);
    ctx.state = ctx.state || {};
    ctx.state.cid = cid;

    const base = {
      cid,
      update_id: ctx?.update?.update_id ?? null,
      from_id: ctx?.from?.id ?? null,
      chat_id: ctx?.chat?.id ?? null,
      username: ctx?.from?.username ?? null,
      ...summarizeAction(ctx),
    };

    const t0 = Date.now();

    // Optional trace snapshot to Redis (no coupling to business state).
    if (traceRedisEnabled && redis) {
      try {
        const key = `trace:${cid}`;
        await redis.set(key, { ...base, ts: Date.now() }, { ex: traceTtlSec });
      } catch (e) {
        // do not fail the update if tracing fails
        log.debug({ cid, err: safeErr(e) }, 'trace.redis.fail');
      }
    }

    log.info(base, 'update.in');

    try {
      await next();
      log.info({ ...base, ms: Date.now() - t0 }, 'update.ok');
    } catch (e) {
      log.error({ ...base, ms: Date.now() - t0, err: safeErr(e) }, 'update.err');
      throw e;
    }
  };
}
