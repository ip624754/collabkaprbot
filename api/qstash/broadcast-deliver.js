import { CFG } from '../../src/lib/config.js';
import { redis, k } from '../../src/lib/redis.js';
import * as db from '../../src/db/queries.js';
import { getBot } from '../../src/bot/bot.js';
import {
  sendBroadcastMessage,
  extractRetryAfterSec,
  getBroadcastCooldownUntilMs,
  setBroadcastCooldown,
} from '../../src/bot/cron.js';
import {
  qstashPublishJSON,
  getQStashDeliveryUrl,
  getBroadcastFlowControl,
  qstashVerifySignature,
} from '../../src/lib/qstash.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Micro-memo for cooldown checks (per lambda instance).
// Prevents repeated Redis reads during QStash fan-out bursts.
const cooldownMemo = new Map(); // broadcastId -> { untilMs, expAtMs }
const COOLDOWN_MEMO_TTL_MS = Math.max(
  200,
  Math.min(10_000, Number(process.env.QSTASH_BC_COOLDOWN_MEMO_TTL_MS || 1500) || 1500)
);

function getCooldownMemo(broadcastId) {
  const v = cooldownMemo.get(String(broadcastId));
  if (!v) return null;
  if (Date.now() > Number(v.expAtMs || 0)) {
    cooldownMemo.delete(String(broadcastId));
    return null;
  }
  return Number(v.untilMs || 0) || 0;
}

function setCooldownMemo(broadcastId, untilMs) {
  cooldownMemo.set(String(broadcastId), {
    untilMs: Number(untilMs || 0) || 0,
    expAtMs: Date.now() + COOLDOWN_MEMO_TTL_MS,
  });
}

async function getCooldownUntilFast(broadcastId) {
  const memo = getCooldownMemo(broadcastId);
  if (memo) return memo;
  const ms = await getBroadcastCooldownUntilMs(broadcastId);
  if (ms) setCooldownMemo(broadcastId, ms);
  return ms;
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
    const v = await redis.incr(key);
    try {
      await redis.expire(key, 24 * 60 * 60);
    } catch {}
    return Number(v) || 0;
  } catch {
    return 0;
  }
}

function getQuarantineThreshold() {
  const v = Number(process.env.BROADCAST_QUARANTINE_THRESHOLD || 3) || 3;
  return Math.max(2, Math.min(10, v));
}

function getQuarantineSec() {
  const v = Number(process.env.BROADCAST_QUARANTINE_SEC || 1200) || 1200;
  return Math.max(60, Math.min(6 * 3600, v));
}

function getHeader(req, name) {
  const n = String(name || '').toLowerCase();
  const h = req.headers || {};
  for (const k of Object.keys(h)) {
    if (String(k).toLowerCase() === n) return h[k];
  }
  return undefined;
}

async function readRawBody(req, limitBytes = 1024 * 1024) {
  return await new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('payload_too_large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function isNonRetryableTelegramError(code, desc) {
  if (code === 403 || code === 400) return true;
  const d = String(desc || '').toLowerCase();
  return (
    d.includes('bot was blocked') ||
    d.includes('chat not found') ||
    d.includes('user is deactivated')
  );
}

export default async function handler(req, res) {
  const startedAt = Date.now();
  try {
    if (req.method !== 'POST') {
      res.status(405).end('Method Not Allowed');
      return;
    }

    const rawBody = await readRawBody(req);

    // Verify signature
    const signature = getHeader(req, 'Upstash-Signature');

    const url = getQStashDeliveryUrl('/api/qstash/broadcast-deliver');
    if (!url) {
      res.status(500).json({ ok: false, error: 'public_base_url_missing' });
      return;
    }

    try {
      await qstashVerifySignature({ signature, body: rawBody, url });
    } catch (e) {
      const code = String(e?.message || 'error');
      if (code === 'qstash_lib_missing') {
        res.status(503).json({ ok: false, error: 'qstash_disabled' });
        return;
      }
      if (code === 'qstash_signature_missing') {
        res.status(401).json({ ok: false, error: 'signature_missing' });
        return;
      }
      if (code === 'qstash_invalid_signature') {
        res.status(401).json({ ok: false, error: 'invalid_signature' });
        return;
      }
      res.status(500).json({ ok: false, error: code });
      return;
    }

    // Best-effort: ops breadcrumb for /api/health (Redis-only).
    try {
      await redis.set(k(['qstash', 'broadcast_deliver', 'last_at']), new Date().toISOString(), { ex: 14 * 24 * 60 * 60 });
    } catch {}

    let payload;
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      res.status(400).json({ ok: false, error: 'bad_json' });
      return;
    }

    const broadcastId = Number(payload.broadcastId || payload.broadcast_id || 0);
    const userId = Number(payload.userId || payload.user_id || 0);
    const tgId = Number(payload.tgId || payload.tg_id || 0);
    const attempt = Number(payload.attempt || 0) || 0;
    const bcPayload = payload.bc || null;

    if (!broadcastId || !userId || !tgId || !bcPayload) {
      res.status(400).json({ ok: false, error: 'bad_payload' });
      return;
    }

    // Cooldown (Redis-only fast path).
    // Important: check BEFORE any DB reads to avoid burning Neon CU during 429 bursts.
    const nowMs0 = Date.now();
    const cdMs0 = await getCooldownUntilFast(broadcastId);
    if (cdMs0 && cdMs0 > nowMs0) {
      const retryAfterSec = Math.max(1, Math.ceil((cdMs0 - nowMs0) / 1000));

      // Best-effort: keep DB log consistent, but never fail the request because of DB here.
      try {
        await db.logBroadcastQueued(broadcastId, userId);
        await db.markBroadcastDeliveryRetry(broadcastId, userId, retryAfterSec, 'cooldown');
      } catch {}

      try {
        const url = getQStashDeliveryUrl('/api/qstash/broadcast-deliver');
        const dedupId = `b:${broadcastId}:u:${userId}:a:${attempt + 1}`;
        await qstashPublishJSON({
          url,
          body: { ...payload, attempt: attempt + 1 },
          deduplicationId: dedupId,
          delaySec: retryAfterSec,
          retries: Number(CFG.QSTASH_BROADCAST_RETRIES || 10),
          flowControl: getBroadcastFlowControl(broadcastId),
          timeout: '20s',
        });
      } catch (e) {
        console.error('[QSTASH][BC] republish on cooldown failed', String(e?.message || e));
        res.status(500).json({ ok: false, error: 'republish_failed' });
        return;
      }

      res.status(200).json({ ok: true, delayed: true, reason: 'cooldown', retry_after_sec: retryAfterSec });
      return;
    }

    // DB down → fail-closed (never send without DB guard).
    const bcRow = await db.getBroadcast(broadcastId);
    if (!bcRow) {
      // Non-retryable: broadcast removed.
      res.status(200).json({ ok: true, skipped: 'broadcast_missing' });
      return;
    }

    const st = String(bcRow.status || '').toUpperCase();

    // If paused: delay and keep job alive.
    if (st === 'PAUSED') {
      const delaySec = Number(CFG.QSTASH_BROADCAST_PAUSE_DELAY_SEC || 60);
      try {
        await db.logBroadcastQueued(broadcastId, userId);
        await db.markBroadcastDeliveryRetry(broadcastId, userId, delaySec, 'paused');
      } catch {
        // If DB unstable, return 500 to retry later.
        res.status(500).json({ ok: false, error: 'db_unavailable' });
        return;
      }

      try {
        const dedupId = `b:${broadcastId}:u:${userId}:a:${attempt + 1}`;
        await qstashPublishJSON({
          url,
          body: { ...payload, attempt: attempt + 1 },
          deduplicationId: dedupId,
          delaySec,
          retries: Number(CFG.QSTASH_BROADCAST_RETRIES || 10),
          flowControl: getBroadcastFlowControl(broadcastId),
          timeout: '20s',
        });
      } catch (e) {
        console.error('[QSTASH][BC] republish on pause failed', String(e?.message || e));
        // Let QStash retry the current call (DB already marked retry window).
        res.status(500).json({ ok: false, error: 'republish_failed' });
        return;
      }

      res.status(200).json({ ok: true, delayed: true, reason: 'paused', delay_sec: delaySec });
      return;
    }

    // If stopped / errored: do not deliver.
    if (st === 'STOPPED' || st === 'ERROR') {
      try {
        await db.logBroadcastQueued(broadcastId, userId);
        await db.markBroadcastDeliveryFailedNonRetryable(broadcastId, userId, `broadcast_${st.toLowerCase()}`);
      } catch {
        res.status(500).json({ ok: false, error: 'db_unavailable' });
        return;
      }
      res.status(200).json({ ok: true, skipped: `broadcast_${st.toLowerCase()}` });
      return;
    }

    // Cooldown (Redis best-effort). Redis down → fail-open.
    // Second check (race-friendly): cooldown could be set by a parallel delivery.
    const nowMs = Date.now();
    const cdMs = await getCooldownUntilFast(broadcastId);
    if (cdMs && cdMs > nowMs) {
      const retryAfterSec = Math.max(1, Math.ceil((cdMs - nowMs) / 1000));
      try {
        await db.logBroadcastQueued(broadcastId, userId);
        await db.markBroadcastDeliveryRetry(broadcastId, userId, retryAfterSec, 'cooldown');
      } catch {
        res.status(500).json({ ok: false, error: 'db_unavailable' });
        return;
      }

      try {
        const dedupId = `b:${broadcastId}:u:${userId}:a:${attempt + 1}`;
        await qstashPublishJSON({
          url,
          body: { ...payload, attempt: attempt + 1 },
          deduplicationId: dedupId,
          delaySec: retryAfterSec,
          retries: Number(CFG.QSTASH_BROADCAST_RETRIES || 10),
          flowControl: getBroadcastFlowControl(broadcastId),
          timeout: '20s',
        });
      } catch (e) {
        console.error('[QSTASH][BC] republish on cooldown failed', String(e?.message || e));
        res.status(500).json({ ok: false, error: 'republish_failed' });
        return;
      }

      res.status(200).json({ ok: true, delayed: true, reason: 'cooldown', retry_after_sec: retryAfterSec });
      return;
    }

    // Claim delivery (DB guard). If already processed / not due, return 200.
    const claim = await db.claimBroadcastDelivery(broadcastId, userId, 60);
    if (!claim) {
      res.status(200).json({ ok: true, skipped: 'not_claimable' });
      return;
    }

    const bot = getBot();

    try {
      await sendBroadcastMessage(bot.api, tgId, bcPayload);
      await resetBroadcastQuarantineCount(broadcastId, userId);

      // Mark sent. Best-effort retries.
      let marked = false;
      for (let i = 0; i < 3; i++) {
        try {
          await db.markBroadcastDeliverySent(broadcastId, userId);
          marked = true;
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 50 + i * 100));
        }
      }

      if (!marked) {
        console.error('[QSTASH][BC] sent but DB mark failed', { broadcastId, userId });
      }

      res.status(200).json({ ok: true, sent: true, db_marked: marked, ms: Date.now() - startedAt });
      return;
    } catch (err) {
      const code = err?.error_code || err?.statusCode || 0;
      const desc = String(err?.description || err?.message || '');

      // Non-retryable errors
      if (isNonRetryableTelegramError(code, desc)) {
        try {
          await db.markBroadcastDeliveryBlocked(broadcastId, userId, desc || `telegram_${code}`);
          await resetBroadcastQuarantineCount(broadcastId, userId);
        } catch {
          // DB down: fail-closed
          res.status(500).json({ ok: false, error: 'db_unavailable' });
          return;
        }
        res.status(200).json({ ok: true, failed: true, non_retryable: true });
        return;
      }

      // 429 → set cooldown + delay-republish + 2xx
      if (Number(code) === 429) {
        const retryAfter = extractRetryAfterSec(err);
        const threshold = getQuarantineThreshold();
        const quarantineSec = getQuarantineSec();
        let qCount = 0;
        let delaySec = retryAfter;
        try {
          await db.logBroadcastDeferred(broadcastId, userId, retryAfter);
          qCount = await bumpBroadcastQuarantineCount(broadcastId, userId);

          // If the same recipient keeps triggering 429 repeatedly, quarantine it for a longer window.
          // This avoids burning QStash retries on problematic chats while keeping broadcast progress.
          if (qCount >= threshold) {
            await resetBroadcastQuarantineCount(broadcastId, userId);
            await db.logBroadcastQuarantine(broadcastId, userId, quarantineSec);
            delaySec = quarantineSec;
          }

          await setBroadcastCooldown(broadcastId, retryAfter, 'telegram_429');
        } catch {
          // DB down: fail-closed
          res.status(500).json({ ok: false, error: 'db_unavailable' });
          return;
        }

        try {
          const dedupId = `b:${broadcastId}:u:${userId}:a:${attempt + 1}`;
          await qstashPublishJSON({
            url,
            body: { ...payload, attempt: attempt + 1 },
            deduplicationId: dedupId,
            delaySec,
            retries: Number(CFG.QSTASH_BROADCAST_RETRIES || 10),
            flowControl: getBroadcastFlowControl(broadcastId),
            timeout: '20s',
          });
        } catch (e) {
          console.error('[QSTASH][BC] republish after 429 failed', String(e?.message || e));
          // Allow QStash retry, but DB already deferred and cooldown is set.
          res.status(500).json({ ok: false, error: 'republish_failed' });
          return;
        }

        res.status(200).json({ ok: true, deferred: true, retry_after_sec: delaySec, qcnt: qCount || 0 });
        return;
      }

      // Other errors → retryable. Mark retry window and return 500 so QStash retries.
      try {
        await db.markBroadcastDeliveryRetry(broadcastId, userId, 60, desc || `telegram_${code}`);
      } catch {
        res.status(500).json({ ok: false, error: 'db_unavailable' });
        return;
      }

      res.status(500).json({ ok: false, error: 'retryable_error' });
    }
  } catch (e) {
    console.error('[QSTASH][BC] handler error', e);
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
}
