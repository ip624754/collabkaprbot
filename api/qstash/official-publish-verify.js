import { CFG } from '../../src/lib/config.js';
import { redis, k } from '../../src/lib/redis.js';
import * as db from '../../src/db/queries.js';
import { getBot } from '../../src/bot/bot.js';
import {
  qstashPublishJSON,
  getQStashDeliveryUrl,
  qstashVerifySignature,
} from '../../src/lib/qstash.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

function getHeader(req, name) {
  const n = String(name || '').toLowerCase();
  const h = req.headers || {};
  for (const k2 of Object.keys(h)) {
    if (String(k2).toLowerCase() === n) return h[k2];
  }
  return undefined;
}

async function readRawBody(req, limitBytes = 256 * 1024) {
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

function officialPublishMsgIdKey(offerId) {
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

    // Rate limit per offer.
    try {
      const key = officialPublishNotifyKey(offerId);
      const exists = await redis.get(key);
      if (exists) return;
      await redis.set(key, '1', { ex: 10 * 60 });
    } catch {
      // If Redis is down, just skip notifications (never fail the worker).
      return;
    }

    const offerTitle = String(input.offerTitle || '').trim();
    const ageSec = Number(input.ageSec || 0) || 0;
    const reason = String(input.reason || 'publish_stuck').trim();

    const head = '⚠️ <b>OFFICIAL: публикация зависла</b>';
    const offerLine = offerTitle
      ? `Оффер: <b>#${offerId} · ${offerTitle.slice(0, 64)}</b>`
      : `Оффер: <b>#${offerId}</b>`;
    const meta = `Причина: <code>${reason}</code>\nВозраст: ~<b>${Math.round(ageSec)}</b>с`;

    const text = `${head}\n\n${offerLine}\n${meta}\n\n<i>Статус сброшен в PENDING, чтобы не блокировать очередь. Если пост уже есть в канале — удали дубль вручную.</i>`;

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
      } catch {
        // ignore per-admin
      }
    }
  } catch {
    // never fail
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).end('Method Not Allowed');
      return;
    }

    const rawBody = await readRawBody(req);

    // Verify signature
    const signature = getHeader(req, 'Upstash-Signature');
    const url = getQStashDeliveryUrl('/api/qstash/official-publish-verify');
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

    // Breadcrumb for /api/health (Redis-only).
    try {
      await redis.set(k(['qstash', 'official_publish_verify', 'last_at']), new Date().toISOString(), { ex: 14 * 24 * 60 * 60 });
    } catch {}

    let payload;
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      res.status(400).json({ ok: false, error: 'bad_json' });
      return;
    }

    const offerId = Number(payload.offerId || payload.offer_id || 0);
    const wsId = Number(payload.wsId || payload.ws_id || 0);
    const offerTitle = String(payload.offerTitle || payload.offer_title || '').trim();
    const attempt = Number(payload.attempt || 0) || 0;
    const channelChatId = Number(payload.channelChatId || payload.channel_chat_id || CFG.OFFICIAL_CHANNEL_ID || 0);

    if (!offerId) {
      res.status(400).json({ ok: false, error: 'bad_payload' });
      return;
    }

    const minAgeSec = envInt('OFFICIAL_PUBLISH_SELFHEAL_MIN_AGE_SEC', 75, { min: 20, max: 600 });
    const retryDelaySec = envInt('OFFICIAL_PUBLISH_SELFHEAL_RETRY_DELAY_SEC', 45, { min: 10, max: 300 });
    const maxAttempts = envInt('OFFICIAL_PUBLISH_SELFHEAL_MAX_ATTEMPTS', 3, { min: 1, max: 10 });

    const post = await db.getOfficialPostByOfferId(offerId);
    const st = String(post?.status || 'NONE').toUpperCase();
    if (st !== 'PUBLISHING') {
      res.status(200).json({ ok: true, skipped: true, reason: 'not_publishing', status: st });
      return;
    }

    let ageSec = 0;
    try {
      const updatedAt = new Date(post.updated_at).getTime();
      if (Number.isFinite(updatedAt) && updatedAt > 0) ageSec = Math.max(0, (Date.now() - updatedAt) / 1000);
    } catch {
      ageSec = 0;
    }

    // Too fresh: reschedule once (avoid racing with an in-flight publish).
    if (ageSec < minAgeSec && attempt < maxAttempts) {
      try {
        const url2 = getQStashDeliveryUrl('/api/qstash/official-publish-verify');
        const dedupId = `offpv:${offerId}:a:${attempt + 1}`;
        await qstashPublishJSON({
          url: url2,
          body: { ...payload, attempt: attempt + 1 },
          deduplicationId: dedupId,
          delaySec: retryDelaySec,
          retries: 3,
          timeout: '20s',
        });
      } catch {
        // ignore reschedule failures
      }
      res.status(200).json({ ok: true, delayed: true, age_sec: ageSec, min_age_sec: minAgeSec });
      return;
    }

    // Try to attach message_id from Redis breadcrumb (channel_post/selfheal path).
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
          res.status(200).json({ ok: true, healed: true, via: 'redis_msgid', message_id: msgId });
          return;
        }
      } catch {
        // fall through to status reset
      }
    }

    // Final fallback: reset to PENDING to unblock UI (manual republish if needed).
    try {
      await db.setOfficialPostStatus(offerId, 'PENDING', {
        lastError: `selfheal_publish_stuck:age=${Math.round(ageSec)}s`,
      });
    } catch {
      // ignore
    }

    await maybeNotifyAdmins({ offerId, wsId, offerTitle, ageSec, reason: 'selfheal_publish_stuck' });

    res.status(200).json({ ok: true, healed: true, via: 'reset_pending', age_sec: ageSec });
  } catch (e) {
    console.error('[QSTASH][OFFICIAL] verify error', String(e?.message || e));
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
}
