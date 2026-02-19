import { redis, k } from '../lib/redis.js';
import * as db from '../db/queries.js';
import { getBot } from './bot.js';
import { InlineKeyboard } from 'grammy';
import { CFG } from '../lib/config.js';
import crypto from 'crypto';
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
function lockToken() {
  try {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {}
  try {
    return crypto.randomBytes(16).toString('hex');
  } catch {
    // last resort (non-crypto) — ok for lock ownership token
    return String(Date.now()) + ':' + String(Math.random());
  }
}

async function releaseLock(key, token) {
  // Delete lock only if we still own it (prevents deleting a new lock after TTL expiry).
  const script = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
  try {
    await redis.eval(script, [key], [String(token || '')]);
  } catch {
    // Best-effort fallback (may delete a new lock, but only if eval is unavailable).
    try {
      const v = await redis.get(key);
      if (String(v || '') == String(token || '')) await redis.del(key);
    } catch {}
  }
}


async function withLock(lockKey, ttlSec, fn) {
  const token = lockToken();
  const ok = await redis.set(lockKey, token, { nx: true, ex: ttlSec });
  if (!ok) return { locked: true };
  try {
    const r = await fn();
    return { locked: false, result: r };
  } finally {
    await releaseLock(lockKey, token);
  }
}

async function withGiveawayLock(giveawayId, fn) {
  const key = k(['lock', 'gw', String(giveawayId)]);
  const token = lockToken();
  const ok = await redis.set(key, token, { nx: true, ex: GIVEAWAY_LOCK_TTL_SEC });
  if (!ok) return { locked: true };
  try {
    const r = await fn();
    return { locked: false, result: r };
  } finally {
    await releaseLock(key, token);
  }
}

async function endDueGiveaways(now = new Date()) {
  const due = await db.listGiveawaysToEnd(CRON_END_BATCH);
  const ended = [];

  for (const g of due) {
    await db.updateGiveaway(g.id, { status: 'ENDED' });
    await db.auditGiveaway(g.id, g.workspace_id, null, 'gw.ended', {
      manual: false,
      now: now.toISOString(),
    });

    // Optional: notify owner/channel.
    try {
      const api = getBot().api;
      await notifyGiveawayEnded({ api, db, g, reason: 'time' });
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

      if (!r || r.status !== 'drawn') {
        // locked / wrong_status / already_drawn / no_entries
        return;
      }

      drawn.push(g.id);

      // Notify owner that winners are ready.
      try {
        await notifyGiveawayWinnersReady({
          api: bot.api,
          db,
          g,
          reason: 'auto_draw',
        });
      } catch {
        // ignore
      }

      // DM winners directly.
      try {
        await notifyGiveawayWinnersDM({
          api: bot.api,
          db,
          gwId: g.id,
          reason: 'auto_draw',
        });
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

    try {
      const winners = await db.getWinnersWithTgId(g.id);
      if (!winners.length) continue;

      const winnerLines = winners
        .map((w) => {
          const name = w.username ? `@${w.username}` : `tg:${w.tg_id}`;
          return `${w.place}. ${name}`;
        })
        .join('\n');

      const body = `🏁 <b>Итоги конкурса</b>\n\n🏆 Победители:\n${winnerLines}`;

      const chatId = Number(g.published_chat_id);

      // Prefer editing the original announcement message (idempotent), fallback to sending a new one.
      const origMsgId = g.results_message_id ? null : g.published_message_id || null;

      let publishedId = null;

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

        const sent = await bot.api.sendMessage(chatId, body, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...replyParams,
        });

        publishedId = sent.message_id;
      }

      await db.updateGiveaway(g.id, {
        status: 'RESULTS_PUBLISHED',
        results_message_id: publishedId,
        results_published_at: new Date().toISOString(),
      });
      await db.auditGiveaway(g.id, g.workspace_id, null, 'gw.results_auto_published', {
        message_id: publishedId,
      });
      published.push(g.id);
    } catch {
      // skip individual failures
    }
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
      await db.setOfficialPostStatus(p.offer_id, 'EXPIRED');
      expired += 1;
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
          const kb = new InlineKeyboard().text('🎫 Brand Pass', 'a:brand_pass|ws:0');
          await bot.api.sendMessage(
            Number(tgId),
            `🎟 <b>Retry credit начислен</b>\n\nПо одному из интро не было ответа ${Number(
              CFG.INTRO_RETRY_AFTER_HOURS || 24
            )}ч — мы вернули тебе 1 Retry credit.\nДействует ${Number(
              CFG.INTRO_RETRY_EXPIRES_DAYS || 7
            )} дней и списывается автоматически при следующем интро.`,
            { parse_mode: 'HTML', reply_markup: kb }
          );
        }
      }
    } catch {
      // ignore one-off failures
    }
  }

  return { checked: rows.length, issued, expired };
}

export async function giveawaysTick() {
  const lockKey = k(['lock', 'giveaways_tick']);
  const startedAt = Date.now();

  return await withLock(lockKey, CRON_LOCK_TTL_SEC, async () => {
    const ended = await endDueGiveaways();
    const drawn = await autoDrawEnded();
    const published = await autoPublishDrawn();
    const official = await expireOfficialPosts();
    const retry = await issueIntroRetryCredits();
    const duration_ms = Date.now() - startedAt;

    return {
      ended,
      drawn,
      published_count: published.length,
      official,
      retry,
      ended_count: ended.length,
      drawn_count: drawn.length,
      official_expired: official.expired || 0,
      retry_issued: retry.issued || 0,
      retry_checked: retry.checked || 0,
      retry_expired: retry.expired || 0,
      duration_ms,
    };
  });
}

// =====================================================
// Broadcast tick: send one batch per invocation
// =====================================================
const BROADCAST_BATCH_SIZE = 25;
const BROADCAST_SEND_DELAY_MS = 50; // ~20 msg/sec

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendBroadcastMessage(api, tgId, bc) {
  const type = String(bc.draft_type || 'text');

  let btns = [];
  try {
    btns = bc.buttons_json ? JSON.parse(bc.buttons_json) : [];
  } catch {
    btns = [];
  }

  // Build inline keyboard from URL buttons
  let replyMarkup;
  if (btns.length) {
    const rows = btns
      .filter((b) => b && b.text && b.url)
      .map((b) => [{ text: b.text, url: b.url }]);
    if (rows.length) replyMarkup = { inline_keyboard: rows };
  }

  const opts = {};
  if (replyMarkup) opts.reply_markup = replyMarkup;

  if (type === 'text') {
    opts.parse_mode = 'HTML';
    await api.sendMessage(Number(tgId), bc.draft_text || '', opts);
    return;
  }

  if (bc.draft_caption) {
    opts.caption = bc.draft_caption;
    opts.parse_mode = 'HTML';
  }

  if (type === 'photo') {
    await api.sendPhoto(Number(tgId), bc.draft_file_id, opts);
  } else if (type === 'video') {
    await api.sendVideo(Number(tgId), bc.draft_file_id, opts);
  } else if (type === 'animation') {
    await api.sendAnimation(Number(tgId), bc.draft_file_id, opts);
  } else if (type === 'document') {
    await api.sendDocument(Number(tgId), bc.draft_file_id, opts);
  } else {
    // Fallback: text
    opts.parse_mode = 'HTML';
    await api.sendMessage(
      Number(tgId),
      bc.draft_text || bc.draft_caption || '(empty)',
      opts
    );
  }
}

export async function broadcastTick() {
  const lockKey = k(['lock', 'broadcast_tick']);

  return await withLock(lockKey, CRON_LOCK_TTL_SEC, async () => {
    const bc = await db.getActiveBroadcast();
    if (!bc) return { status: 'idle', reason: 'no_active_broadcast' };

    // Transition PENDING → RUNNING
    if (bc.status === 'PENDING') {
      await db.updateBroadcast(bc.id, {
        status: 'RUNNING',
        started_at: new Date().toISOString(),
      });
    }

    const lastUserId = Number(bc.last_sent_user_id || 0);
    const recipients = await db.listBroadcastUnsentRecipients(
      bc.id,
      bc.audience || 'all',
      BROADCAST_BATCH_SIZE,
      lastUserId
    );

    if (!recipients.length) {
      // No more recipients → DONE
      await db.updateBroadcast(bc.id, {
        status: 'DONE',
        finished_at: new Date().toISOString(),
      });

      // Notify admin
      try {
        const bot = getBot();
        const creator = await db.getUserById(bc.created_by_user_id);
        if (creator?.tg_id) {
          await bot.api.sendMessage(
            Number(creator.tg_id),
            `✅ <b>Рассылка #${bc.id} завершена</b>\n\n📊 Отправлено: ${bc.sent_count} / ${bc.total_count}\n❌ Ошибок: ${bc.failed_count}`,
            { parse_mode: 'HTML' }
          );
        }
      } catch {
        // ignore notification failure
      }

      return {
        status: 'done',
        broadcast_id: bc.id,
        sent: bc.sent_count,
        failed: bc.failed_count,
      };
    }

    const bot = getBot();
    let sent = 0;
    let failed = 0;
    let lastId = lastUserId;

    for (const recipient of recipients) {
      const uid = Number(recipient.user_id);
      const tgId = Number(recipient.tg_id);
      lastId = uid;

      try {
        await sendBroadcastMessage(bot.api, tgId, bc);
        await db.logBroadcastSent(bc.id, uid, 'sent');
        sent++;
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
          await db.logBroadcastSent(bc.id, uid, 'blocked');
          failed++;
        }
        // 429 = rate limit → stop batch early, retry next tick
        else if (code === 429) {
          const retryAfter = Number(err?.parameters?.retry_after || 5);
          console.error(`[BROADCAST] 429 rate limit, retry_after=${retryAfter}`);
          // Don't log as sent — will retry next tick
          break;
        }
        // Other errors → log as failed, continue
        else {
          console.error(`[BROADCAST] send error uid=${uid}`, desc);
          await db.logBroadcastSent(bc.id, uid, 'failed');
          failed++;
        }
      }

      // Throttle between messages
      if (BROADCAST_SEND_DELAY_MS > 0) await sleep(BROADCAST_SEND_DELAY_MS);
    }

    // Update counters
    await db.updateBroadcast(bc.id, {
      sent_count: Number(bc.sent_count || 0) + sent,
      failed_count: Number(bc.failed_count || 0) + failed,
      last_sent_user_id: lastId,
    });

    return {
      status: 'running',
      broadcast_id: bc.id,
      batch_sent: sent,
      batch_failed: failed,
      total_sent: Number(bc.sent_count || 0) + sent,
      total_count: bc.total_count,
    };
  });
}
