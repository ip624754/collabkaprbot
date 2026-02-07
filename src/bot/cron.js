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
