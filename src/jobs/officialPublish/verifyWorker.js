import { CFG } from '../../lib/config.js';
import { redis, k, incrWithExpireOnFirst } from '../../lib/redis.js';
import { queueOpsDigestSafe } from '../../lib/opsDigest.js';
import { verifyOfficialPublishState } from '../../lib/officialPublishVerify.js';
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

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).end('Method Not Allowed');
      return;
    }

    const rawBody = await readRawBody(req);
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
      if (code === 'qstash_lib_missing') return res.status(503).json({ ok: false, error: 'qstash_disabled' });
      if (code === 'qstash_signature_missing') return res.status(401).json({ ok: false, error: 'signature_missing' });
      if (code === 'qstash_invalid_signature') return res.status(401).json({ ok: false, error: 'invalid_signature' });
      return res.status(500).json({ ok: false, error: code });
    }

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
    if (!offerId) {
      res.status(400).json({ ok: false, error: 'bad_payload' });
      return;
    }

    const attempt = Number(payload.attempt || 0) || 0;
    const retryDelaySec = envInt('OFFICIAL_PUBLISH_SELFHEAL_RETRY_DELAY_SEC', 45, { min: 10, max: 300 });
    const result = await verifyOfficialPublishState({ ...payload, mode: 'worker' });

    if (result?.reason === 'too_fresh' && result?.should_reschedule) {
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
      } catch (e) {
        try {
          const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const ttlSec = 2 * 24 * 60 * 60;
          await incrWithExpireOnFirst(k(['ops', 'reasons', 'qstash_reschedule_failed', 'd', day]), ttlSec);
          await redis.set(k(['ops', 'reasons', 'qstash_reschedule_failed', 'last_at']), new Date().toISOString(), { ex: ttlSec });
          await redis.set(k(['ops', 'reasons', 'qstash_reschedule_failed', 'last_where']), 'official-publish-verify', { ex: ttlSec });
          await redis.set(k(['ops', 'reasons', 'qstash_reschedule_failed', 'last_payload']), String(offerId || '').slice(0, 64), { ex: ttlSec });
        } catch {}
        try {
          await queueOpsDigestSafe({
            group: 'ops',
            reason: 'qstash_reschedule_failed',
            title: 'Official publish verify: retry enqueue failed',
            kind: 'qstash_official_verify',
            payload: String(offerId || ''),
            extra: [
              `attempt: ${attempt}`,
              `retryDelaySec: ${retryDelaySec}`,
              String(e?.name || 'Error') + ': ' + String(e?.message || e).slice(0, 180),
            ],
            dedupId: `offpv_resched:${offerId}:a:${attempt}`,
          });
        } catch {}
      }
      res.status(200).json({ ok: true, delayed: true, age_sec: result.age_sec, min_age_sec: result.min_age_sec });
      return;
    }

    res.status(200).json(result);
  } catch (e) {
    console.error('[QSTASH][OFFICIAL] verify error', String(e?.message || e));
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
}
