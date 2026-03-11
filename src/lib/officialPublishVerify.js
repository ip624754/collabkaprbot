import { CFG } from './config.js';
import { redis, k, incrWithExpireOnFirst } from './redis.js';
import { queueOpsDigestSafe } from './opsDigest.js';
import * as db from '../db/queries.js';
import { getBot } from '../bot/bot.js';

function envInt(name, def, opts = {}) {
  const raw = process?.env?.[name];
  if (raw === undefined || raw === null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  let v = Math.trunc(n);
  if (opts.min !== undefined && v < opts.min) v = opts.min;
  if (opts.max !== undefined && v > opts.max) v = opts.max;
  return v;
}

export function officialPublishMsgIdKey(offerId) {
  return k(['official', 'pub', 'msgid', String(offerId)]);
}

function officialPublishNotifyKey(offerId) {
  return k(['official', 'selfheal', 'notify', String(offerId)]);
}

async function maybeNotifyAdmins(input = {}) {
  try {
    const admins = Array.isArray(CFG.SUPER_ADMIN_TG_IDS) ? CFG.SUPER_ADMIN_TG_IDS : [];
    if (!admins.length) return;

    const offerId = Number(input.offerId || 0);
    const wsId = Number(input.wsId || 0);
    if (!offerId) return;

    try {
      const key = officialPublishNotifyKey(offerId);
      const exists = await redis.get(key);
      if (exists) return;
      await redis.set(key, '1', { ex: 10 * 60 });
    } catch {
      return;
    }

    const offerTitle = String(input.offerTitle || '').trim();
    const ageSec = Number(input.ageSec || 0) || 0;
    const reason = String(input.reason || 'publish_stuck').trim();

    const head = '⚠️ <b>OFFICIAL: публикация зависла</b>';
    const offerLine = offerTitle
      ? `Оффер: <b>#${offerId} · ${offerTitle.slice(0, 64)}</b>`
      : `Оффер: <b>#${offerId}</b>`;
    const meta = `Причина: <code>${reason}</code>
Возраст: ~<b>${Math.round(ageSec)}</b>с`;
    const text = `${head}

${offerLine}
${meta}

<i>Статус сброшен в PENDING, чтобы не блокировать очередь. Если пост уже есть в канале — удали дубль вручную.</i>`;

    const kb = { inline_keyboard: [] };
    if (wsId) {
      kb.inline_keyboard.push([
        { text: '📣 Карточка', callback_data: `a:off_manage|ws:${wsId}|o:${offerId}|p:0` },
        { text: '📋 Очередь', callback_data: 'a:off_queue|p:0' },
      ]);
    }

    const bot = getBot();
    for (const a of admins) {
      const adminId = Number(a || 0);
      if (!adminId) continue;
      try {
        await bot.api.sendMessage(adminId, text, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...(kb.inline_keyboard.length ? { reply_markup: kb } : {}),
        });
      } catch {}
    }
  } catch {}
}

export async function verifyOfficialPublishState(input = {}) {
  const offerId = Number(input.offerId || input.offer_id || 0);
  const wsId = Number(input.wsId || input.ws_id || 0);
  const offerTitle = String(input.offerTitle || input.offer_title || '').trim();
  const channelChatId = Number(input.channelChatId || input.channel_chat_id || CFG.OFFICIAL_CHANNEL_ID || 0);
  const mode = String(input.mode || 'worker').toLowerCase();
  if (!offerId) return { ok: false, error: 'bad_payload' };

  const minAgeSec = envInt('OFFICIAL_PUBLISH_SELFHEAL_MIN_AGE_SEC', 75, { min: 20, max: 600 });
  const maxAttempts = envInt('OFFICIAL_PUBLISH_SELFHEAL_MAX_ATTEMPTS', 3, { min: 1, max: 10 });

  const post = await db.getOfficialPostByOfferId(offerId);
  const st = String(post?.status || 'NONE').toUpperCase();
  if (st !== 'PUBLISHING') {
    return { ok: true, skipped: true, reason: 'not_publishing', status: st };
  }

  let ageSec = 0;
  try {
    const updatedAt = new Date(post.updated_at).getTime();
    if (Number.isFinite(updatedAt) && updatedAt > 0) ageSec = Math.max(0, (Date.now() - updatedAt) / 1000);
  } catch {
    ageSec = 0;
  }

  const attempt = Number(input.attempt || 0) || 0;
  if (ageSec < minAgeSec) {
    return {
      ok: true,
      delayed: true,
      reason: 'too_fresh',
      age_sec: ageSec,
      min_age_sec: minAgeSec,
      should_reschedule: mode === 'worker' && attempt < maxAttempts,
      attempt,
      max_attempts: maxAttempts,
    };
  }

  let msgId = 0;
  try {
    msgId = Number(await redis.get(officialPublishMsgIdKey(offerId))) || 0;
  } catch {
    msgId = 0;
  }

  if (msgId > 0 && channelChatId) {
    try {
      const updated = await db.atomicAttachOfficialPostMessageId(offerId, {
        channelChatId,
        messageId: msgId,
      });
      if (updated) {
        try {
          const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const ttlSec = 2 * 24 * 60 * 60;
          await incrWithExpireOnFirst(k(['ops', 'reasons', 'official_publish_stuck', 'd', day]), ttlSec);
          await redis.set(k(['ops', 'reasons', 'official_publish_stuck', 'last_at']), new Date().toISOString(), { ex: ttlSec });
          await redis.set(k(['ops', 'reasons', 'official_publish_stuck', 'last_offer_id']), String(offerId), { ex: ttlSec });
          await redis.set(k(['ops', 'reasons', 'official_publish_stuck', 'last_age_sec']), String(Math.round(ageSec)), { ex: ttlSec });
          await redis.set(k(['ops', 'reasons', 'official_publish_stuck', 'last_via']), 'redis_msgid', { ex: ttlSec });
        } catch {}
        return { ok: true, healed: true, via: 'redis_msgid', message_id: msgId, age_sec: ageSec };
      }
    } catch {}
  }

  try {
    await db.setOfficialPostStatus(offerId, 'PENDING', {
      lastError: `selfheal_publish_stuck:age=${Math.round(ageSec)}s`,
    });
  } catch {}

  try {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const ttlSec = 2 * 24 * 60 * 60;
    await incrWithExpireOnFirst(k(['ops', 'reasons', 'official_publish_stuck', 'd', day]), ttlSec);
    await redis.set(k(['ops', 'reasons', 'official_publish_stuck', 'last_at']), new Date().toISOString(), { ex: ttlSec });
    await redis.set(k(['ops', 'reasons', 'official_publish_stuck', 'last_offer_id']), String(offerId), { ex: ttlSec });
    await redis.set(k(['ops', 'reasons', 'official_publish_stuck', 'last_age_sec']), String(Math.round(ageSec)), { ex: ttlSec });
    await redis.set(k(['ops', 'reasons', 'official_publish_stuck', 'last_via']), 'reset_pending', { ex: ttlSec });
  } catch {}

  if (mode === 'worker') {
    try {
      await maybeNotifyAdmins({ offerId, wsId, offerTitle, ageSec, reason: 'selfheal_publish_stuck' });
    } catch {}
  }

  try {
    await queueOpsDigestSafe({
      group: 'ops',
      reason: 'official_publish_check_now',
      title: mode === 'manual' ? 'Official publish check now' : 'Official publish verify self-heal',
      kind: 'official_publish_verify',
      payload: String(offerId || ''),
      extra: [
        `mode: ${mode}`,
        `via: reset_pending`,
        `ageSec: ${Math.round(ageSec)}`,
      ],
      dedupId: `offpv:${mode}:${offerId}:reset_pending`,
    });
  } catch {}

  return { ok: true, healed: true, via: 'reset_pending', age_sec: ageSec };
}
