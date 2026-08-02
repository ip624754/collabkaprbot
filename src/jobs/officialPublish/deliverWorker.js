import { CFG } from '../../lib/config.js';
import { redis, k, incrWithExpireOnFirst } from '../../lib/redis.js';
import { queueOpsDigestSafe } from '../../lib/opsDigest.js';
import { getBot, deliverOfficialPublishReserved } from '../../bot/bot.js';
import {
  qstashPublishJSON,
  getQStashDeliveryUrl,
  qstashVerifySignature,
} from '../../lib/qstash.js';

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

function parseReserveEpoch(payload = {}) {
  try {
    const direct = Number(payload.reserveEpoch || payload.reserve_epoch || 0);
    if (Number.isFinite(direct) && direct > 0) return Math.trunc(direct);
  } catch {}
  try {
    const raw = String(payload.reserveAt || payload.reservedAt || payload.reserve_at || '').trim();
    if (!raw) return 0;
    const t = Date.parse(raw);
    if (!Number.isFinite(t) || t <= 0) return 0;
    return Math.floor(t / 1000);
  } catch {
    return 0;
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
    const url = getQStashDeliveryUrl('/api/qstash/official-publish-deliver');
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
      await redis.set(k(['qstash', 'official_publish_deliver', 'last_at']), new Date().toISOString(), { ex: 14 * 24 * 60 * 60 });
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
    const attempt = Number(payload.attempt || 0) || 0;
    const prevStatus = String(payload.prevStatus || payload.prev_status || 'PENDING').toUpperCase();
    const action = String(payload.action || 'publish').slice(0, 16) || 'publish';
    const reserveEpoch = parseReserveEpoch(payload);

    if (!offerId) {
      res.status(400).json({ ok: false, error: 'bad_payload' });
      return;
    }

    // When QStash retries too fast (or parallel deliveries happen), we prefer a delayed reschedule.
    const retryDelaySec = envInt('OFFICIAL_PUBLISH_DELIVER_RETRY_DELAY_SEC', 15, { min: 5, max: 120 });
    const maxAttempts = envInt('OFFICIAL_PUBLISH_DELIVER_MAX_ATTEMPTS', 5, { min: 1, max: 20 });

    const bot = getBot();

    let out;
    try {
      out = await deliverOfficialPublishReserved(bot.api, offerId, { prevStatus });
    } catch (e) {
      const msg = String(e?.message || e || 'error');
      console.error('[QSTASH][OFFICIAL] deliver error', msg);
      // Let QStash retry on hard errors.
      res.status(500).json({ ok: false, error: 'deliver_failed' });
      return;
    }

    if (out && out.locked && attempt < maxAttempts) {
      // Reschedule a delayed retry (best-effort). Never fail the current request.
      try {
        const deliverUrl = url;
        const minute = Math.floor(Date.now() / 60000);
        const base = reserveEpoch
          ? `offpd:${offerId}:${action}:r:${reserveEpoch}`
          : `offpd:${offerId}:${action}:m:${minute}`;
        const dedupId = `${base}:a:${attempt + 1}`;
        await qstashPublishJSON({
          url: deliverUrl,
          body: { ...payload, attempt: attempt + 1 },
          deduplicationId: dedupId,
          delaySec: retryDelaySec,
          retries: 5,
          timeout: '20s',
        });
        res.status(200).json({ ok: true, delayed: true, reason: 'locked', retry_after_sec: retryDelaySec });
        return;
      } catch (e) {
        // Redis-only visibility for operators (/api/health + admin banners).
        try {
          const day = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD UTC
          const ttlSec = 2 * 24 * 60 * 60;
          await incrWithExpireOnFirst(k(['ops', 'reasons', 'qstash_reschedule_failed', 'd', day]), ttlSec);
          await redis.set(k(['ops', 'reasons', 'qstash_reschedule_failed', 'last_at']), new Date().toISOString(), { ex: ttlSec });
          await redis.set(
            k(['ops', 'reasons', 'qstash_reschedule_failed', 'last_where']),
            'official-publish-deliver',
            { ex: ttlSec }
          );
          await redis.set(
            k(['ops', 'reasons', 'qstash_reschedule_failed', 'last_payload']),
            String(offerId || '').slice(0, 64),
            { ex: ttlSec }
          );
        } catch {}

        await queueOpsDigestSafe({
          group: 'ops',
          reason: 'qstash_reschedule_failed',
          title: 'Official publish deliver: delayed retry enqueue failed',
          kind: 'qstash_official',
          payload: String(offerId || ''),
          extra: [
            `attempt: ${attempt}`,
            `retryDelaySec: ${retryDelaySec}`,
            String(e?.name || 'Error') + ': ' + String(e?.message || e).slice(0, 180),
          ],
          dedupId: `offpd_resched:${offerId}:a:${attempt}`,
        });
        // Fall through: acknowledge without retry (self-heal will unlock).
      }
    }

    res.status(200).json({ ok: true, ...out, ws_id: wsId, attempt });
  } catch (e) {
    console.error('[QSTASH][OFFICIAL] deliver handler error', String(e?.message || e));
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
}
