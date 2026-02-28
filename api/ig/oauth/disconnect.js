import { CFG } from '../../../src/lib/config.js';
import { redis, k } from '../../../src/lib/redis.js';
import * as db from '../../../src/db/queries.js';

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');

    // Kill-switch: if IG OAuth UI is hidden, the OAuth routes must be closed too.
    if (!CFG.IG_OAUTH_UI_ENABLED) {
      res.status(404).end('not_found');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).end('Method Not Allowed');
      return;
    }

    if (!CFG.IG_OAUTH_ENABLED) {
      res.status(503).json({ ok: false, error: 'disabled' });
      return;
    }

    const t = String(req.query?.t || '').trim();
    if (!t) { res.status(400).json({ ok: false, error: 'missing_t' }); return; }

    const payload = await redis.get(k(['ig_oauth_t', t]));
    if (!payload?.wsId) { res.status(410).json({ ok: false, error: 'expired' }); return; }

    await db.deleteIgOAuthAccount(payload.wsId);
    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
}
