import { igVerifyTick } from '../../src/bot/cron.js';
import { CFG, assertEnv } from '../../src/lib/config.js';

function getBearerToken(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || '';
  const s = String(h || '').trim();
  const m = s.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).end('Method Not Allowed');
      return;
    }

    res.setHeader('Cache-Control', 'no-store');

    if (!CFG.CRON_SECRET) {
      res.status(500).json({ ok: false, error: 'cron_secret_missing' });
      return;
    }

    const token = getBearerToken(req);
    if (!token || token !== String(CFG.CRON_SECRET)) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }

    assertEnv();

    const r = await igVerifyTick();
    res.status(200).json({ ok: true, ...r });
  } catch (e) {
    console.error('[IG-VERIFY-CRON] error', e);
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
}
