import { CFG } from '../../lib/config.js';
import { queueOpsDigestSafe } from '../../lib/opsDigest.js';
import { redis, k } from '../../lib/redis.js';
import * as db from '../../db/queries.js';
import { getBot } from '../../bot/bot.js';
import {
  sendBroadcastMessage,
  extractRetryAfterSec,
  setBroadcastCooldown,
  setBroadcastHardSkip,
  normalizeBroadcastDeadChatReason,
} from '../../bot/cron.js';
import {
  qstashPublishJSON,
  getQStashDeliveryUrl,
  getBroadcastFlowControl,
  qstashVerifySignature,
} from '../../lib/qstash.js';
import {
  buildBroadcastUnknownReason,
  classifyBroadcastSendError,
  extractTelegramMessageIds,
} from '../../bot/broadcastDeliverySafety.js';
import {
  persistBroadcastRejectedOrUnknown,
  persistBroadcastSentOrUnknown,
  persistBroadcastUnknown,
} from '../../bot/broadcastDeliveryReceipt.js';
import { getCooldownUntilFast } from './cooldown.js';
import {
  dbOverloadFuseKey,
  getLocalDbOverloadFuseUntilMs,
  isDbOverloadError,
  respondDbOverload,
  respondDbOverloadFuse,
} from './dbOverload.js';
import { handleBroadcastHardSkip } from './hardSkip.js';
import { getHeader, readRawBody } from './payload.js';
import {
  bumpBroadcast429DistinctUsers,
  bumpBroadcastQuarantineCount,
  getGlobal429Threshold,
  getQuarantineSec,
  getQuarantineThreshold,
  resetBroadcastQuarantineCount,
} from './quarantine.js';
import { emitBroadcastDeliveryUnknown } from './receipt.js';

export default async function handler(req, res) {
  const startedAt = Date.now();
  let ctxInfo = { broadcastId: null, userId: null, tgId: null, attempt: null };
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

    ctxInfo = { broadcastId, userId, tgId, attempt };
    const bcPayload = payload.bc || null;

    if (!broadcastId || !userId || !tgId || !bcPayload) {
      res.status(400).json({ ok: false, error: 'bad_payload' });
      return;
    }

    // Warm-instance local fuse: if we recently saw DB overload while Redis was unavailable,
    // short-circuit BEFORE even attempting the Redis fuse read or any DB access.
    const localFuseUntilMs = getLocalDbOverloadFuseUntilMs();
    if (localFuseUntilMs) {
      const retryAfterSec = Math.max(1, Math.ceil((localFuseUntilMs - Date.now()) / 1000));
      await respondDbOverloadFuse({
        res,
        broadcastId,
        userId,
        tgId,
        attempt,
        where: 'local_fuse_precheck',
        retryAfterSec,
        localFuse: true,
      });
      return;
    }

    // DB overload fuse (Redis-only): if recent DB overload was detected, short-circuit BEFORE any DB access.
    // Best-effort: if Redis is down, continue normally.
    try {
      const v = await redis.get(dbOverloadFuseKey());
      if (v) {
        await respondDbOverloadFuse({ res, broadcastId, userId, tgId, attempt, where: 'fuse_precheck' });
        return;
      }
    } catch {}

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
        const deliverUrl = url; // avoid scope-shadow (url already computed for signature)
        const dedupId = `b:${broadcastId}:u:${userId}:a:${attempt + 1}`;
        await qstashPublishJSON({
          url: deliverUrl,
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
    let bcRow;
    try {
      bcRow = await db.getBroadcast(broadcastId);
    } catch (e) {
      if (isDbOverloadError(e)) {
        await respondDbOverload({ res, broadcastId, userId, tgId, attempt, where: 'getBroadcast', err: e });
        return;
      }
      throw e;
    }
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
      } catch (e) {
        if (isDbOverloadError(e)) {
          await respondDbOverload({ res, broadcastId, userId, tgId, attempt, where: 'paused_log', err: e });
          return;
        }
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
      } catch (e) {
        if (isDbOverloadError(e)) {
          await respondDbOverload({ res, broadcastId, userId, tgId, attempt, where: 'db_write', err: e });
          return;
        }
        res.status(500).json({ ok: false, error: 'db_unavailable' });
        return;
      }
      res.status(200).json({ ok: true, skipped: `broadcast_${st.toLowerCase()}` });
      return;
    }

    // Hard-skip (Redis-only): do not waste Telegram/QStash on permanently dead chats.
    // Note: keep DB guard (broadcast must exist) before writing to broadcast_sent_log (FK).
    if (await handleBroadcastHardSkip({ res, broadcastId, userId, tgId, attempt })) return;

// Cooldown (Redis best-effort). Redis down → fail-open.
    // Second check (race-friendly): cooldown could be set by a parallel delivery.
    const nowMs = Date.now();
    const cdMs = await getCooldownUntilFast(broadcastId);
    if (cdMs && cdMs > nowMs) {
      const retryAfterSec = Math.max(1, Math.ceil((cdMs - nowMs) / 1000));
      try {
        await db.logBroadcastQueued(broadcastId, userId);
        await db.markBroadcastDeliveryRetry(broadcastId, userId, retryAfterSec, 'cooldown');
      } catch (e) {
        if (isDbOverloadError(e)) {
          await respondDbOverload({ res, broadcastId, userId, tgId, attempt, where: 'db_write', err: e });
          return;
        }
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

    // Construct the Telegram client before claiming: a local configuration
    // failure is definitely pre-send and must not strand an in-flight row.
    const bot = getBot();

    // Claim delivery (DB guard). Stale `sending` is quarantined as unknown,
    // never reclaimed for another automatic Telegram send.
    let claim;
    try {
      claim = await db.claimBroadcastDelivery(broadcastId, userId, 60);
    } catch (e) {
      if (isDbOverloadError(e)) {
        await respondDbOverload({ res, broadcastId, userId, tgId, attempt, where: 'claimDelivery', err: e });
        return;
      }
      throw e;
    }
    if (!claim) {
      res.status(200).json({ ok: true, skipped: 'not_claimable', automatic_resend: false });
      return;
    }

    const deliveryAttemptId = String(claim.delivery_attempt_id || '').trim();
    if (!deliveryAttemptId) {
      res.status(503).json({ ok: false, error: 'broadcast_delivery_migration_required' });
      return;
    }

    try {
      const sendResult = await sendBroadcastMessage(bot.api, tgId, bcPayload);
      const messageIds = extractTelegramMessageIds(sendResult);
      await resetBroadcastQuarantineCount(broadcastId, userId);

      // Telegram has acknowledged success. Persist only the DB receipt here;
      // this helper never calls Telegram and falls back to delivery_unknown.
      const receipt = await persistBroadcastSentOrUnknown({
        db,
        broadcastId,
        userId,
        attemptId: deliveryAttemptId,
        messageIds,
      });

      if (receipt.state !== 'sent') {
        const reason = buildBroadcastUnknownReason('telegram_send_succeeded_db_receipt_failed');
        await emitBroadcastDeliveryUnknown({
          broadcastId,
          userId,
          attemptId: deliveryAttemptId,
          reason,
          dbPersisted: receipt.persisted,
        });
        res.status(200).json({
          ok: true,
          sent: true,
          delivery_state: receipt.state,
          automatic_resend: false,
          ms: Date.now() - startedAt,
        });
        return;
      }

      res.status(200).json({
        ok: true,
        sent: true,
        delivery_state: 'sent',
        automatic_resend: false,
        ms: Date.now() - startedAt,
      });
      return;
    } catch (err) {
      const outcome = classifyBroadcastSendError(err);
      const code = Number(outcome.code || 0) || 0;
      const desc = String(outcome.description || '');

      if (outcome.kind === 'blocked') {
        const hsReason = normalizeBroadcastDeadChatReason(code, desc);
        if (hsReason) await setBroadcastHardSkip(tgId, hsReason);
        const receipt = await persistBroadcastRejectedOrUnknown({
          db,
          broadcastId,
          userId,
          attemptId: deliveryAttemptId,
          kind: 'blocked',
          errorText: desc || outcome.reason,
          error: err,
        });
        await resetBroadcastQuarantineCount(broadcastId, userId);
        if (receipt.state !== 'blocked') {
          const reason = buildBroadcastUnknownReason('telegram_rejected_db_receipt_failed', err);
          await emitBroadcastDeliveryUnknown({
            broadcastId,
            userId,
            attemptId: deliveryAttemptId,
            reason,
            dbPersisted: receipt.persisted,
          });
          res.status(200).json({ ok: true, delivery_state: receipt.state, automatic_resend: false });
          return;
        }
        res.status(200).json({ ok: true, failed: true, non_retryable: true, delivery_state: 'blocked' });
        return;
      }

      if (outcome.kind === 'failed') {
        const receipt = await persistBroadcastRejectedOrUnknown({
          db,
          broadcastId,
          userId,
          attemptId: deliveryAttemptId,
          kind: 'failed',
          errorText: desc || outcome.reason,
          error: err,
        });
        if (receipt.state !== 'failed') {
          const reason = buildBroadcastUnknownReason('telegram_failed_db_receipt_failed', err);
          await emitBroadcastDeliveryUnknown({
            broadcastId,
            userId,
            attemptId: deliveryAttemptId,
            reason,
            dbPersisted: receipt.persisted,
          });
          res.status(200).json({ ok: true, delivery_state: receipt.state, automatic_resend: false });
          return;
        }
        res.status(200).json({ ok: true, failed: true, non_retryable: true, delivery_state: 'failed' });
        return;
      }

      if (outcome.kind === 'retryable') {
        const retryAfter = extractRetryAfterSec(err);
        const threshold = getQuarantineThreshold();
        const quarantineSec = getQuarantineSec();
        const globalThr = getGlobal429Threshold();
        const qCount = await bumpBroadcastQuarantineCount(broadcastId, userId);
        const distinct429Users = await bumpBroadcast429DistinctUsers(broadcastId, userId);
        const isGlobal429 = distinct429Users >= globalThr;

        if (!isGlobal429 && qCount >= threshold) {
          let row = null;
          try {
            row = await db.markBroadcastDeliveryBlocked(
              broadcastId,
              userId,
              `telegram_429_quarantined_${quarantineSec}s`,
              deliveryAttemptId
            );
          } catch {}
          if (!row) {
            const reason = buildBroadcastUnknownReason('telegram_429_quarantine_db_receipt_failed', err);
            const receipt = await persistBroadcastUnknown({ db, broadcastId, userId, attemptId: deliveryAttemptId, reason });
            await emitBroadcastDeliveryUnknown({ broadcastId, userId, attemptId: deliveryAttemptId, reason, dbPersisted: receipt.persisted });
            res.status(200).json({ ok: true, delivery_state: receipt.state, automatic_resend: false });
            return;
          }
          await resetBroadcastQuarantineCount(broadcastId, userId);
          res.status(200).json({ ok: true, blocked: true, reason: 'telegram_429_quarantined', qcnt: qCount || 0, d429: distinct429Users || 0 });
          return;
        }

        let deferredRow = null;
        try {
          deferredRow = await db.markBroadcastDeliveryDeferred(
            broadcastId,
            userId,
            retryAfter,
            deliveryAttemptId,
            'telegram_429'
          );
        } catch {}
        if (!deferredRow) {
          const reason = buildBroadcastUnknownReason('telegram_429_db_receipt_failed', err);
          const receipt = await persistBroadcastUnknown({ db, broadcastId, userId, attemptId: deliveryAttemptId, reason });
          await emitBroadcastDeliveryUnknown({ broadcastId, userId, attemptId: deliveryAttemptId, reason, dbPersisted: receipt.persisted });
          res.status(200).json({ ok: true, delivery_state: receipt.state, automatic_resend: false });
          return;
        }

        if (isGlobal429) {
          await resetBroadcastQuarantineCount(broadcastId, userId);
          try { await setBroadcastCooldown(broadcastId, retryAfter, 'telegram_429'); } catch {}
        }

        const delaySec = Math.max(1, Number(retryAfter || 0) || 1);
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
          res.status(500).json({ ok: false, error: 'republish_failed' });
          return;
        }

        res.status(200).json({
          ok: true,
          deferred: true,
          mode: isGlobal429 ? 'global_429' : 'per_recipient_429',
          retry_after_sec: delaySec,
          qcnt: qCount || 0,
          d429: distinct429Users || 0,
        });
        return;
      }

      // No trustworthy negative acknowledgement from Telegram. Treat the outcome
      // as terminal unknown and require explicit operator reconciliation.
      const reason = buildBroadcastUnknownReason(outcome.reason, err);
      const receipt = await persistBroadcastUnknown({
        db,
        broadcastId,
        userId,
        attemptId: deliveryAttemptId,
        reason,
        messageIds: outcome.messageIds || [],
      });
      await emitBroadcastDeliveryUnknown({
        broadcastId,
        userId,
        attemptId: deliveryAttemptId,
        reason,
        dbPersisted: receipt.persisted,
      });
      res.status(200).json({
        ok: true,
        delivery_state: receipt.state,
        automatic_resend: false,
      });
      return;
    }
  } catch (e) {
    console.error('[QSTASH][BC] handler error', e);

    // Best-effort ops digest (Redis-only, anti-spam). One per broadcast per window.
    try {
      const bid = Number(ctxInfo?.broadcastId || 0) || 0;
      const uid = Number(ctxInfo?.userId || 0) || 0;
      await queueOpsDigestSafe({
        group: 'ops',
        reason: 'qstash_bc_deliver_failed',
        title: 'QStash broadcast deliver crashed',
        kind: 'qstash',
        payload: bid ? `broadcast=${bid}` : '',
        extra: [
          uid ? `user=${uid}` : '',
          ctxInfo?.tgId ? `tg=${ctxInfo.tgId}` : '',
          Number.isFinite(ctxInfo?.attempt) ? `attempt=${ctxInfo.attempt}` : '',
          String(e?.name || 'Error') + ': ' + String(e?.message || e).slice(0, 180),
        ].filter(Boolean),
        dedupId: bid ? `qstash_bc_deliver:${bid}` : 'qstash_bc_deliver',
      });
    } catch {
      // ignore
    }

    res.status(500).json({ ok: false, error: 'internal_error' });
  }
}
