import { redis, k } from '../../src/lib/redis.js';
import { getQStashDeliveryUrl, qstashVerifySignature } from '../../src/lib/qstash.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

function getHeader(req, name) {
  const n = String(name || '').toLowerCase();
  const h = req.headers || {};
  for (const kk of Object.keys(h)) {
    if (String(kk).toLowerCase() === n) return h[kk];
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

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).end('Method Not Allowed');
      return;
    }

    const rawBody = await readRawBody(req);

    // Verify signature (QStash -> our endpoint)
    const signature = getHeader(req, 'Upstash-Signature');

    const url = getQStashDeliveryUrl('/api/qstash/ping');
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

    let payload = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      payload = {};
    }

    const nowIso = new Date().toISOString();
    const nonce = String(payload.nonce || '').slice(0, 128);
    const byTgId = Number(payload.by_tg_id || payload.by || 0) || 0;

    // Redis-only breadcrumb for ops panel.
    try {
      await redis.set(k(['qstash', 'ping', 'last_at']), nowIso, { ex: 14 * 24 * 60 * 60 });
      if (nonce) await redis.set(k(['qstash', 'ping', 'last_nonce']), nonce, { ex: 14 * 24 * 60 * 60 });
      if (byTgId) await redis.set(k(['qstash', 'ping', 'last_by_tg_id']), String(byTgId), { ex: 14 * 24 * 60 * 60 });
    } catch {
      // ignore
    }

    res.status(200).json({ ok: true, at: nowIso, nonce });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || 'error') });
  }
}
