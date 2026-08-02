// STEP590G1: Broadcast cron job.
// Compatibility extraction only: preserve cron behavior, locks, TTLs and route contracts.
import * as R from '../../lib/redis.js';
import * as db from '../../db/queries.js';
import { getBot } from '../bot.js';
import { InlineKeyboard } from 'grammy';
import { CFG } from '../../lib/config.js';
import logger from '../../lib/logger.js';
import { opaqueLogRef, safeLogError } from '../../lib/logPrivacy.js';
import { qstashPublishJSON, getQStashDeliveryUrl, getBroadcastFlowControl, getQStashConfigSnapshot, isQStashLibAvailable } from '../../lib/qstash.js';
import { tgTimeoutSignal, TG_HTTP_MEDIA_TIMEOUT_MS } from '../../lib/tgApi.js';
import { queueOpsAlert } from '../opsAlerts.js';
import { buildBroadcastDeliveryPlan } from '../../lib/broadcast.js';
import { attachBroadcastPartialDeliveryEvidence, buildBroadcastUnknownReason, classifyBroadcastSendError, extractTelegramMessageIds } from '../broadcastDeliverySafety.js';
import { persistBroadcastRejectedOrUnknown, persistBroadcastSentOrUnknown, persistBroadcastUnknown } from '../broadcastDeliveryReceipt.js';
import { CRON_LAST_RUN_TTL_SEC, CRON_LOCK_TTL_SEC, k, recordCronTickFailure, redis, withLock, writeCronLastRun } from './cronRuntime.js';

// BEGIN MOVED CRON BODY: broadcast
const incrWithExpire = typeof R.incrWithExpire === 'function' ? R.incrWithExpire : async () => 0;

const incrWithExpireOnFirst =
  typeof R.incrWithExpireOnFirst === 'function' ? R.incrWithExpireOnFirst : async () => 0;

const lpushTrim = typeof R.lpushTrim === 'function' ? R.lpushTrim : async () => false;

const BC_COOLDOWN_TTL_SEC = 24 * 60 * 60;

const BC_PENDING_SNAPSHOT_TTL_SEC = 30 * 60;

const BC_COOLDOWN_UNTIL_KEY = k(['broadcast', 'cooldown_until']);

const BC_COOLDOWN_BROADCAST_ID_KEY = k(['broadcast', 'cooldown_broadcast_id']);

const BC_COOLDOWN_LAST_429_AT_KEY = k(['broadcast', 'last_429_at']);

const BC_COOLDOWN_LAST_429_REASON_KEY = k(['broadcast', 'last_429_reason']);

const SYS_BC_QSTASH_FANOUT_KEY = k(['sys', 'broadcast_qstash_fanout']);

function bcTickDeferredRedisDayKey(day) {
  return k(['ops', 'reasons', 'broadcast_tick_deferred_redis', 'd', String(day || 'na')]);
}

const BC_TICK_DEFERRED_REDIS_LAST_AT_KEY = k(['ops', 'reasons', 'broadcast_tick_deferred_redis', 'last_at']);

const BC_TICK_DEFERRED_REDIS_LAST_WHERE_KEY = k(['ops', 'reasons', 'broadcast_tick_deferred_redis', 'last_where']);

async function emitBroadcastTickDeferredRedis(where) {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  try {
    await incrDayCounter(bcTickDeferredRedisDayKey(day));
  } catch {}
  const ttlSec = 2 * 24 * 60 * 60;
  try {
    await redis.set(BC_TICK_DEFERRED_REDIS_LAST_AT_KEY, new Date().toISOString(), { ex: ttlSec });
  } catch {}
  try {
    await redis.set(
      BC_TICK_DEFERRED_REDIS_LAST_WHERE_KEY,
      String(where || 'broadcast_tick').slice(0, 120),
      { ex: ttlSec }
    );
  } catch {}
}

async function isRedisOperationalForBroadcastTick() {
  // Mass operations must fail-closed when Redis is unavailable.
  if (!CFG.UPSTASH_REDIS_REST_URL || !CFG.UPSTASH_REDIS_REST_TOKEN) return false;
  try {
    // Key may not exist — we only care that Redis responds.
    await redis.get(k(['health', 'redis_probe']));
    return true;
  } catch {
    return false;
  }
}

function clampHardSkipTtlSec() {
  const days = Number(process.env.BROADCAST_HARD_SKIP_TTL_DAYS || 90) || 90;
  const d = Math.max(7, Math.min(365, days));
  return d * 24 * 60 * 60;
}

function broadcastHardSkipKey(tgId) {
  return k(['broadcast', 'hard_skip', 'tg', String(tgId)]);
}

const BROADCAST_HARD_SKIP_RECENT_KEY = k(['broadcast', 'hard_skip', 'recent']);

const BROADCAST_HARD_SKIP_RECENT_MAX = 1000;

const BROADCAST_HARD_SKIP_HIT_RECENT_KEY = k(['broadcast', 'hard_skip', 'hit_recent']);

const BROADCAST_HARD_SKIP_HIT_RECENT_MAX = 2000;

const BROADCAST_HARD_SKIP_HIT_RECENT_TTL_SEC = 14 * 24 * 60 * 60;

function normalizeHardSkipReasonKey(reason) {
  const raw = String(reason || 'unknown').toLowerCase();
  // Known canonical reasons (see normalizeBroadcastDeadChatReason).
  if (raw.includes('bot_blocked') || raw.includes('bot was blocked') || raw.includes('blocked')) return 'bot_blocked';
  if (raw.includes('chat_not_found') || raw.includes('chat not found') || raw.includes('not found')) return 'chat_not_found';
  if (raw.includes('user_deactivated') || raw.includes('deactivated')) return 'user_deactivated';

  const slug = raw
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  if (!slug) return 'unknown';
  if (slug === 'unknown') return 'unknown';
  return 'other';
}

function bcHardSkipHitReasonDayKey(day, reasonKey) {
  return k(['broadcast', 'hard_skip', 'hit_reason', 'd', String(day || 'na'), String(reasonKey || 'unknown')]);
}

export async function logBroadcastHardSkipHit(tgId, reason, meta = {}) {
  const id = Number(tgId || 0);
  if (!id) return false;
  const r = String(reason || 'unknown').slice(0, 60);
  const bid = Number(meta?.broadcastId || meta?.broadcast_id || 0) || 0;
  const uid = Number(meta?.userId || meta?.user_id || 0) || 0;
  const via = meta?.via ? String(meta.via).slice(0, 40) : '';
  try {
    const payload = JSON.stringify({
      tgId: id,
      r,
      at: new Date().toISOString(),
      ...(bid ? { broadcastId: bid } : {}),
      ...(uid ? { userId: uid } : {}),
      ...(via ? { via } : {}),
    });
    await lpushTrim(
      BROADCAST_HARD_SKIP_HIT_RECENT_KEY,
      payload,
      BROADCAST_HARD_SKIP_HIT_RECENT_MAX,
      BROADCAST_HARD_SKIP_HIT_RECENT_TTL_SEC
    );

    // Best-effort: per-reason daily counters (operator visibility; bounded).
    try {
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const rk = normalizeHardSkipReasonKey(r);
      await incrWithExpireOnFirst(bcHardSkipHitReasonDayKey(day, rk), BROADCAST_HARD_SKIP_HIT_RECENT_TTL_SEC);
    } catch {}
    return true;
  } catch {
    return false;
  }
}

function parseHardSkipVal(v) {
  if (!v) return null;
  if (typeof v === 'object') {
    if (v.r) return String(v.r);
    if (v.reason) return String(v.reason);
  }
  if (typeof v === 'string') {
    try {
      const o = JSON.parse(v);
      if (o && typeof o === 'object' && (o.r || o.reason)) return String(o.r || o.reason);
    } catch {}
    const s = v.split('|')[0];
    return s ? String(s) : null;
  }
  return String(v);
}

export function normalizeBroadcastDeadChatReason(code, desc) {
  const d = String(desc || '').toLowerCase();
  if (d.includes('bot was blocked')) return 'bot_blocked';
  if (d.includes('chat not found')) return 'chat_not_found';
  if (d.includes('user is deactivated')) return 'user_deactivated';
  // Keep conservative: do NOT hard-skip generic 400/403 without a known permanent description.
  return null;
}

export async function getBroadcastHardSkipReason(tgId) {
  try {
    const v = await redis.get(broadcastHardSkipKey(tgId));
    return parseHardSkipVal(v);
  } catch {
    return null;
  }
}

export async function setBroadcastHardSkip(tgId, reason) {
  const r = String(reason || 'unknown').slice(0, 60);
  const ttlSec = clampHardSkipTtlSec();
  try {
    await redis.set(
      broadcastHardSkipKey(tgId),
      { r, at: new Date().toISOString() },
      { ex: ttlSec }
    );
  } catch {}

  // Best-effort: write into the "recent" list for admin browsing.
  try {
    const payload = JSON.stringify({ tgId: Number(tgId) || 0, r, at: new Date().toISOString() });
    await lpushTrim(BROADCAST_HARD_SKIP_RECENT_KEY, payload, BROADCAST_HARD_SKIP_RECENT_MAX, ttlSec);
  } catch {}


  // Best-effort: counters for /api/health (bounded; Redis-only).
  try {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    await incrDayCounter(bcHardSkipSetDayKey(day));
  } catch {}
}

async function getBroadcastHardSkipMap(tgIds) {
  try {
    const ids = (Array.isArray(tgIds) ? tgIds : [])
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x > 0);
    if (!ids.length) return new Map();
    const uniq = Array.from(new Set(ids));
    const keys = uniq.map((id) => broadcastHardSkipKey(id));
    if (typeof redis.mget !== 'function') return new Map();
    const vals = await redis.mget(keys);
    const map = new Map();
    for (let i = 0; i < uniq.length; i++) {
      const r = parseHardSkipVal(vals?.[i]);
      if (r) map.set(uniq[i], r);
    }
    return map;
  } catch {
    return new Map();
  }
}

function bcCooldownSetDayKey(day) {
  return k(['broadcast', 'cooldown_set', 'd', String(day || 'na')]);
}

function bcCooldownSkipDayKey(day) {
  return k(['broadcast', 'cooldown_skip', 'd', String(day || 'na')]);
}

function bcDeferSetDayKey(day) {
  return k(['broadcast', 'defer_set', 'd', String(day || 'na')]);
}

function bcDeferWaitDayKey(day) {
  return k(['broadcast', 'defer_wait', 'd', String(day || 'na')]);
}

function bcQuarantineSetDayKey(day) {
  return k(['broadcast', 'quarantine_set', 'd', String(day || 'na')]);
}

function bcPendingDeliveriesKey() {
  return k(['broadcast', 'pending_deliveries']);
}

async function writeBroadcastPendingSnapshot(broadcastId, pendingCount) {
  // Best-effort Redis-only visibility for operators via /api/health.
  try {
    await redis.set(
      bcPendingDeliveriesKey(),
      {
        ts: new Date().toISOString(),
        broadcast_id: Number(broadcastId) || null,
        pending_count: Number(pendingCount) || 0,
      },
      { ex: BC_PENDING_SNAPSHOT_TTL_SEC }
    );
  } catch {}
}

async function clearBroadcastPendingSnapshot() {
  try {
    await redis.del(bcPendingDeliveriesKey());
  } catch {}
}

function bcHardSkipSetDayKey(day) {
  return k(['broadcast', 'hard_skip', 'set', 'd', String(day || 'na')]);
}

function bcHardSkipHitDayKey(day) {
  return k(['broadcast', 'hard_skip', 'hit', 'd', String(day || 'na')]);
}

function bcHardSkipUnskipDayKey(day) {
  return k(['broadcast', 'hard_skip', 'unskip', 'd', String(day || 'na')]);
}

async function incrDayCounter(key, ttlSec = CRON_LAST_RUN_TTL_SEC) {
  // Atomic INCR + EXPIRE (bounded storage).
  // If Redis is degraded, fail-silent: metrics must never break cron.
  const v = await incrWithExpire(key, ttlSec);
  return Number(v) || 0;
}

async function getBroadcastQStashFanoutStatus() {
  // Hard safety: fan-out is only valid when both publish and verify contours are configured.
  // Otherwise we would enqueue delivery work that later dies on signed callback verification.
  // IMPORTANT: if Redis is degraded, we treat fanout as UNKNOWN and the tick will be deferred (fail-closed for mass ops).
  if (!isQStashLibAvailable()) return { enabled: false, redis_ok: true, forced_off: true, reason: 'qstash_lib_missing' };

  const qstashConfig = getQStashConfigSnapshot();
  if (!qstashConfig.publishConfigured) return { enabled: false, redis_ok: true, forced_off: true, reason: 'qstash_publish_missing', qstash: qstashConfig };
  if (!qstashConfig.verifyConfigured) return { enabled: false, redis_ok: true, forced_off: true, reason: 'qstash_verify_missing', qstash: qstashConfig };

  try {
    const v = await redis.get(SYS_BC_QSTASH_FANOUT_KEY);
    if (v === null || v === undefined) return { enabled: false, redis_ok: true, forced_off: false, reason: 'flag_missing', qstash: qstashConfig };
    const s = String(v).trim().toLowerCase();
    const enabled = s === '1' || s === 'true' || s === 'on' || s === 'yes';
    return { enabled, redis_ok: true, forced_off: false, reason: enabled ? 'enabled' : 'disabled', qstash: qstashConfig };
  } catch (e) {
    return { enabled: false, redis_ok: false, forced_off: false, reason: 'redis_error', qstash: qstashConfig };
  }
}

async function getGlobalBroadcastCooldown() {
  try {
    const rawUntil = await redis.get(BC_COOLDOWN_UNTIL_KEY);
    const untilMs = Number(rawUntil) || 0;
    if (!untilMs) return null;
    const rawBid = await redis.get(BC_COOLDOWN_BROADCAST_ID_KEY);
    const bid = Number(rawBid) || 0;
    return { untilMs, broadcastId: bid > 0 ? bid : null };
  } catch {
    return null;
  }
}

const BROADCAST_BATCH_SIZE = 25;

const BROADCAST_SEND_DELAY_MS = 50;

const BROADCAST_TIME_BUDGET_MS = Math.max(
  8000,
  Math.min(55_000, Number(process.env.BROADCAST_TIME_BUDGET_MS || 45_000) || 45_000)
);

const BROADCAST_TIME_BUDGET_RESERVE_MS = Math.max(
  1500,
  Math.min(
    15_000,
    Number(process.env.BROADCAST_TIME_BUDGET_RESERVE_MS || 5_000) || 5_000
  )
);

const BROADCAST_COOLDOWN_PAD_SEC = 30;

const BROADCAST_QUARANTINE_THRESHOLD = Math.max(
  2,
  Math.min(10, Number(process.env.BROADCAST_QUARANTINE_THRESHOLD || 3) || 3)
);

const BROADCAST_QUARANTINE_SEC = Math.max(
  60,
  Math.min(6 * 3600, Number(process.env.BROADCAST_QUARANTINE_SEC || 1200) || 1200)
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function broadcastCooldownKey(broadcastId) {
  return k(['broadcast', String(broadcastId), 'cooldown_until']);
}

function broadcastQuarantineCountKey(broadcastId, userId) {
  return k(['broadcast', String(broadcastId), 'qcnt', String(userId)]);
}

async function resetBroadcastQuarantineCount(broadcastId, userId) {
  try {
    await redis.del(broadcastQuarantineCountKey(broadcastId, userId));
  } catch {}
}

async function bumpBroadcastQuarantineCount(broadcastId, userId) {
  try {
    const key = broadcastQuarantineCountKey(broadcastId, userId);
    // Atomic INCR + EXPIRE-on-first (prevents keys without TTL).
    const v = await incrWithExpireOnFirst(key, 24 * 60 * 60);
    return Number(v) || 0;
  } catch {
    return 0;
  }
}

export async function getBroadcastCooldownUntilMs(broadcastId) {
  // Fast path: per-broadcast cooldown key
  try {
    const v = await redis.get(broadcastCooldownKey(broadcastId));
    const ms = v ? Number(v) : 0;
    if (Number.isFinite(ms) && ms > 0) return ms;
  } catch {
    // ignore
  }

  // Fallback: global cooldown (only if it matches this broadcastId)
  try {
    const rawBid = await redis.get(BC_COOLDOWN_BROADCAST_ID_KEY);
    const bid = Number(rawBid) || 0;
    if (bid > 0 && Number(broadcastId) === bid) {
      const rawUntil = await redis.get(BC_COOLDOWN_UNTIL_KEY);
      const ms = rawUntil ? Number(rawUntil) : 0;
      if (Number.isFinite(ms) && ms > 0) return ms;
    }
  } catch {
    // ignore
  }

  return 0;
}

export async function setBroadcastCooldown(broadcastId, retryAfterSec, reason = 'telegram_429') {
  const now = Date.now();
  const safeSec = Math.max(1, Math.min(3600, Number(retryAfterSec || 0) || 0));
  const proposedUntil = now + safeSec * 1000;
  const perKey = broadcastCooldownKey(broadcastId);
  const nowIso = new Date(now).toISOString();

  // Prefer atomic Lua: set per-broadcast + global cooldown keys consistently.
  // If scripts are unavailable, fall back to sequential SETs.
  try {
    const script = `
      local perKey = KEYS[1]
      local gUntilKey = KEYS[2]
      local gBidKey = KEYS[3]
      local lastAtKey = KEYS[4]
      local lastReasonKey = KEYS[5]

      local nowMs = tonumber(ARGV[1]) or 0
      local proposedUntil = tonumber(ARGV[2]) or 0
      local padSec = tonumber(ARGV[3]) or 0
      local reason = tostring(ARGV[4] or 'telegram_429')
      local bid = tostring(ARGV[5] or '')
      local bcTtlSec = tonumber(ARGV[6]) or 86400
      local lastAtIso = tostring(ARGV[7] or '')

      local cur = redis.call('GET', perKey)
      local curMs = tonumber(cur) or 0
      local finalUntil = proposedUntil
      if curMs > finalUntil then finalUntil = curMs end

      local ttlSec = 5
      if finalUntil > nowMs then
        ttlSec = math.ceil((finalUntil - nowMs) / 1000) + padSec
        if ttlSec < 5 then ttlSec = 5 end
      else
        ttlSec = 5 + padSec
      end

      redis.call('SET', perKey, tostring(finalUntil), 'EX', ttlSec)
      redis.call('SET', gUntilKey, tostring(finalUntil), 'EX', ttlSec)
      if bid ~= '' then redis.call('SET', gBidKey, bid, 'EX', ttlSec) end
      if lastAtIso ~= '' then redis.call('SET', lastAtKey, lastAtIso, 'EX', bcTtlSec) end
      if reason ~= '' then redis.call('SET', lastReasonKey, reason, 'EX', bcTtlSec) end
      return finalUntil
    `;

    const r = await redis.eval(
      script,
      [
        perKey,
        BC_COOLDOWN_UNTIL_KEY,
        BC_COOLDOWN_BROADCAST_ID_KEY,
        BC_COOLDOWN_LAST_429_AT_KEY,
        BC_COOLDOWN_LAST_429_REASON_KEY,
      ],
      [
        String(now),
        String(proposedUntil),
        String(BROADCAST_COOLDOWN_PAD_SEC),
        String(reason || 'telegram_429'),
        String(broadcastId),
        String(BC_COOLDOWN_TTL_SEC),
        String(nowIso),
      ]
    );

    const finalUntil = Number(r) || proposedUntil;

    // Daily counters for /api/health (bounded; best-effort).
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    await incrDayCounter(bcCooldownSetDayKey(day));
    if (String(reason) === 'deferred_wait') {
      await incrDayCounter(bcDeferWaitDayKey(day));
    }

    return finalUntil;
  } catch {
    // Sequential fallback (still bounded). If Redis is down, persist a DB fuse.
    try {
      const cur = await redis.get(perKey);
      let curMs = cur ? Number(cur) : 0;
      if (!Number.isFinite(curMs)) curMs = 0;
      const finalUntil = Math.max(curMs, proposedUntil);
      const ttlSec = Math.max(
        5,
        Math.ceil((finalUntil - now) / 1000) + BROADCAST_COOLDOWN_PAD_SEC
      );

      await redis.set(perKey, String(finalUntil), { ex: ttlSec });
      await redis.set(BC_COOLDOWN_UNTIL_KEY, String(finalUntil), { ex: ttlSec });
      await redis.set(BC_COOLDOWN_BROADCAST_ID_KEY, String(broadcastId), { ex: ttlSec });
      await redis.set(BC_COOLDOWN_LAST_429_AT_KEY, nowIso, { ex: BC_COOLDOWN_TTL_SEC });
      await redis.set(BC_COOLDOWN_LAST_429_REASON_KEY, String(reason || 'telegram_429'), { ex: BC_COOLDOWN_TTL_SEC });

      const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      await incrDayCounter(bcCooldownSetDayKey(day));
      if (String(reason) === 'deferred_wait') {
        await incrDayCounter(bcDeferWaitDayKey(day));
      }

      return finalUntil;
    } catch {
      // Redis down: persist a DB fuse so next ticks can skip BEFORE polling recipients.
      try {
        await db.atomicMaxBroadcastCooldownUntil(
          broadcastId,
          new Date(proposedUntil).toISOString(),
          reason
        );
      } catch {}

      // Best-effort: even if both Redis and DB fuse fail, we still break the batch on 429.
      return proposedUntil;
    }
  }
}

export function extractRetryAfterSec(err) {
  const a = err?.parameters?.retry_after;
  const b = err?.response?.parameters?.retry_after;
  const c = err?.response?.body?.parameters?.retry_after;
  const v = Number(a ?? b ?? c);
  return Number.isFinite(v) && v > 0 ? v : 5;
}

export async function sendBroadcastMessage(api, tgId, bc) {
  const plan = buildBroadcastDeliveryPlan(bc, { maxButtons: 3, captionSafeLimit: 900 });
  const messages = [];

  try {
    for (const msg of plan.messages) {
      const opts = {};
      if (msg.reply_markup) opts.reply_markup = msg.reply_markup;

      let sent = null;
      if (msg.kind === 'text') {
        opts.parse_mode = 'HTML';
        sent = await api.sendMessage(Number(tgId), msg.text || '', opts, tgTimeoutSignal());
      } else {
        if (msg.caption) {
          opts.caption = msg.caption;
          opts.parse_mode = 'HTML';
        }

        if (msg.kind === 'photo') {
          sent = await api.sendPhoto(Number(tgId), msg.file_id, opts, tgTimeoutSignal(TG_HTTP_MEDIA_TIMEOUT_MS));
        } else if (msg.kind === 'video') {
          sent = await api.sendVideo(Number(tgId), msg.file_id, opts, tgTimeoutSignal(TG_HTTP_MEDIA_TIMEOUT_MS));
        } else if (msg.kind === 'animation') {
          sent = await api.sendAnimation(Number(tgId), msg.file_id, opts, tgTimeoutSignal(TG_HTTP_MEDIA_TIMEOUT_MS));
        } else if (msg.kind === 'document') {
          sent = await api.sendDocument(Number(tgId), msg.file_id, opts, tgTimeoutSignal(TG_HTTP_MEDIA_TIMEOUT_MS));
        } else {
          opts.parse_mode = 'HTML';
          sent = await api.sendMessage(
            Number(tgId),
            bc.draft_text || bc.draft_caption || '(empty)',
            opts,
            tgTimeoutSignal()
          );
        }
      }

      if (sent) messages.push(sent);
    }
  } catch (err) {
    throw attachBroadcastPartialDeliveryEvidence(err, { messages });
  }

  return {
    messages,
    message_ids: extractTelegramMessageIds({ messages }),
  };
}

export async function broadcastTick() {
  const lockKey = k(['lock', 'broadcast_tick']);

  try {
    return await withLock(lockKey, CRON_LOCK_TTL_SEC, async () => {
    // EARLY EXIT on Telegram 429 cooldown (Redis-only) — avoid DB polling during cooldown.
    const globalCd = await getGlobalBroadcastCooldown();
    if (globalCd && globalCd.untilMs > Date.now()) {
      const retry_after_sec = Math.max(
        1,
        Math.ceil((globalCd.untilMs - Date.now()) / 1000)
      );
      const out = {
        status: 'skip',
        reason: 'cooldown',
        cooldown_source: 'redis_global',
        broadcast_id: globalCd.broadcastId,
        retry_after_sec,
        cooldown_until: new Date(globalCd.untilMs).toISOString(),
      };
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      await incrDayCounter(bcCooldownSkipDayKey(day));
      await writeCronLastRun('broadcast_tick', { ts: new Date().toISOString(), ...out });
      return out;
    }



// Fail-closed for mass broadcast work when Redis is degraded.
// Rationale: when Redis is down we lose locks/cooldowns/fanout runtime flags, and falling back to sync send can overload Neon.
const redisOk = await isRedisOperationalForBroadcastTick();
if (!redisOk) {
  const out = { status: 'skip', reason: 'redis_degraded', deferred: true };
  try {
    await emitBroadcastTickDeferredRedis('broadcast_tick');
  } catch {}
  await writeCronLastRun('broadcast_tick', { ts: new Date().toISOString(), ...out });
  return out;
}
    const bc = await db.getActiveBroadcast();
    if (!bc) {
      const out = { status: 'idle', reason: 'no_active_broadcast' };
      await clearBroadcastPendingSnapshot();

      await writeCronLastRun('broadcast_tick', { ts: new Date().toISOString(), ...out });
      return out;
    }

    // 429 cooldown:
    // - fast path: Redis (early exit without DB polling)
    // - DB fuse: broadcasts.cooldown_until (used only when Redis is unavailable)
    const nowMs = Date.now();

    const redisCooldownUntilMs = await getBroadcastCooldownUntilMs(bc.id);
    if (redisCooldownUntilMs && redisCooldownUntilMs > nowMs) {
      const retry_after_sec = Math.max(
        1,
        Math.ceil((redisCooldownUntilMs - nowMs) / 1000)
      );
      const out = {
        status: 'skip',
        reason: 'cooldown',
        cooldown_source: 'redis_per_broadcast',
        broadcast_id: bc.id,
        retry_after_sec,
        cooldown_until: new Date(redisCooldownUntilMs).toISOString(),
      };
      await writeCronLastRun('broadcast_tick', { ts: new Date().toISOString(), ...out });
      return out;
    }

    const dbCooldownUntilMs = bc.cooldown_until ? Date.parse(String(bc.cooldown_until)) : 0;
    if (dbCooldownUntilMs && Number.isFinite(dbCooldownUntilMs) && dbCooldownUntilMs > nowMs) {
      const retry_after_sec = Math.max(1, Math.ceil((dbCooldownUntilMs - nowMs) / 1000));
      const out = {
        status: 'skip',
        reason: 'cooldown',
        cooldown_source: 'db_fuse',
        broadcast_id: bc.id,
        retry_after_sec,
        cooldown_until: new Date(dbCooldownUntilMs).toISOString(),
        ...(bc.cooldown_reason ? { cooldown_reason: String(bc.cooldown_reason) } : {}),
      };
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      await incrDayCounter(bcCooldownSkipDayKey(day));
      await writeCronLastRun('broadcast_tick', { ts: new Date().toISOString(), ...out });
      return out;
    }

    // Atomic transition PENDING → RUNNING (prevents double-start on lock expiry)
    if (bc.status === 'PENDING') {
      const ok = await db.atomicTransitionBroadcast(bc.id, 'PENDING', 'RUNNING', {
        started_at: new Date().toISOString(),
      });
      if (!ok) {
        const out = { status: 'skip', reason: 'already_running', broadcast_id: bc.id };
        await writeCronLastRun('broadcast_tick', { ts: new Date().toISOString(), ...out });
        return out;
      }
      // Keep local snapshot consistent (avoid special-casing below).
      bc.status = 'RUNNING';
    }


const fanoutStatus = await getBroadcastQStashFanoutStatus();
if (!fanoutStatus.redis_ok) {
  const out = { status: 'skip', reason: 'redis_degraded', deferred: true, broadcast_id: bc.id };
  try {
    await emitBroadcastTickDeferredRedis('broadcast_fanout_flag');
  } catch {}
  await writeCronLastRun('broadcast_tick', { ts: new Date().toISOString(), ...out });
  return out;
}
const fanoutEnabled = !!fanoutStatus.enabled;


    const lastUserId = Number(bc.last_sent_user_id || 0);
    const recipients = await db.listBroadcastUnsentRecipients(
      bc.id,
      bc.audience || 'all',
      BROADCAST_BATCH_SIZE,
      lastUserId
    );

    if (!recipients.length) {
      // Fan-out mode: even if there are no more *new* recipients to enqueue,
      // we must NOT finish the broadcast until all queued deliveries are terminal.
      if (fanoutEnabled) {
        try {
          await db.quarantineStaleBroadcastDeliveries(bc.id, 60);
          const pending = await db.countBroadcastPendingDeliveries(bc.id);
          await writeBroadcastPendingSnapshot(bc.id, pending);
          if (pending > 0) {
            // If we have deferred/quarantined recipients, set cooldown until the earliest window.
            try {
              const nextRetryMs = await db.getNextBroadcastDeferredRetryMs(bc.id);
              if (nextRetryMs && nextRetryMs > Date.now()) {
                const retrySec = Math.max(1, Math.ceil((nextRetryMs - Date.now()) / 1000));
                await setBroadcastCooldown(bc.id, retrySec, 'deferred_wait');
                const out = {
                  status: 'skip',
                  reason: 'deferred_wait',
                  broadcast_id: bc.id,
                  pending_count: pending,
                  retry_after_sec: retrySec,
                  retry_at: new Date(nextRetryMs).toISOString(),
                };
                await writeCronLastRun('broadcast_tick', { ts: new Date().toISOString(), ...out });
                return out;
              }
            } catch {
              // ignore and fall back to a generic pending screen
            }

            const out = {
              status: 'skip',
              reason: 'pending_deliveries',
              broadcast_id: bc.id,
              pending_count: pending,
            };
            await writeCronLastRun('broadcast_tick', { ts: new Date().toISOString(), ...out });
            return out;
          }
        } catch {
          // If DB is unstable, avoid finishing. Let next tick decide.
          const out = {
            status: 'skip',
            reason: 'pending_check_failed',
            broadcast_id: bc.id,
          };
          await writeCronLastRun('broadcast_tick', { ts: new Date().toISOString(), ...out });
          return out;
        }
      }

      // If we have deferred recipients waiting for retry_after, do NOT finish the broadcast.
      // Instead, set a Redis cooldown until the earliest deferred retry window.
      try {
        const nextRetryMs = await db.getNextBroadcastDeferredRetryMs(bc.id);
        if (nextRetryMs && nextRetryMs > Date.now()) {
          const retrySec = Math.max(1, Math.ceil((nextRetryMs - Date.now()) / 1000));
          await setBroadcastCooldown(bc.id, retrySec, 'deferred_wait');
          const out = {
            status: 'skip',
            reason: 'deferred_wait',
            broadcast_id: bc.id,
            retry_after_sec: retrySec,
            retry_at: new Date(nextRetryMs).toISOString(),
          };
          await writeCronLastRun('broadcast_tick', { ts: new Date().toISOString(), ...out });
          return out;
        }
      } catch {
        // ignore and continue to DONE
      }

      // Atomic: No more recipients → DONE (prevents double-finish on lock expiry)
      // In fan-out mode, compute final counters from broadcast_sent_log to keep admin UI accurate.
      let finalSent = Number(bc.sent_count || 0);
      let finalFailed = Number(bc.failed_count || 0);
      let finalUnknown = 0;
      try {
        await db.quarantineStaleBroadcastDeliveries(bc.id, 60);
        const st = await db.countBroadcastDeliveryStats(bc.id);
        finalSent = Number(st.sent || 0);
        finalUnknown = Number(st.delivery_unknown || 0);
        finalFailed = Number(st.failed || 0) + Number(st.blocked || 0) + finalUnknown;
      } catch {
        // keep best-effort snapshot; do not invent unknown count
      }

      const done = await db.atomicTransitionBroadcast(bc.id, 'RUNNING', 'DONE', {
        finished_at: new Date().toISOString(),
        sent_count: finalSent,
        failed_count: finalFailed,
      });

      if (!done) {
        const out = { status: 'skip', reason: 'already_done', broadcast_id: bc.id };
        await writeCronLastRun('broadcast_tick', { ts: new Date().toISOString(), ...out });
        return out;
      }

      // Notify admin
      try {
        const bot = getBot();
        const creator = await db.getUserById(bc.created_by_user_id);
        if (creator?.tg_id) {
          const kb = new InlineKeyboard()
            .text('📣 Рассылки', 'a:bc_list|p:0')
            .text(`🔎 #${bc.id}`, `a:bc_view|id:${bc.id}`)
            .row()
            .text('➕ Новая рассылка', 'a:bc_start')
            .text('⬅️ Админка', 'a:admin_home')
            .row()
            .text('📋 Меню', 'a:menu')
            .text('🏠 Домой', 'a:home');

          const sentShown = finalSent;
          const failedShown = finalFailed;
          const unknownLine = finalUnknown > 0
            ? `
⚠️ Требуют сверки: ${finalUnknown} (повторная отправка отключена)`
            : '';
          await bot.api.sendMessage(
            Number(creator.tg_id),
            `✅ <b>Рассылка #${bc.id} завершена</b>

📊 Отправлено: ${sentShown} / ${bc.total_count}
❌ Ошибок: ${failedShown}${unknownLine}`,
            { parse_mode: 'HTML', reply_markup: kb }
          );
        }
      } catch {
        // ignore notification failure
      }

      const out = {
        status: 'done',
        broadcast_id: bc.id,
        sent: fanoutEnabled ? finalSent : bc.sent_count,
        failed: fanoutEnabled ? finalFailed : bc.failed_count,
        ...(fanoutEnabled ? { mode: 'qstash_fanout' } : {}),
      };
      await writeCronLastRun('broadcast_tick', { ts: new Date().toISOString(), ...out });
      return out;
    }

    // QStash fan-out: enqueue delivery jobs and exit early (serverless-safe).
    if (fanoutEnabled) {
      const deliveryUrl = getQStashDeliveryUrl('/api/qstash/broadcast-deliver');
      if (!deliveryUrl) {
        const out = { status: 'error', reason: 'public_base_url_missing', broadcast_id: bc.id };
        await writeCronLastRun('broadcast_tick', { ts: new Date().toISOString(), ...out });
        return out;
      }

      const startedAt = Date.now();
      const reserveMs = Math.min(
        BROADCAST_TIME_BUDGET_RESERVE_MS,
        Math.max(1000, BROADCAST_TIME_BUDGET_MS - 1000)
      );
      const deadlineAt = startedAt + BROADCAST_TIME_BUDGET_MS;
      let timeBudgetHit = false;
      let queued = 0;
      let hardSkipped = 0;
      const hardSkipMap = await getBroadcastHardSkipMap(recipients.map((r) => Number(r.tg_id)));

      let lastId = lastUserId;
      let enqueueError = '';

      for (const recipient of recipients) {
        if (Date.now() >= deadlineAt - reserveMs) {
          timeBudgetHit = true;
          break;
        }

        const uid = Number(recipient.user_id);
        const tgId = Number(recipient.tg_id);

        const hs = hardSkipMap.get(tgId);
        if (hs) {
          try {
            await db.logBroadcastBlocked(bc.id, uid, `hard_skip:${hs}`);
            await resetBroadcastQuarantineCount(bc.id, uid);
            hardSkipped++;
            try {
              const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
              await incrDayCounter(bcHardSkipHitDayKey(day));
            } catch {}
            try { await logBroadcastHardSkipHit(tgId, hs, { broadcastId: bc.id, userId: uid, via: 'cron_fanout' }); } catch {}
            lastId = Math.max(lastId, uid);
            continue;
          } catch (e) {
            const em = String(e?.message || e).slice(0, 200);
            logger.error({ broadcast_ref: opaqueLogRef(bc.id, 'broadcast'), user_ref: opaqueLogRef(uid, 'user'), err: safeLogError(e) }, 'broadcast.hard_skip_log_failed');
            enqueueError = em || 'hard_skip_log_failed';
            break;
          }
        }

        try {
          const dedupId = `b:${bc.id}:u:${uid}`;
          await qstashPublishJSON({
            url: deliveryUrl,
            body: {
              broadcastId: Number(bc.id),
              userId: uid,
              tgId,
              attempt: 0,
              bc: {
                id: Number(bc.id),
                draft_type: bc.draft_type,
                draft_text: bc.draft_text,
                draft_file_id: bc.draft_file_id,
                draft_caption: bc.draft_caption,
                buttons_json: bc.buttons_json,
              },
            },
            deduplicationId: dedupId,
            retries: Number(CFG.QSTASH_BROADCAST_RETRIES || 10),
            flowControl: getBroadcastFlowControl(bc.id),
            timeout: '20s',
          });

          await db.logBroadcastQueued(bc.id, uid);
          queued++;
          lastId = Math.max(lastId, uid);
        } catch (e) {
          const em = String(e?.message || e).slice(0, 200);
          logger.error({ broadcast_ref: opaqueLogRef(bc.id, 'broadcast'), user_ref: opaqueLogRef(uid, 'user'), err: safeLogError(e) }, 'broadcast.qstash_enqueue_failed');
          enqueueError = em || 'enqueue_failed';
          // Stop early: do not advance cursor past a failed enqueue.
          break;
        }
      }

      const hasProgress = queued > 0 || lastId !== lastUserId;
      if (hasProgress) {
        await db.updateBroadcast(bc.id, {
          last_sent_user_id: lastId,
        });
      }

      const duration_ms = Date.now() - startedAt;
      const out = {
        status: 'running',
        mode: 'qstash_fanout',
        broadcast_id: bc.id,
        batch_queued: queued,
        ...(hardSkipped ? { batch_hard_skipped: hardSkipped } : {}),
        ...(enqueueError ? { enqueue_error: enqueueError } : {}),
        ...(timeBudgetHit
          ? {
              exit_reason: 'time_budget',
              time_budget_ms: BROADCAST_TIME_BUDGET_MS,
              time_budget_reserve_ms: reserveMs,
            }
          : {}),
        duration_ms,
      };
      await writeCronLastRun('broadcast_tick', { ts: new Date().toISOString(), ...out });
      return out;
    }

    const bot = getBot();
    const startedAt = Date.now();
    const reserveMs = Math.min(
      BROADCAST_TIME_BUDGET_RESERVE_MS,
      Math.max(1000, BROADCAST_TIME_BUDGET_MS - 1000)
    );
    const deadlineAt = startedAt + BROADCAST_TIME_BUDGET_MS;
    let timeBudgetHit = false;
    let sent = 0;
    let failed = 0;
    let deferred = 0;
    let unknown = 0;
    let lastId = lastUserId;
    let cooldownSetSec = 0;

    let hardSkipped = 0;
    const hardSkipMap2 = await getBroadcastHardSkipMap(recipients.map((r) => Number(r.tg_id)));

    for (const recipient of recipients) {
      if (Date.now() >= deadlineAt - reserveMs) {
        timeBudgetHit = true;
        break;
      }

      const uid = Number(recipient.user_id);
      const tgId = Number(recipient.tg_id);

      const hs = hardSkipMap2.get(tgId);
      if (hs) {
        await db.logBroadcastBlocked(bc.id, uid, `hard_skip:${hs}`);
        await resetBroadcastQuarantineCount(bc.id, uid);
        failed++;
        hardSkipped++;
        try {
          const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          await incrDayCounter(bcHardSkipHitDayKey(day));
        } catch {}
        try { await logBroadcastHardSkipHit(tgId, hs, { broadcastId: bc.id, userId: uid, via: 'cron' }); } catch {}
        lastId = Math.max(lastId, uid);
        continue;
      }

      const claim = await db.claimBroadcastDelivery(bc.id, uid, 60);
      if (!claim) {
        // Existing terminal or in-flight row: never send it again automatically.
        lastId = Math.max(lastId, uid);
        continue;
      }
      const deliveryAttemptId = String(claim.delivery_attempt_id || '').trim();
      if (!deliveryAttemptId) throw new Error('broadcast_delivery_migration_required');

      let advanced = false;
      try {
        const sendResult = await sendBroadcastMessage(bot.api, tgId, bc);
        const messageIds = extractTelegramMessageIds(sendResult);
        const receipt = await persistBroadcastSentOrUnknown({
          db,
          broadcastId: bc.id,
          userId: uid,
          attemptId: deliveryAttemptId,
          messageIds,
          sleepFn: sleep,
        });

        if (receipt.state === 'sent') {
          sent++;
        } else {
          unknown++;
          try {
            await queueOpsAlert(bot.api, {
              group: 'ops',
              reason: 'broadcast_delivery_unknown',
              title: 'Broadcast delivery needs reconciliation',
              userId: uid,
              kind: 'broadcast',
              payload: `broadcast=${bc.id}`,
              extra: ['outcome=send_succeeded_receipt_missing'],
              dedupId: `broadcast_delivery_unknown:${bc.id}:${uid}`,
            });
          } catch {}
        }
        await resetBroadcastQuarantineCount(bc.id, uid);
        advanced = true;
      } catch (err) {
        const outcome = classifyBroadcastSendError(err);
        const code = Number(outcome.code || 0) || 0;
        const desc = String(outcome.description || '');

        if (outcome.kind === 'blocked') {
          const hsReason = normalizeBroadcastDeadChatReason(code, desc);
          if (hsReason) await setBroadcastHardSkip(tgId, hsReason);
          const receipt = await persistBroadcastRejectedOrUnknown({
            db,
            broadcastId: bc.id,
            userId: uid,
            attemptId: deliveryAttemptId,
            kind: 'blocked',
            errorText: desc || outcome.reason,
            error: err,
          });
          if (receipt.state === 'blocked') failed++;
          else unknown++;
          await resetBroadcastQuarantineCount(bc.id, uid);
          advanced = true;
        } else if (outcome.kind === 'failed') {
          const receipt = await persistBroadcastRejectedOrUnknown({
            db,
            broadcastId: bc.id,
            userId: uid,
            attemptId: deliveryAttemptId,
            kind: 'failed',
            errorText: desc || outcome.reason,
            error: err,
          });
          if (receipt.state === 'failed') failed++;
          else unknown++;
          advanced = true;
        } else if (outcome.kind === 'retryable') {
          const retryAfter = extractRetryAfterSec(err);
          cooldownSetSec = retryAfter;
          let qCount = 0;
          let deferredRow = null;
          try {
            deferredRow = await db.markBroadcastDeliveryDeferred(
              bc.id,
              uid,
              retryAfter,
              deliveryAttemptId,
              'telegram_429'
            );
            if (deferredRow) {
              deferred++;
              advanced = true;
              qCount = await bumpBroadcastQuarantineCount(bc.id, uid);
            }
          } catch {}

          if (!deferredRow) {
            await persistBroadcastUnknown({
              db,
              broadcastId: bc.id,
              userId: uid,
              attemptId: deliveryAttemptId,
              reason: buildBroadcastUnknownReason('telegram_429_db_receipt_failed', err),
            });
            unknown++;
            advanced = true;
          }

          const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          await incrDayCounter(bcDeferSetDayKey(day));
          if (deferredRow && qCount >= BROADCAST_QUARANTINE_THRESHOLD) {
            try {
              await resetBroadcastQuarantineCount(bc.id, uid);
              await db.logBroadcastQuarantine(bc.id, uid, BROADCAST_QUARANTINE_SEC);
              await incrDayCounter(bcQuarantineSetDayKey(day));
            } catch {}
          }
          await setBroadcastCooldown(bc.id, retryAfter, 'telegram_429');
          break;
        } else {
          const reason = buildBroadcastUnknownReason(outcome.reason, err);
          await persistBroadcastUnknown({
            db,
            broadcastId: bc.id,
            userId: uid,
            attemptId: deliveryAttemptId,
            reason,
            messageIds: outcome.messageIds || [],
          });
          unknown++;
          advanced = true;
          try {
            await queueOpsAlert(bot.api, {
              group: 'ops',
              reason: 'broadcast_delivery_unknown',
              title: 'Broadcast delivery needs reconciliation',
              userId: uid,
              kind: 'broadcast',
              payload: `broadcast=${bc.id}`,
              extra: [`outcome=${String(outcome.reason || 'unknown')}`],
              dedupId: `broadcast_delivery_unknown:${bc.id}:${uid}`,
            });
          } catch {}
        }
      }

      if (advanced) lastId = Math.max(lastId, uid);
      if (BROADCAST_SEND_DELAY_MS > 0) await sleep(BROADCAST_SEND_DELAY_MS);
    }

    // Update counters only when there is progress.
    // Important: on 429 we intentionally do NOT advance the cursor and can have sent=0/failed=0.
    // Cooldown is Redis-only, so avoid burning Neon CU with a no-op UPDATE.
    const hasProgress = sent > 0 || failed > 0 || unknown > 0 || lastId !== lastUserId;
    if (hasProgress) {
      await db.updateBroadcast(bc.id, {
        sent_count: Number(bc.sent_count || 0) + sent,
        failed_count: Number(bc.failed_count || 0) + failed,
        last_sent_user_id: lastId,
      });
    }

    const duration_ms = Date.now() - startedAt;
    const out = {
      status: 'running',
      broadcast_id: bc.id,
      batch_sent: sent,
      batch_failed: failed,
      ...(unknown ? { batch_delivery_unknown: unknown } : {}),
      ...(deferred ? { batch_deferred: deferred } : {}),
      ...(hardSkipped ? { batch_hard_skipped: hardSkipped } : {}),
      total_sent: Number(bc.sent_count || 0) + sent,
      total_count: bc.total_count,
      ...(cooldownSetSec ? { cooldown_sec: cooldownSetSec } : {}),
      ...(timeBudgetHit
        ? {
            exit_reason: 'time_budget',
            time_budget_ms: BROADCAST_TIME_BUDGET_MS,
            time_budget_reserve_ms: reserveMs,
          }
        : {}),
      duration_ms,
    };
    await writeCronLastRun('broadcast_tick', { ts: new Date().toISOString(), ...out });
    return out;
    });
  } catch (e) {
    // One authoritative job-level alert. The router sees the marker and does not emit a duplicate.
    try { await recordCronTickFailure('broadcast_tick', 'broadcast-tick', e); } catch {}
    throw e;
  }
}
// END MOVED CRON BODY: broadcast
