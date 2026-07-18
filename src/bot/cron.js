import * as R from '../lib/redis.js'; 

// Build-compat: avoid hard ESM named-import crashes if a partial cherry-pick updates
// call-sites but not `src/lib/redis.js`. Fallbacks are atomic-only / no-op.
const redis = R.redis;
const k = R.k;
const acquireLock = R.acquireLock;
const releaseLock = R.releaseLock;
const incrWithExpire = typeof R.incrWithExpire === 'function' ? R.incrWithExpire : async () => 0;
const incrWithExpireOnFirst =
  typeof R.incrWithExpireOnFirst === 'function' ? R.incrWithExpireOnFirst : async () => 0;
const lpushTrim = typeof R.lpushTrim === 'function' ? R.lpushTrim : async () => false;

import * as db from '../db/queries.js';
import { getBot, _validateStarsPaymentStrict } from './bot.js';
import { InlineKeyboard } from 'grammy';
import { CFG } from '../lib/config.js';
import { isPaymentsFallbackApplyEnabled } from '../lib/paymentsOps.js';
import {
  qstashPublishJSON,
  getQStashDeliveryUrl,
  getBroadcastFlowControl,
  getQStashConfigSnapshot,
  isQStashLibAvailable,
} from '../lib/qstash.js';
import { applyPaymentFallbackNoSession } from './payments_fallback.js';
import { buildRecoveredPaymentMessage } from './monetizationCopy.js';
import { tgTimeoutSignal, TG_HTTP_MEDIA_TIMEOUT_MS } from '../lib/tgApi.js';
import { flushOpsAlerts, queueOpsAlert } from './opsAlerts.js';
import { buildBroadcastDeliveryPlan } from '../lib/broadcast.js';
import { reportCronJobFailure } from '../lib/cronFailure.js';
import {
  notifyGiveawayEnded,
  notifyGiveawayWinnersReady,
  notifyGiveawayWinnersDM,
} from './gwNotify.js';

// =====================================================
// Cron Control Plane (Vercel + Neon + Upstash)
//
// Goals:
// - serverless-safe (short-lived connections)
// - no concurrent ticks (Redis lock)
// - deterministic & atomic winners draw (single DB tx + advisory xact lock)
// - best-effort notifications (Telegram failures must not break cron)
// =====================================================

// Production-safe fixed cron parameters.
const CRON_LOCK_TTL_SEC = 55;
const CRON_END_BATCH = 50;
const CRON_DRAW_BATCH = 50;
const CRON_OFFICIAL_EXPIRE_BATCH = 50;
const CRON_RETRY_BATCH = 50;
const CRON_RETRY_EXPIRE_BATCH = 200;

// Per-giveaway lock to reduce races even if ticks overlap.
const GIVEAWAY_LOCK_TTL_SEC = 120;

// Best-effort cron observability (stored in Redis; no DB).
// TTL keeps storage bounded.
const CRON_LAST_RUN_TTL_SEC = 14 * 24 * 60 * 60; // 14 days

const NOTIFY_TIMEOUT_MS = 5000; // best-effort Telegram notifications in cron

// Broadcast: global 429 cooldown keys (Redis fast path).
// Goal: when cooldown is active, exit BEFORE any DB polling.
// If Redis is unavailable, we fall back to a DB fuse stored on the broadcast row.
const BC_COOLDOWN_TTL_SEC = 24 * 60 * 60; // keep state for ops visibility (bounded)
const BC_PENDING_SNAPSHOT_TTL_SEC = 30 * 60; // 30 min snapshot for /api/health (Redis-only)
const BC_COOLDOWN_UNTIL_KEY = k(['broadcast', 'cooldown_until']);
const BC_COOLDOWN_BROADCAST_ID_KEY = k(['broadcast', 'cooldown_broadcast_id']);
const BC_COOLDOWN_LAST_429_AT_KEY = k(['broadcast', 'last_429_at']);
const BC_COOLDOWN_LAST_429_REASON_KEY = k(['broadcast', 'last_429_reason']);

// Broadcast QStash fan-out runtime flag (Redis).
// Default OFF. When ON, cron only enqueues delivery jobs; actual sends happen via QStash worker endpoint.
const SYS_BC_QSTASH_FANOUT_KEY = k(['sys', 'broadcast_qstash_fanout']);


// Ops: broadcast tick deferred due to Redis degraded (Redis-only; best-effort).
// Purpose: avoid running mass broadcast logic when Redis is unavailable (locks/cooldowns/fanout flags become unknown).
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


// Broadcast hard-skip list (Redis-only, per tg_id).
// Purpose: permanently dead chats (blocked/chat not found/deactivated) shouldn't waste QStash/Telegram work.
// Stored as JSON: { r: "<reason>", at: "<iso>" } with bounded TTL.
function clampHardSkipTtlSec() {
  const days = Number(process.env.BROADCAST_HARD_SKIP_TTL_DAYS || 90) || 90;
  const d = Math.max(7, Math.min(365, days));
  return d * 24 * 60 * 60;
}

function broadcastHardSkipKey(tgId) {
  return k(['broadcast', 'hard_skip', 'tg', String(tgId)]);
}

// Keep a small "recent" index for admin visibility (no SCAN/KEYS).
// Each entry is a JSON string: { tgId, r, at }.
const BROADCAST_HARD_SKIP_RECENT_KEY = k(['broadcast', 'hard_skip', 'recent']);
const BROADCAST_HARD_SKIP_RECENT_MAX = 1000;

// Recent HITs: when a recipient is skipped due to an existing hard-skip entry.
// This is the operator-facing “who/why was skipped” log (no DB, no SCAN).
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

async function writeCronLastRun(name, payload) {
  try {
    const key = k(['cron', String(name || 'tick'), 'last_run']);
    await redis.set(key, payload, { ex: CRON_LAST_RUN_TTL_SEC });
  } catch {
    // ignore metrics failures
  }
}

async function recordCronTickFailure(redisName, routeJob, error) {
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

async function withLock(lockKey, ttlSec, fn) {
  const lock = await acquireLock(lockKey, ttlSec);
  if (!lock) return { locked: true };
  try {
    const r = await fn();
    return { locked: false, result: r };
  } finally {
    await releaseLock(lockKey, lock.token);
  }
}

async function withGiveawayLock(giveawayId, fn) {
  const key = k(['lock', 'gw', String(giveawayId)]);
  const lock = await acquireLock(key, GIVEAWAY_LOCK_TTL_SEC);
  if (!lock) return { locked: true };
  try {
    const r = await fn();
    return { locked: false, result: r };
  } finally {
    await releaseLock(key, lock.token);
  }
}

async function withTimeout(promise, ms, label) {
  const p = Promise.resolve(promise)
    .then((v) => ({ v }))
    .catch((e) => ({ e }));

  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve({ __timeout: true }), ms);
  });

  const out = await Promise.race([p, timeout]);
  clearTimeout(timeoutId);

  if (out && out.__timeout) {
    const err = new Error(`timeout after ${ms}ms: ${label || 'op'}`);
    err.code = 'ETIMEDOUT';
    throw err;
  }
  if (out && out.e) throw out.e;
  return out ? out.v : undefined;
}

async function endDueGiveaways(now = new Date()) {
  const due = await db.listGiveawaysToEnd(CRON_END_BATCH);
  const ended = [];

  for (const g of due) {
    // Atomic: only transition if still in endable status (prevents double-end on lock expiry)
    const changed = await db.atomicEndGiveaway(g.id);
    if (!changed) continue;

    await db.auditGiveaway(g.id, g.workspace_id, null, 'gw.ended', {
      manual: false,
      now: now.toISOString(),
    });

    // Optional: notify owner/channel.
    try {
      const api = getBot().api;
      await withTimeout(
        notifyGiveawayEnded({ api, db, g, reason: 'time' }),
        NOTIFY_TIMEOUT_MS,
        'notifyGiveawayEnded'
      );
    } catch {
      // ignore
    }

    ended.push(g.id);
  }

  return ended;
}

async function autoDrawEnded() {
  const list = await db.listEndedGiveawaysToDraw(CRON_DRAW_BATCH);
  const bot = getBot();
  const drawn = [];

  for (const g of list) {
    if (!g.auto_draw) continue;
    if (!g.ends_at) continue;

    // Extra safety (even though we have a global tick lock).
    await withGiveawayLock(g.id, async () => {
      const endsAtIso = new Date(g.ends_at).toISOString();
      const requested = Number(g.winners_count || 1);

      // Atomic: lock + pick + persist + status update + audit, all in one tx.
      const r = await db.drawAndFinalizeGiveawayWinnersAtomic(
        g.id,
        g.workspace_id,
        requested,
        endsAtIso
      );

      if (!r) return;
      if (r.status === 'locked') {
        // Another worker/tx is already drawing this giveaway. This is an expected fail-fast path, not a silent success.
        return;
      }
      if (r.status !== 'drawn') {
        // wrong_status / already_drawn / no_entries
        return;
      }

      drawn.push(g.id);

      // Notify owner that winners are ready.
      try {
        await withTimeout(
          notifyGiveawayWinnersReady({
            api: bot.api,
            db,
            g,
            reason: 'auto_draw',
          }),
          NOTIFY_TIMEOUT_MS,
          'notifyGiveawayWinnersReady'
        );
      } catch {
        // ignore
      }

      // DM winners directly.
      try {
        await withTimeout(
          notifyGiveawayWinnersDM({
            api: bot.api,
            db,
            gwId: g.id,
            reason: 'auto_draw',
          }),
          NOTIFY_TIMEOUT_MS,
          'notifyGiveawayWinnersDM'
        );
      } catch {
        // ignore
      }
    });
  }

  return drawn;
}

async function autoPublishDrawn() {
  const list = await db.listDrawnGiveawaysToPublish(20);
  const bot = getBot();
  const published = [];

  for (const g of list) {
    if (!g.published_chat_id) continue;

    // Per-giveaway Redis lock: prevents double-post if global lock expires
    await withGiveawayLock(g.id, async () => {
      const chatId = Number(g.published_chat_id);
      const bcKey = k(['gw', 'results', 'sent', g.id]);
      const isClaimed = Number(g.results_message_id || 0) === 0;

      try {
        const winners = await db.getWinnersWithTgId(g.id);
        if (!winners.length) return;

        const winnerLines = winners
          .map((w) => {
            const name = w.username ? `@${w.username}` : `tg:${w.tg_id}`;
            return `${w.place}. ${name}`;
          })
          .join('\n');

        const body = `🏁 <b>Итоги конкурса</b>\n\n🏆 Победители:\n${winnerLines}`;

        // Recovery path: we already claimed (results_message_id=0) and should never send a new message again.
        if (isClaimed) {
          let bc = null;
          try { bc = await redis.get(bcKey); } catch {}
          const bcMsgId = bc && bc.message_id ? Number(bc.message_id) : null;

          if (bcMsgId) {
            const ok = await db.atomicFinalizeGiveawayResultsPublish(g.id, bcMsgId);
            if (!ok) return;
            try {
              await db.auditGiveaway(g.id, g.workspace_id, null, 'gw.results_auto_published', {
                message_id: bcMsgId,
                recovered: true,
              });
            } catch {}
            published.push(g.id);
            return;
          }

          // Best-effort: try to edit the original announcement (idempotent). Do NOT send a new message here.
          const origMsgId = g.published_message_id ? Number(g.published_message_id) : null;
          if (!origMsgId) return;

          try {
            await bot.api.editMessageText(chatId, origMsgId, body, { parse_mode: 'HTML' });
          } catch {
            return;
          }

          try {
            const ttlSec = 7 * 24 * 60 * 60;
            await redis.set(bcKey, { chat_id: chatId, message_id: origMsgId }, { ex: ttlSec });
          } catch {}

          const ok = await db.atomicFinalizeGiveawayResultsPublish(g.id, origMsgId);
          if (!ok) return;

          try {
            await db.auditGiveaway(g.id, g.workspace_id, null, 'gw.results_auto_published', {
              message_id: origMsgId,
              recovered: true,
              method: 'edit',
            });
          } catch {}
          published.push(g.id);
          return;
        }

        // Normal path: reserve-before-send (claim), then edit-or-send, then finalize.
        const claimed = await db.atomicClaimGiveawayResultsPublishing(g.id);
        if (!claimed) return;

        let publishedId = null;

        // Prefer editing the original announcement message (idempotent), fallback to sending a new one.
        const origMsgId = g.published_message_id ? Number(g.published_message_id) : null;

        if (origMsgId) {
          try {
            await bot.api.editMessageText(chatId, Number(origMsgId), body, {
              parse_mode: 'HTML',
            });
            publishedId = Number(origMsgId);
          } catch {
            // ignore edit errors
          }
        }

        if (!publishedId) {
          const replyParams = origMsgId
            ? {
                reply_parameters: {
                  message_id: Number(origMsgId),
                  allow_sending_without_reply: true,
                },
              }
            : {};

          try {
            const sent = await bot.api.sendMessage(chatId, body, {
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              ...replyParams,
            });
            publishedId = sent.message_id;
          } catch {
            // send failed: release claim to allow retry
            try { await db.atomicReleaseGiveawayResultsClaim(g.id); } catch {}
            return;
          }
        }

        // Breadcrumb BEFORE DB finalize: prevents duplicate sends on DB failures.
        try {
          const ttlSec = 7 * 24 * 60 * 60;
          await redis.set(bcKey, { chat_id: chatId, message_id: Number(publishedId) }, { ex: ttlSec });
        } catch {}

        // Finalize from claimed state (results_message_id=0)
        const ok = await db.atomicFinalizeGiveawayResultsPublish(g.id, publishedId);
        if (!ok) return;

        try {
          await db.auditGiveaway(g.id, g.workspace_id, null, 'gw.results_auto_published', {
            message_id: publishedId,
          });
        } catch {}
        published.push(g.id);
      } catch {
        // skip individual failures
      }
    });
  }

  return published;
}

async function expireOfficialPosts() {
  if (!CFG.OFFICIAL_PUBLISH_ENABLED) return { expired: 0 };
  const bot = getBot();
  const rows = await db.listOfficialToExpire(CRON_OFFICIAL_EXPIRE_BATCH);
  let expired = 0;

  for (const p of rows) {
    try {
      if (p.channel_chat_id && p.message_id) {
        await bot.api.editMessageText(
          Number(p.channel_chat_id),
          Number(p.message_id),
          '⌛️ <b>Размещение истекло</b>\n\nЭтот пост больше не находится в активном слоте.',
          { parse_mode: 'HTML' }
        );
      }
    } catch {
      // ignore edits
    }

    try {
      // Atomic: expire only if still ACTIVE (prevents double-expire on overlapping ticks)
      const ok = await db.atomicExpireOfficialPost(p.offer_id);
      if (ok) expired += 1;
    } catch {
      // ignore db
    }
  }

  return { expired };
}

async function issueIntroRetryCredits() {
  if (!CFG.INTRO_RETRY_ENABLED) return { checked: 0, issued: 0, expired: 0 };

  const bot = getBot();

  let expired = 0;
  try {
    expired = await db.expireRetryCredits(CRON_RETRY_EXPIRE_BATCH);
  } catch (e) {
    // missing table during rolling upgrades
    if (!(e && (e.code === '42P01' || String(e.message || '').includes('brand_retry_credits')))) throw e;
  }

  let rows = [];
  try {
    rows = await db.listIntroThreadsForRetry(
      CRON_RETRY_BATCH,
      CFG.INTRO_RETRY_AFTER_HOURS
    );
  } catch (e) {
    // missing columns during rolling upgrades
    if (e && (e.code === '42703' || e.code === '42P01'))
      return { checked: 0, issued: 0, expired };
    throw e;
  }

  let issued = 0;

  for (const it of rows) {
    const threadId = Number(it.thread_id);
    const buyerUserId = Number(it.buyer_user_id);

    try {
      const r = await db.issueRetryCreditForThread(
        threadId,
        buyerUserId,
        CFG.INTRO_RETRY_EXPIRES_DAYS,
        'no_reply'
      );
      if (!r.issued) continue;

      issued += 1;
      db.trackEvent('retry_credit_issued', {
        userId: buyerUserId,
        wsId: null,
        meta: { threadId, offerId: Number(it.offer_id || 0) },
      });

      if (CFG.INTRO_RETRY_NOTIFY) {
        const u = await db.getUserTgIdByUserId(buyerUserId);
        const tgId = u?.tg_id;
        if (tgId) {
          const kb = new InlineKeyboard().text('💳 Кредиты', 'a:brand_pass|ws:0');
          await withTimeout(
            bot.api.sendMessage(
              Number(tgId),
              `🎟 <b>Повторный кредит начислен</b>

По одному из новых диалогов не было ответа ${Number(
                CFG.INTRO_RETRY_AFTER_HOURS || 24
              )}ч — мы вернули 1 повторный кредит.
Действует ${Number(
                CFG.INTRO_RETRY_EXPIRES_DAYS || 7
              )} дней и списывается автоматически при следующем новом диалоге.`,
              { parse_mode: 'HTML', reply_markup: kb }
            ),
            NOTIFY_TIMEOUT_MS,
            'retryCreditNotify'
          );
        }
      }
    } catch {
      // ignore one-off failures
    }
  }

  return { checked: rows.length, issued, expired };
}


async function autoHealOrphanedPayments() {
  // Goal: eliminate manual tail for ORPHANED missing_session (late Stars payments).
  // Safe: only applies fallbacks based on invoice_payload; skips offpub_* and any non-supported payload.

  const fbOn = await isPaymentsFallbackApplyEnabled();
  if (!CFG.PAYMENTS_ORPHANED_AUTOHEAL_ENABLED || !fbOn) {
    return { enabled: false, checked: 0, applied: 0, failed: 0, skipped: 0 };
  }

  const batch = Math.max(0, Number(CFG.PAYMENTS_ORPHANED_AUTOHEAL_BATCH || 20) || 0);
  if (batch <= 0) return { enabled: true, checked: 0, applied: 0, failed: 0, skipped: 0 };

  let applied = 0;
  let failed = 0;
  let skipped = 0;
  const failedIds = [];
  const failedReasons = [];
  let notifySkipped = 0;
  const notifySkippedIds = [];

  // Manual review markers (to avoid silent retry loops and surface to ops).
  let validationFailed = 0;
  const validationFailedIds = [];
  const validationFailedReasons = [];
  let manualRequired = 0;
  const manualRequiredIds = [];
  const manualRequiredReasons = [];


  // Claim a batch in DB (SKIP LOCKED) to avoid duplicate work when cron overlaps / retries.
  // Safety: ignore very fresh payments to avoid races with late webhook/session reconciliation.
  const minAgeSec = Math.max(0, Number(CFG.PAYMENTS_ORPHANED_AUTOHEAL_MIN_AGE_SEC || 0) || 0);
  const cand = await db.claimOrphanedMissingSessionPaymentsForAutoheal(batch, minAgeSec);

  // We no longer compute a separate "young" count here (would require an extra DB query).
  const skippedYoung = 0;

  const api = getBot().api;

  for (const r of cand) {
    try {
      // Hardening: validate payload/amount/currency against current catalog before fallback apply.
      // If it doesn't validate, auto-heal must stop retrying (manual review required).
      const v = await _validateStarsPaymentStrict({
        payload: String(r.invoice_payload || ''),
        currency: String(r.currency || 'XTR'),
        totalAmount: Number(r.total_amount || 0),
        payerUserId: Number(r.user_id || 0) || null,
      });
      if (!v || !v.ok) {
        const rr = String(v?.reason || 'validation_failed');
        validationFailed += 1;
        if (validationFailedIds.length < 5) validationFailedIds.push(Number(r.id));
        if (validationFailedReasons.length < 3) validationFailedReasons.push(rr);
        try {
          await db.setPaymentStatus(Number(r.id), 'ORPHANED', `autoheal_manual_required:${rr}`);
        } catch {}
        skipped += 1;
        continue;
      }

      const fb = await applyPaymentFallbackNoSession({
        paymentId: Number(r.id),
        paymentUserId: Number(r.user_id),
        invoicePayload: String(r.invoice_payload || ''),
        appliedByUserId: Number(r.user_id),
        totalAmount: Number(r.total_amount || 0),
        currency: String(r.currency || 'XTR'),
        telegramPaymentChargeId: String(r.telegram_payment_charge_id || ''),
      });

      if (fb && fb.applied) {
        applied += 1;
        // Best-effort notify user (avoid silent surprise).
        try {
          const tgId = Number(r.tg_id || 0);
          if (!tgId) {
            notifySkipped += 1;
            if (notifySkippedIds.length < 5) notifySkippedIds.push(Number(r.id));
          } else {
            const msg = buildRecoveredPaymentMessage({
              result: fb,
              amount: Number(r.total_amount || 0),
            });
            await api.sendMessage(tgId, msg);
          }
        } catch {
          notifySkipped += 1;
          if (notifySkippedIds.length < 5) notifySkippedIds.push(Number(r.id));
        }
      } else {
        skipped += 1;
        // Avoid retry loop for permanent non-applied cases.
        const rr = String(fb?.reason || '');
        if (rr === 'unsupported_payload' || rr === 'missing_userid_or_wsid' || rr === 'bad_input' || rr === 'user_mismatch') {
          manualRequired += 1;
          if (manualRequiredIds.length < 5) manualRequiredIds.push(Number(r.id));
          if (manualRequiredReasons.length < 3) manualRequiredReasons.push(rr);
          try {
            await db.setPaymentStatus(Number(r.id), 'ORPHANED', `autoheal_manual_required:${rr}`);
          } catch {}
        }
      }
    } catch (e) {
      failed += 1;
      try {
        if (failedIds.length < 5) failedIds.push(Number(r.id));
        if (failedReasons.length < 3) failedReasons.push(String(e?.message || e).slice(0, 120));
      } catch {}
    }
  }

  // Ops alert if auto-heal couldn't notify users (missing tg_id or send errors).
  // Treated as a failure so it passes OPS_ALERT_SILENT filters.
  if (notifySkipped > 0) {
    try {
      const api = getBot().api;
      await queueOpsAlert(api, {
        group: 'ops',
        reason: 'autoheal_notify_failed',
        title: 'Auto-heal ORPHANED: notify skipped',
        paymentId: notifySkippedIds.length ? notifySkippedIds[0] : null,
        kind: 'cron',
        payload: '',
        extra: [
          `Applied: ${applied}`,
          `Notify skipped: ${notifySkipped}`,
          `Ids: ${notifySkippedIds.join(',') || '-'}`,
        ].filter(Boolean),
      });
    } catch {}
  }

  // Ops alert if auto-heal had failures (best-effort).
  if (failed > 0) {
    try {
      const api = getBot().api;
      await queueOpsAlert(api, {
        group: 'ops',
        reason: 'autoheal_failed',
        title: 'Auto-heal ORPHANED missing_session: failures',
        paymentId: failedIds.length ? failedIds[0] : null,
        kind: 'cron',
        payload: '',
        extra: [
          `Checked: ${cand.length}`,
          `Applied: ${applied}`,
          `Failed: ${failed}`,
          `Ids: ${failedIds.join(',') || '-'}`,
          failedReasons.length ? `Reason: ${failedReasons[0]}` : '',
        ].filter(Boolean),
      });
    } catch {}
  }



  // Ops alert when strict validation fails (manual review required).
  // Reason includes "failed" so it passes OPS_ALERT_SILENT filters.
  if (validationFailed > 0) {
    try {
      const api = getBot().api;
      await queueOpsAlert(api, {
        group: 'ops',
        reason: 'autoheal_validation_failed',
        title: 'Auto-heal ORPHANED: strict validation failed',
        paymentId: validationFailedIds.length ? validationFailedIds[0] : null,
        kind: 'cron',
        payload: '',
        extra: [
          `Checked: ${cand.length}`,
          `Applied: ${applied}`,
          `Validation failed: ${validationFailed}`,
          `Ids: ${validationFailedIds.join(',') || '-'}`,
          validationFailedReasons.length ? `Reason: ${validationFailedReasons[0]}` : '',
        ].filter(Boolean),
      });
    } catch {}
  }

  // Ops alert for permanent non-applied cases we marked as manual_required.
  if (manualRequired > 0) {
    try {
      const api = getBot().api;
      await queueOpsAlert(api, {
        group: 'ops',
        reason: 'autoheal_manual_required_failed',
        title: 'Auto-heal ORPHANED: manual review required',
        paymentId: manualRequiredIds.length ? manualRequiredIds[0] : null,
        kind: 'cron',
        payload: '',
        extra: [
          `Checked: ${cand.length}`,
          `Applied: ${applied}`,
          `Manual required: ${manualRequired}`,
          `Ids: ${manualRequiredIds.join(',') || '-'}`,
          manualRequiredReasons.length ? `Reason: ${manualRequiredReasons[0]}` : '',
        ].filter(Boolean),
      });
    } catch {}
  }

  let chainEnqueued = false;
  let chainId = null;
  let chainDepthNext = null;
  if (cand.length >= batch && Number(CFG.PAYMENTS_ORPHANED_AUTOHEAL_CHAIN_MAX || 0) > 0) {
    try {
      const url = getQStashDeliveryUrl('/api/qstash/monetization-retry');
      if (url && isQStashLibAvailable()) {
        chainId = `cron-${Date.now()}`;
        await qstashPublishJSON({
          url,
          body: {
            action: 'orphaned_autoheal',
            chain_id: chainId,
            chain_depth: 1,
            chain_source: 'cron',
          },
          deduplicationId: `mon:autoheal:${chainId}:1`,
          retries: 2,
          timeout: '20s',
        });
        chainEnqueued = true;
        chainDepthNext = 1;
      }
    } catch (e) {
      try {
        const api = getBot().api;
        await queueOpsAlert(api, {
          group: 'ops',
          reason: 'autoheal_chain_enqueue_failed',
          title: 'Auto-heal ORPHANED: chain enqueue failed',
          paymentId: cand[0]?.id ? Number(cand[0].id) : null,
          kind: 'cron',
          payload: '',
          extra: [
            `Checked: ${cand.length}`,
            `Applied: ${applied}`,
            `Failed: ${failed}`,
            String(e?.name || 'Error') + ': ' + String(e?.message || e).slice(0, 180),
          ].filter(Boolean),
        });
      } catch {}
    }
  }

  return { enabled: true, checked: cand.length, applied, failed, skipped, skipped_young: Number(skippedYoung || 0), chain_enqueued: chainEnqueued, chain_id: chainId, chain_depth_next: chainDepthNext };
}

export async function giveawaysTick() {
  const lockKey = k(['lock', 'giveaways_tick']);
  const startedAt = Date.now();

  try {
    return await withLock(lockKey, CRON_LOCK_TTL_SEC, async () => {
    const ended = await endDueGiveaways();
    const drawn = await autoDrawEnded();
    const published = await autoPublishDrawn();
    const official = await expireOfficialPosts();
    const retry = await issueIntroRetryCredits();
    const payheal = await autoHealOrphanedPayments();
    // Best-effort ops digest flush (anti-spam). Sends at most once per OPS_ALERT_SUMMARY_MIN.
    try {
      await flushOpsAlerts(getBot().api, 'ops');
    } catch {}
    const duration_ms = Date.now() - startedAt;

    // Keep the API response stable; write only a compact summary to Redis.
    const out = {
      ended,
      drawn,
      published_count: published.length,
      official,
      retry,
      payheal,
      ended_count: ended.length,
      drawn_count: drawn.length,
      official_expired: official.expired || 0,
      retry_issued: retry.issued || 0,
      retry_checked: retry.checked || 0,
      retry_expired: retry.expired || 0,
      duration_ms,
    };

    await writeCronLastRun('giveaways_tick', {
      ts: new Date().toISOString(),
      ended_count: out.ended_count,
      drawn_count: out.drawn_count,
      published_count: out.published_count,
      official_expired: out.official_expired,
      retry_checked: out.retry_checked,
      retry_issued: out.retry_issued,
      retry_expired: out.retry_expired,
      payheal_checked: payheal.checked || 0,
      payheal_applied: payheal.applied || 0,
      payheal_failed: payheal.failed || 0,
      payheal_skipped_young: payheal.skipped_young || 0,
      duration_ms: out.duration_ms,
    });

    return out;
    });
  } catch (e) {
    // One authoritative job-level alert. The router sees the marker and does not emit a duplicate.
    try { await recordCronTickFailure('giveaways_tick', 'giveaways-tick', e); } catch {}
    throw e;
  }
}

// =====================================================
// Broadcast tick: send one batch per invocation
// =====================================================
const BROADCAST_BATCH_SIZE = 25;
const BROADCAST_SEND_DELAY_MS = 50; // ~20 msg/sec
// Global time budget for one cron invocation (serverless-safe).
// We stop sending before the deadline to ensure we can persist cursor/counters.
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
// When Telegram returns 429, we respect retry_after and avoid hammering.
// Stored in Redis (fast path). If Redis is unavailable, we persist a DB fuse (broadcasts.cooldown_until)
// to avoid expensive recipient polling in Neon during cooldown.
const BROADCAST_COOLDOWN_PAD_SEC = 30;

// Per-recipient quarantine: if a recipient repeatedly hits 429 (deferred), we extend its retry window
// to avoid burning cron ticks on problematic chats.
const BROADCAST_QUARANTINE_THRESHOLD = Math.max(
  2,
  Math.min(10, Number(process.env.BROADCAST_QUARANTINE_THRESHOLD || 3) || 3)
);
// Default: 20 minutes. Keep bounded so a single broadcast doesn't block the pipeline for hours.
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

  for (const msg of plan.messages) {
    const opts = {};
    if (msg.reply_markup) opts.reply_markup = msg.reply_markup;

    if (msg.kind === 'text') {
      opts.parse_mode = 'HTML';
      await api.sendMessage(Number(tgId), msg.text || '', opts, tgTimeoutSignal());
      continue;
    }

    if (msg.caption) {
      opts.caption = msg.caption;
      opts.parse_mode = 'HTML';
    }

    if (msg.kind === 'photo') {
      await api.sendPhoto(Number(tgId), msg.file_id, opts, tgTimeoutSignal(TG_HTTP_MEDIA_TIMEOUT_MS));
    } else if (msg.kind === 'video') {
      await api.sendVideo(Number(tgId), msg.file_id, opts, tgTimeoutSignal(TG_HTTP_MEDIA_TIMEOUT_MS));
    } else if (msg.kind === 'animation') {
      await api.sendAnimation(Number(tgId), msg.file_id, opts, tgTimeoutSignal(TG_HTTP_MEDIA_TIMEOUT_MS));
    } else if (msg.kind === 'document') {
      await api.sendDocument(Number(tgId), msg.file_id, opts, tgTimeoutSignal(TG_HTTP_MEDIA_TIMEOUT_MS));
    } else {
      opts.parse_mode = 'HTML';
      await api.sendMessage(Number(tgId), bc.draft_text || bc.draft_caption || '(empty)', opts, tgTimeoutSignal());
    }
  }
}



export async function igVerifyTick() {
  const lockKey = k(['lock', 'ig_verify_tick']);
  const startedAt = Date.now();

  // Optional feature: enabled only if explicitly configured.
  const enabled = !!CFG.IG_VERIFY_TICK_ENABLED && !!String(CFG.IG_VERIFY_ACCESS_TOKEN || '').trim() && !!String(CFG.IG_VERIFY_MEDIA_ID || '').trim();
  if (!enabled) {
    const out = { enabled: false, checked: 0, verified: 0, duration_ms: Date.now() - startedAt };
    await writeCronLastRun('ig_verify_tick', { ts: new Date().toISOString(), ...out });
    return out;
  }

  return await withLock(lockKey, CRON_LOCK_TTL_SEC, async () => {
    const nowIso = new Date().toISOString();
    // DB truth: pending codes live in workspace_settings.profile_contacts. Redis is only accelerator.
    const pendingRows = await db.listIgVerifyPendingWorkspaces(300);
    const pendingByCode = new Map(); // code -> { wsId, ownerUserId, profile_contacts }
    for (const r of pendingRows || []) {
      const wsId = Number(r.workspace_id || 0);
      const ownerUserId = Number(r.owner_user_id || 0);
      const pc = r.profile_contacts || {};
      const ig = (pc.ig && typeof pc.ig === 'object') ? pc.ig : null;
      const code = ig?.pending?.code ? String(ig.pending.code).trim().toUpperCase() : '';
      if (!wsId || !ownerUserId || !code) continue;
      pendingByCode.set(code, { wsId, ownerUserId, profile_contacts: pc });
    }

    const codes = new Set(pendingByCode.keys());
    if (codes.size === 0) {
      const out0 = { enabled: true, checked: 0, verified: 0, duration_ms: Date.now() - startedAt };
      await writeCronLastRun('ig_verify_tick', { ts: nowIso, ...out0 });
      return out0;
    }

    const comments = await fetchIgVerificationComments({
      mediaId: String(CFG.IG_VERIFY_MEDIA_ID),
      accessToken: String(CFG.IG_VERIFY_ACCESS_TOKEN),
      limit: Number(CFG.IG_VERIFY_COMMENTS_LIMIT || 50) || 50,
    });

    let verified = 0;
    let checked = 0;

    for (const c of comments) {
      checked += 1;
      const text = String(c.text || '');
      const username = String(c.username || '').replace(/^@/, '').trim();
      if (!text || !username) continue;

      const foundCodes = extractIgVerifyCodes(text);
      if (!foundCodes.length) continue;

      for (const code of foundCodes) {
        const kcode = code.trim().toUpperCase();
        if (!codes.has(kcode)) continue;
        const row = pendingByCode.get(kcode);
        if (!row) continue;

        // Update DB truth: verified=true, handle/url from Graph username ONLY (ignore any user input).
        const pc0 = row.profile_contacts || {};
        const ig0 = (pc0.ig && typeof pc0.ig === 'object') ? pc0.ig : {};
        ig0.verified = true;
        ig0.verified_at = nowIso;
        ig0.verified_method = 'comment';
        ig0.handle = username;
        ig0.url = `https://www.instagram.com/${username}/`;
        delete ig0.pending;
        pc0.ig = ig0;

        try {
          await db.setWorkspaceSetting(row.wsId, { profile_contacts: pc0, profile_contacts_v: 1 });
        } catch (e) {
          console.error('[IG-VERIFY] db.setWorkspaceSetting failed', { wsId: row.wsId }, e);
          continue;
        }

        // Best-effort: clear Redis accelerator keys.
        try {
          await redis.del(k(['ig_pending', kcode]));
          await redis.del(k(['ig_ws_pending', row.wsId]));
        } catch {}

        // Best-effort notify creator (owner) in Telegram.
        try {
          await getBot().api.sendMessage(
            row.ownerUserId,
            `✅ Instagram верифицирован!\n\nБейдж доверия теперь виден брендам в витрине (до unlock).`,
            { disable_web_page_preview: true }
          );
        } catch {}

        verified += 1;

        // Avoid double-processing if multiple comments contain same code.
        codes.delete(kcode);
        pendingByCode.delete(kcode);
        break;
      }

      if (codes.size === 0) break;
    }

    const out = { enabled: true, checked, verified, pending: pendingByCode.size, duration_ms: Date.now() - startedAt };
    await writeCronLastRun('ig_verify_tick', { ts: nowIso, ...out });
    return out;
  });
}

function extractIgVerifyCodes(text) {
  const s = String(text || '');
  // Accept typical variants: "COLLABKA-XXXXXX" (letters/digits, length 4..12)
  const re = /\bCOLLABKA-[A-Z0-9]{4,12}\b/gi;
  const out = [];
  let m;
  while ((m = re.exec(s))) {
    out.push(String(m[0] || '').toUpperCase());
    if (out.length >= 5) break; // keep bounded
  }
  return out;
}

async function fetchIgVerificationComments({ mediaId, accessToken, limit }) {
  const out = [];
  const lim = Math.max(5, Math.min(Number(limit || 0) || 50, 200));
  const url = new URL(`https://graph.facebook.com/v19.0/${encodeURIComponent(String(mediaId))}/comments`);
  url.searchParams.set('fields', 'id,text,username,timestamp');
  url.searchParams.set('limit', String(lim));
  url.searchParams.set('access_token', String(accessToken));

  // NOTE: no IG API calls in hot paths; this runs only from cron.
  let nextUrl = url.toString();
  const seen = new Set();

  for (let page = 0; page < 5 && nextUrl; page++) {
    const resp = await fetch(nextUrl, { method: 'GET' });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`IG comments fetch failed: ${resp.status} ${txt.slice(0, 300)}`);
    }

    const js = await resp.json();
    const data = Array.isArray(js?.data) ? js.data : [];
    for (const x of data) {
      const id = x?.id ? String(x.id) : '';
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      out.push({
        id: x?.id,
        text: x?.text,
        username: x?.username,
        timestamp: x?.timestamp,
      });
    }

    nextUrl = js?.paging?.next || null;
    if (!nextUrl) break;
    if (out.length >= 1000) break;
  }

  return out;
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
      if (fanoutEnabled) {
        try {
          const st = await db.countBroadcastDeliveryStats(bc.id);
          finalSent = Number(st.sent || 0);
          finalFailed = Number(st.failed || 0) + Number(st.blocked || 0);
        } catch {
          // keep best-effort
        }
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

          const sentShown = fanoutEnabled ? finalSent : bc.sent_count;
          const failedShown = fanoutEnabled ? finalFailed : bc.failed_count;
          await bot.api.sendMessage(
            Number(creator.tg_id),
            `✅ <b>Рассылка #${bc.id} завершена</b>\n\n📊 Отправлено: ${sentShown} / ${bc.total_count}\n❌ Ошибок: ${failedShown}`,
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
            console.error('[BROADCAST] hard-skip log failed', { broadcast_id: bc.id, uid, error: em });
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
          console.error('[BROADCAST][QSTASH] enqueue failed', { broadcast_id: bc.id, uid, error: em });
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
    let lastId = lastUserId;
    let cooldownSetSec = 0;

    let hardSkipped = 0;
    const hardSkipMap2 = await getBroadcastHardSkipMap(recipients.map((r) => Number(r.tg_id)));


    for (const recipient of recipients) {
      // Global budget: stop early to avoid Vercel hard-kill mid-loop and to
      // always have time to persist cursor/counters.
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

      // Advance cursor only after we have *logged* an outcome for this uid.
      // Important for 429: if rate-limited, we must NOT advance or the uid can be skipped forever.
      let advanced = false;

      try {
        await sendBroadcastMessage(bot.api, tgId, bc);
        await db.logBroadcastSent(bc.id, uid, 'sent');
        await resetBroadcastQuarantineCount(bc.id, uid);
        sent++;
        advanced = true;
      } catch (err) {
        const code = err?.error_code || err?.statusCode || 0;
        const desc = String(err?.description || err?.message || '');

        // 403 = blocked by user, 400 = chat not found → permanent failure
        if (
          code === 403 ||
          code === 400 ||
          desc.includes('bot was blocked') ||
          desc.includes('chat not found') ||
          desc.includes('user is deactivated')
        ) {
          const hsReason = normalizeBroadcastDeadChatReason(code, desc);
          if (hsReason) await setBroadcastHardSkip(tgId, hsReason);
          await db.logBroadcastBlocked(bc.id, uid, desc || `telegram_${code}`);
          await resetBroadcastQuarantineCount(bc.id, uid);
          failed++;
          advanced = true;
        }
        // 429 = rate limit → stop batch early, retry next tick
        else if (code === 429) {
          const retryAfter = extractRetryAfterSec(err);
          cooldownSetSec = retryAfter;
          // Persist per-recipient retry_after (DB-truth) so this user won't stall the whole job.
          // We still respect Telegram retry_after globally via Redis cooldown (early-exit on next tick).
          let qCount = 0;
          try {
            await db.logBroadcastDeferred(bc.id, uid, retryAfter);
            deferred++;
            advanced = true;
            qCount = await bumpBroadcastQuarantineCount(bc.id, uid);
          } catch {
            // If DB is unavailable, fall back to global cooldown only (cursor won't advance).
          }

          const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          await incrDayCounter(bcDeferSetDayKey(day));

          // If the same recipient keeps triggering 429 repeatedly, quarantine it for a longer window.
          // This avoids wasting cron ticks on problematic chats while keeping broadcast progress.
          if (qCount >= BROADCAST_QUARANTINE_THRESHOLD) {
            try {
              await resetBroadcastQuarantineCount(bc.id, uid);
              await db.logBroadcastQuarantine(bc.id, uid, BROADCAST_QUARANTINE_SEC);
              await incrDayCounter(bcQuarantineSetDayKey(day));
              console.error(
                `[BROADCAST] quarantine uid=${uid} for ${BROADCAST_QUARANTINE_SEC}s after ${qCount} deferrals`
              );
            } catch {
              // ignore quarantine failures
            }
          }

          await setBroadcastCooldown(bc.id, retryAfter, 'telegram_429');
          console.error(`[BROADCAST] 429 rate limit, retry_after=${retryAfter} (uid=${uid})`);
          // Stop batch early — serverless safe. Next tick continues after cursor.
          break;
        }
        // Other errors → log as failed, continue
        else {
          console.error(`[BROADCAST] send error uid=${uid}`, desc);
          await db.logBroadcastSent(bc.id, uid, 'failed');
          await resetBroadcastQuarantineCount(bc.id, uid);
          failed++;
          advanced = true;
        }
      }

      if (advanced) lastId = Math.max(lastId, uid);

      // Throttle between messages
      if (BROADCAST_SEND_DELAY_MS > 0) await sleep(BROADCAST_SEND_DELAY_MS);
    }

    // Update counters only when there is progress.
    // Important: on 429 we intentionally do NOT advance the cursor and can have sent=0/failed=0.
    // Cooldown is Redis-only, so avoid burning Neon CU with a no-op UPDATE.
    const hasProgress = sent > 0 || failed > 0 || lastId !== lastUserId;
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


// =====================================================
// Audit buffer flush tick (Redis -> Postgres workspace_audit)
//
// Goal: when audit DB writes are throttled/suppressed, do not lose events.
// We enqueue suppressed events to Redis list and flush them in batches.
// =====================================================
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
 
