import { redis, k } from '../lib/redis.js';
import * as db from '../db/queries.js';
import { getBot } from './bot.js';
import { makeSeed, makeXorShift32, sampleWithoutReplacement } from './prng.js';
import { InlineKeyboard } from 'grammy';
import { CFG } from '../lib/config.js';
import { notifyGiveawayEnded, notifyGiveawayWinnersReady } from './gwNotify.js';

// Production-safe fixed cron parameters.
// Keep them deterministic and boring (Jobs), transparent (Vitalik), and reliable (Woz).
const CRON_LOCK_TTL_SEC = 55;
const CRON_END_BATCH = 50;
const CRON_DRAW_BATCH = 50;
const CRON_OFFICIAL_EXPIRE_BATCH = 50;
const CRON_RETRY_BATCH = 50;
const CRON_RETRY_EXPIRE_BATCH = 200;

async function withLock(lockKey, ttlSec, fn) {
  const ok = await redis.set(lockKey, '1', { nx: true, ex: ttlSec });
  if (!ok) return { locked: true };
  try {
    const r = await fn();
    return { locked: false, result: r };
  } finally {
    await redis.del(lockKey);
  }
}

async function endDueGiveaways(now = new Date()) {
  const due = await db.listGiveawaysToEnd(CRON_END_BATCH);
  const ended = [];
  for (const g of due) {
    await db.updateGiveaway(g.id, { status: 'ENDED' });
    await db.auditGiveaway(g.id, g.workspace_id, null, 'gw.ended', { manual: false, now: now.toISOString() });
    // Optional: notify owner (DM) / channel (opt-in) that contest ended.
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

    // Prefer eligible participants. If not enough, fall back to all entries (transparent in audit).
    const eligibleIds = await db.listEligibleUserIdsForGiveaway(g.id);
    let poolIds = eligibleIds;
    let fallback = false;
    if (!poolIds || poolIds.length === 0) {
      poolIds = await db.listAllUserIdsForGiveaway(g.id);
      fallback = true;
    }

    if (!poolIds || poolIds.length === 0) {
      await db.auditGiveaway(g.id, g.workspace_id, null, 'gw.winners_drawn_skipped', { reason: 'no_entries' });
      continue;
    }

    const endsAtIso = new Date(g.ends_at).toISOString();
    const { seed, seedHash, eligibleHash } = makeSeed({ giveawayId: g.id, endsAtIso, eligibleUserIds: eligibleIds || [] });
    const rnd = makeXorShift32(seed);

    const count = Math.min(Number(g.winners_count || 1), poolIds.length);
    const winnersUserIds = sampleWithoutReplacement(poolIds, count, rnd);

    await db.setWinners(g.id, winnersUserIds.map((uid, idx) => ({ userId: uid, place: idx + 1 })));
    await db.updateGiveaway(g.id, { status: 'WINNERS_DRAWN', winners_drawn_at: new Date().toISOString() });
    await db.auditGiveaway(g.id, g.workspace_id, null, 'gw.winners_drawn', {
      seedHash,
      eligibleHash,
      winners: winnersUserIds.length,
      used_pool: fallback ? 'all_entries' : 'eligible',
      eligible_count: eligibleIds?.length || 0,
      entries_pool_count: poolIds.length,
      requested_winners: Number(g.winners_count || 1),
    });

    drawn.push(g.id);

    // Notify owner (and optionally channel) that winners are ready.
    try {
      await notifyGiveawayWinnersReady({ api: bot.api, db, g, reason: 'auto_draw' });
    } catch {
      // ignore
    }
  }

  return drawn;
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
    rows = await db.listIntroThreadsForRetry(CRON_RETRY_BATCH, CFG.INTRO_RETRY_AFTER_HOURS);
  } catch (e) {
    // missing columns during rolling upgrades
    if (e && (e.code === '42703' || e.code === '42P01')) return { checked: 0, issued: 0, expired };
    throw e;
  }

  let issued = 0;

  for (const it of rows) {
    const threadId = Number(it.thread_id);
    const buyerUserId = Number(it.buyer_user_id);

    try {
      const r = await db.issueRetryCreditForThread(threadId, buyerUserId, CFG.INTRO_RETRY_EXPIRES_DAYS, 'no_reply');
      if (!r.issued) continue;

      issued += 1;
      db.trackEvent('retry_credit_issued', { userId: buyerUserId, wsId: null, meta: { threadId, offerId: Number(it.offer_id || 0) } });

      if (CFG.INTRO_RETRY_NOTIFY) {
        const u = await db.getUserTgIdByUserId(buyerUserId);
        const tgId = u?.tg_id;
        if (tgId) {
          const kb = new InlineKeyboard().text('🎫 Brand Pass', 'a:brand_pass|ws:0');
          await bot.api.sendMessage(
            Number(tgId),
            `🎟 <b>Retry credit начислен</b>

По одному из интро не было ответа ${Number(CFG.INTRO_RETRY_AFTER_HOURS || 24)}ч — мы вернули тебе 1 Retry credit.
Действует ${Number(CFG.INTRO_RETRY_EXPIRES_DAYS || 7)} дней и списывается автоматически при следующем интро.`,
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
    const official = await expireOfficialPosts();
    const retry = await issueIntroRetryCredits();
    const duration_ms = Date.now() - startedAt;
    return {
      ended,
      drawn,
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

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function sendBroadcastMessage(api, tgId, bc) {
  const type = String(bc.draft_type || 'text');
  const btns = bc.buttons_json ? JSON.parse(bc.buttons_json) : [];

  // Build inline keyboard from URL buttons
  let replyMarkup;
  if (btns.length) {
    const rows = btns.map((b) => [{ text: b.text, url: b.url }]);
    replyMarkup = { inline_keyboard: rows };
  }

  const opts = {};
  if (replyMarkup) opts.reply_markup = replyMarkup;

  if (type === 'text') {
    opts.parse_mode = 'HTML';
    await api.sendMessage(Number(tgId), bc.draft_text || '', opts);
  } else if (type === 'photo') {
    if (bc.draft_caption) { opts.caption = bc.draft_caption; opts.parse_mode = 'HTML'; }
    await api.sendPhoto(Number(tgId), bc.draft_file_id, opts);
  } else if (type === 'video') {
    if (bc.draft_caption) { opts.caption = bc.draft_caption; opts.parse_mode = 'HTML'; }
    await api.sendVideo(Number(tgId), bc.draft_file_id, opts);
  } else if (type === 'animation') {
    if (bc.draft_caption) { opts.caption = bc.draft_caption; opts.parse_mode = 'HTML'; }
    await api.sendAnimation(Number(tgId), bc.draft_file_id, opts);
  } else if (type === 'document') {
    if (bc.draft_caption) { opts.caption = bc.draft_caption; opts.parse_mode = 'HTML'; }
    await api.sendDocument(Number(tgId), bc.draft_file_id, opts);
  } else {
    // Fallback: text
    opts.parse_mode = 'HTML';
    await api.sendMessage(Number(tgId), bc.draft_text || bc.draft_caption || '(empty)', opts);
  }
}

export async function broadcastTick() {
  const lockKey = k(['lock', 'broadcast_tick']);

  return await withLock(lockKey, CRON_LOCK_TTL_SEC, async () => {
    const bc = await db.getActiveBroadcast();
    if (!bc) return { status: 'idle', reason: 'no_active_broadcast' };

    // Transition PENDING → RUNNING
    if (bc.status === 'PENDING') {
      await db.updateBroadcast(bc.id, { status: 'RUNNING', started_at: new Date().toISOString() });
    }

    const lastUserId = Number(bc.last_sent_user_id || 0);
    const recipients = await db.listBroadcastUnsentRecipients(
      bc.id, bc.audience || 'all', BROADCAST_BATCH_SIZE, lastUserId
    );

    if (!recipients.length) {
      // No more recipients → DONE
      await db.updateBroadcast(bc.id, { status: 'DONE', finished_at: new Date().toISOString() });
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
      } catch { /* ignore notification failure */ }
      return { status: 'done', broadcast_id: bc.id, sent: bc.sent_count, failed: bc.failed_count };
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
        if (code === 403 || code === 400 || desc.includes('bot was blocked') || desc.includes('chat not found') || desc.includes('user is deactivated')) {
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
