import { redis, k, acquireLock, releaseLock } from '../lib/redis.js';
import * as db from '../db/queries.js';
import { getBot } from './bot.js';
import { InlineKeyboard } from 'grammy';
import { CFG } from '../lib/config.js';
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

async function writeCronLastRun(name, payload) {
  try {
    const key = k(['cron', String(name || 'tick'), 'last_run']);
    await redis.set(key, payload, { ex: CRON_LAST_RUN_TTL_SEC });
  } catch {
    // ignore metrics failures
  }
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

      if (!r || r.status !== 'drawn') {
        // locked / wrong_status / already_drawn / no_entries
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

        // Atomic: claim publish only if still WINNERS_DRAWN (prevents double-post)
        const claimed = await db.atomicPublishGiveawayResults(g.id, publishedId);
        if (!claimed) return; // another tick already published

        await db.auditGiveaway(g.id, g.workspace_id, null, 'gw.results_auto_published', {
          message_id: publishedId,
        });
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
          const kb = new InlineKeyboard().text('🎫 Brand Pass', 'a:brand_pass|ws:0');
          await withTimeout(
            bot.api.sendMessage(
              Number(tgId),
              `🎟 <b>Retry credit начислен</b>

По одному из интро не было ответа ${Number(
                CFG.INTRO_RETRY_AFTER_HOURS || 24
              )}ч — мы вернули тебе 1 Retry credit.
Действует ${Number(
                CFG.INTRO_RETRY_EXPIRES_DAYS || 7
              )} дней и списывается автоматически при следующем интро.`,
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

    // Keep the API response stable; write only a compact summary to Redis.
    const out = {
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

    await writeCronLastRun('giveaways_tick', {
      ts: new Date().toISOString(),
      ended_count: out.ended_count,
      drawn_count: out.drawn_count,
      published_count: out.published_count,
      official_expired: out.official_expired,
      retry_checked: out.retry_checked,
      retry_issued: out.retry_issued,
      retry_expired: out.retry_expired,
      duration_ms: out.duration_ms,
    });

    return out;
  });
}

// =====================================================
// Broadcast tick: send one batch per invocation
// =====================================================
const BROADCAST_BATCH_SIZE = 25;
const BROADCAST_SEND_DELAY_MS = 50; // ~20 msg/sec
// When Telegram returns 429, we respect retry_after and avoid hammering.
// Stored in Redis only (no DB) to keep Neon cheap.
const BROADCAST_COOLDOWN_PAD_SEC = 30;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function broadcastCooldownKey(broadcastId) {
  return k(['broadcast', String(broadcastId), 'cooldown_until']);
}

async function getBroadcastCooldownUntilMs(broadcastId) {
  try {
    const v = await redis.get(broadcastCooldownKey(broadcastId));
    const ms = v ? Number(v) : 0;
    return Number.isFinite(ms) ? ms : 0;
  } catch {
    return 0;
  }
}

async function setBroadcastCooldown(broadcastId, retryAfterSec) {
  const now = Date.now();
  const safeSec = Math.max(1, Math.min(3600, Number(retryAfterSec || 0) || 0));
  const proposedUntil = now + safeSec * 1000;
  const key = broadcastCooldownKey(broadcastId);

  try {
    const cur = await redis.get(key);
    let curMs = cur ? Number(cur) : 0;
    if (!Number.isFinite(curMs)) curMs = 0;
    const finalUntil = Math.max(curMs, proposedUntil);
    const ttlSec = Math.max(
      5,
      Math.ceil((finalUntil - now) / 1000) + BROADCAST_COOLDOWN_PAD_SEC
    );
    await redis.set(key, String(finalUntil), { ex: ttlSec });
    return finalUntil;
  } catch {
    // Best-effort: even if Redis fails, we still break the batch on 429.
    return proposedUntil;
  }
}

function extractRetryAfterSec(err) {
  const a = err?.parameters?.retry_after;
  const b = err?.response?.parameters?.retry_after;
  const c = err?.response?.body?.parameters?.retry_after;
  const v = Number(a ?? b ?? c);
  return Number.isFinite(v) && v > 0 ? v : 5;
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
    const flat = btns
      .filter((b) => b && b.text && b.url)
      .slice(0, 3)
      .map((b) => ({ text: String(b.text).slice(0, 64), url: String(b.url).slice(0, 2048) }));

    const rows = [];
    for (let i = 0; i < flat.length; i += 2) {
      rows.push(flat.slice(i, i + 2));
      if (rows.length >= 2) break;
    }

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
    if (!bc) {
      const out = { status: 'idle', reason: 'no_active_broadcast' };
      await writeCronLastRun('broadcast_tick', { ts: new Date().toISOString(), ...out });
      return out;
    }

    // Redis-only cooldown on 429. Prevents hammering and smooths delivery.
    const cooldownUntilMs = await getBroadcastCooldownUntilMs(bc.id);
    if (cooldownUntilMs && cooldownUntilMs > Date.now()) {
      const retry_after_sec = Math.max(
        1,
        Math.ceil((cooldownUntilMs - Date.now()) / 1000)
      );
      const out = {
        status: 'skip',
        reason: 'cooldown',
        broadcast_id: bc.id,
        retry_after_sec,
        cooldown_until: new Date(cooldownUntilMs).toISOString(),
      };
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
    }

    const lastUserId = Number(bc.last_sent_user_id || 0);
    const recipients = await db.listBroadcastUnsentRecipients(
      bc.id,
      bc.audience || 'all',
      BROADCAST_BATCH_SIZE,
      lastUserId
    );

    if (!recipients.length) {
      // Atomic: No more recipients → DONE (prevents double-finish on lock expiry)
      const done = await db.atomicTransitionBroadcast(bc.id, 'RUNNING', 'DONE', {
        finished_at: new Date().toISOString(),
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
            .text('⬅️ Админка', 'a:admin_home');

          await bot.api.sendMessage(
            Number(creator.tg_id),
            `✅ <b>Рассылка #${bc.id} завершена</b>\n\n📊 Отправлено: ${bc.sent_count} / ${bc.total_count}\n❌ Ошибок: ${bc.failed_count}`,
            { parse_mode: 'HTML', reply_markup: kb }
          );
        }
      } catch {
        // ignore notification failure
      }

      const out = {
        status: 'done',
        broadcast_id: bc.id,
        sent: bc.sent_count,
        failed: bc.failed_count,
      };
      await writeCronLastRun('broadcast_tick', { ts: new Date().toISOString(), ...out });
      return out;
    }

    const bot = getBot();
    let sent = 0;
    let failed = 0;
    let lastId = lastUserId;
    let cooldownSetSec = 0;

    for (const recipient of recipients) {
      const uid = Number(recipient.user_id);
      const tgId = Number(recipient.tg_id);

      // Advance cursor only after we have *logged* an outcome for this uid.
      // Important for 429: if rate-limited, we must NOT advance or the uid can be skipped forever.
      let advanced = false;

      try {
        await sendBroadcastMessage(bot.api, tgId, bc);
        await db.logBroadcastSent(bc.id, uid, 'sent');
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
          await db.logBroadcastSent(bc.id, uid, 'blocked');
          failed++;
          advanced = true;
        }
        // 429 = rate limit → stop batch early, retry next tick
        else if (code === 429) {
          const retryAfter = extractRetryAfterSec(err);
          cooldownSetSec = retryAfter;
          await setBroadcastCooldown(bc.id, retryAfter);
          console.error(`[BROADCAST] 429 rate limit, retry_after=${retryAfter}`);
          // Don't log as sent — will retry next tick
          break;
        }
        // Other errors → log as failed, continue
        else {
          console.error(`[BROADCAST] send error uid=${uid}`, desc);
          await db.logBroadcastSent(bc.id, uid, 'failed');
          failed++;
          advanced = true;
        }
      }

      if (advanced) lastId = uid;

      // Throttle between messages
      if (BROADCAST_SEND_DELAY_MS > 0) await sleep(BROADCAST_SEND_DELAY_MS);
    }

    // Update counters
    await db.updateBroadcast(bc.id, {
      sent_count: Number(bc.sent_count || 0) + sent,
      failed_count: Number(bc.failed_count || 0) + failed,
      last_sent_user_id: lastId,
    });

    const out = {
      status: 'running',
      broadcast_id: bc.id,
      batch_sent: sent,
      batch_failed: failed,
      total_sent: Number(bc.sent_count || 0) + sent,
      total_count: bc.total_count,
      ...(cooldownSetSec ? { cooldown_sec: cooldownSetSec } : {}),
    };
    await writeCronLastRun('broadcast_tick', { ts: new Date().toISOString(), ...out });
    return out;
  });
}
