
import { redis, k } from '../lib/redis.js';
import * as db from '../db/queries.js';
import { getBot } from './bot.js';
import { InlineKeyboard } from 'grammy';
import { CFG } from '../lib/config.js';
import { notifyGiveawayEnded, notifyGiveawayWinnersReady, notifyGiveawayWinnersDM } from './gwNotify.js';

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
    return await fn();
  } finally {
    await redis.del(lockKey);
  }
}

async function withGiveawayLock(giveawayId, fn) {
  const lockKey = k(['lock', 'gw', 'draw', giveawayId]);
  const ok = await redis.set(lockKey, '1', { nx: true, ex: 300 });
  if (!ok) return { skipped: true };
  try {
    return await fn();
  } finally {
    await redis.del(lockKey);
  }
}

async function endDueGiveaways(now = new Date()) {
  const due = await db.listGiveawaysToEnd(CRON_END_BATCH);
  const ended = [];

  for (const g of due) {
    await db.updateGiveaway(g.id, { status: 'ENDED' });
    await db.auditGiveaway(g.id, g.workspace_id, null, 'gw.ended', {
      manual: false,
      now: now.toISOString()
    });

    try {
      const api = getBot().api;
      await notifyGiveawayEnded({ api, db, g, reason: 'time' });
    } catch {}

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

    await withGiveawayLock(g.id, async () => {

      // Idempotency guard — skip if already drawn
      if (g.winners_drawn_at) return;

      const endsAtIso = new Date(g.ends_at).toISOString();

      let winnersUserIds = await db.drawWinnersDeterministic(
        g.id,
        Number(g.winners_count || 1),
        endsAtIso,
        true
      );

      let usedPool = 'eligible';

      if (!winnersUserIds.length) {
        winnersUserIds = await db.drawWinnersDeterministic(
          g.id,
          Number(g.winners_count || 1),
          endsAtIso,
          false
        );
        usedPool = 'all_entries';
      }

      if (!winnersUserIds.length) {
        await db.auditGiveaway(g.id, g.workspace_id, null, 'gw.winners_drawn_skipped', {
          reason: 'no_entries'
        });
        return;
      }

      await db.setWinners(
        g.id,
        winnersUserIds.map((uid, idx) => ({
          userId: uid,
          place: idx + 1
        }))
      );

      await db.updateGiveaway(g.id, {
        status: 'WINNERS_DRAWN',
        winners_drawn_at: new Date().toISOString()
      });

      await db.auditGiveaway(g.id, g.workspace_id, null, 'gw.winners_drawn', {
        seed: `${g.id}:${endsAtIso}`,
        winners: winnersUserIds.length,
        used_pool: usedPool,
        requested_winners: Number(g.winners_count || 1)
      });

      drawn.push(g.id);

      try {
        await notifyGiveawayWinnersReady({ api: bot.api, db, g, reason: 'auto_draw' });
      } catch {}

      try {
        await notifyGiveawayWinnersDM({ api: bot.api, db, gwId: g.id, reason: 'auto_draw' });
      } catch {}

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

      const winnerLines = winners.map(w => {
        const name = w.username ? `@${w.username}` : `tg:${w.tg_id}`;
        return `${w.place}. ${name}`;
      }).join('\\n');

      const body = `🏁 <b>Итоги конкурса</b>\\n\\n🏆 Победители:\\n${winnerLines}`;

      const chatId = Number(g.published_chat_id);
      const origMsgId = g.results_message_id ? null : (g.published_message_id || null);

      let publishedId = null;

      if (origMsgId) {
        try {
          await bot.api.editMessageText(chatId, Number(origMsgId), body, { parse_mode: 'HTML' });
          publishedId = Number(origMsgId);
        } catch {}
      }

      if (!publishedId) {
        const sent = await bot.api.sendMessage(chatId, body, {
          parse_mode: 'HTML',
          disable_web_page_preview: true
        });
        publishedId = sent.message_id;
      }

      await db.updateGiveaway(g.id, {
        status: 'RESULTS_PUBLISHED',
        results_message_id: publishedId,
        results_published_at: new Date().toISOString()
      });

      await db.auditGiveaway(g.id, g.workspace_id, null, 'gw.results_auto_published', {
        message_id: publishedId
      });

      published.push(g.id);

    } catch {}
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
          '⌛️ <b>Размещение истекло</b>\\n\\nЭтот пост больше не находится в активном слоте.',
          { parse_mode: 'HTML' }
        );
      }
    } catch {}

    try {
      await db.setOfficialPostStatus(p.offer_id, 'EXPIRED');
      expired++;
    } catch {}
  }

  return { expired };
}

async function issueIntroRetryCredits() {
  if (!CFG.INTRO_RETRY_ENABLED) return { checked: 0, issued: 0, expired: 0 };

  const bot = getBot();

  let expired = 0;
  try {
    expired = await db.expireRetryCredits(CRON_RETRY_EXPIRE_BATCH);
  } catch {}

  let rows = [];
  try {
    rows = await db.listIntroThreadsForRetry(CRON_RETRY_BATCH, CFG.INTRO_RETRY_AFTER_HOURS);
  } catch {
    return { checked: 0, issued: 0, expired };
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

      issued++;

      if (CFG.INTRO_RETRY_NOTIFY) {
        const u = await db.getUserTgIdByUserId(buyerUserId);
        const tgId = u?.tg_id;

        if (tgId) {
          const kb = new InlineKeyboard().text('🎫 Brand Pass', 'a:brand_pass|ws:0');

          await bot.api.sendMessage(
            Number(tgId),
            `🎟 <b>Retry credit начислен</b>`,
            { parse_mode: 'HTML', reply_markup: kb }
          );
        }
      }

    } catch {}
  }

  return { checked: rows.length, issued, expired };
}

export async function giveawaysTick() {
  const lockKey = k(['lock', 'giveaways_tick']);

  return await withLock(lockKey, CRON_LOCK_TTL_SEC, async () => {
    const ended = await endDueGiveaways();
    const drawn = await autoDrawEnded();
    const published = await autoPublishDrawn();
    const official = await expireOfficialPosts();
    const retry = await issueIntroRetryCredits();

    return {
      ended_count: ended.length,
      drawn_count: drawn.length,
      published_count: published.length,
      official_expired: official.expired || 0,
      retry_issued: retry.issued || 0
    };
  });
}
