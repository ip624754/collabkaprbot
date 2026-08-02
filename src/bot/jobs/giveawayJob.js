// STEP590G1: Giveaway cron job.
// Compatibility extraction only: preserve cron behavior, locks, TTLs and route contracts.
import * as db from '../../db/queries.js';
import { getBot, _validateStarsPaymentStrict } from '../bot.js';
import { InlineKeyboard } from 'grammy';
import { CFG } from '../../lib/config.js';
import { isPaymentsFallbackApplyEnabled } from '../../lib/paymentsOps.js';
import { qstashPublishJSON, getQStashDeliveryUrl, isQStashLibAvailable } from '../../lib/qstash.js';
import { applyPaymentFallbackNoSession } from '../payments_fallback.js';
import { buildRecoveredPaymentMessage } from '../monetizationCopy.js';
import { flushOpsAlerts, queueOpsAlert } from '../opsAlerts.js';
import { notifyGiveawayEnded, notifyGiveawayWinnersReady, notifyGiveawayWinnersDM } from '../gwNotify.js';
import { CRON_LOCK_TTL_SEC, acquireLock, k, recordCronTickFailure, redis, releaseLock, withLock, writeCronLastRun } from './cronRuntime.js';

// BEGIN MOVED CRON BODY: giveaway
const CRON_END_BATCH = 50;

const CRON_DRAW_BATCH = 50;

const CRON_OFFICIAL_EXPIRE_BATCH = 50;

const CRON_RETRY_BATCH = 50;

const CRON_RETRY_EXPIRE_BATCH = 200;

const GIVEAWAY_LOCK_TTL_SEC = 120;

const NOTIFY_TIMEOUT_MS = 5000;

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
      // Atomic: lock + pick + persist + status update + audit, all in one tx.
      const r = await db.drawAndFinalizeGiveawayWinnersAtomic(g.id, {
        expectedWorkspaceId: g.workspace_id,
        source: 'cron',
      });

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
          await db.setPaymentStatusIfNotApplied(Number(r.id), 'ORPHANED', `autoheal_manual_required:${rr}`);
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
        validation: v,
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
            await db.setPaymentStatusIfNotApplied(Number(r.id), 'ORPHANED', `autoheal_manual_required:${rr}`);
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
// END MOVED CRON BODY: giveaway
