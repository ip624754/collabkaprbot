import { CFG } from '../../../src/lib/config.js';
import { redis, k } from '../../../src/lib/redis.js';
import * as db from '../../../src/db/queries.js';

function parseJsonb(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(String(raw)); } catch { return {}; }
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');

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

    // 1) Remove OAuth binding/tokens.
    await db.deleteIgOAuthAccount(payload.wsId);

    // 2) Remove verified badge in workspace profile_contacts (keep handle as-is).
    try {
      const ws = await db.getWorkspaceAny(payload.wsId);
      if (ws) {
        const o = parseJsonb(ws.profile_contacts);
        const ig0 = (o.ig && typeof o.ig === 'object') ? { ...o.ig } : {};
        delete ig0.verified;
        delete ig0.verified_at;
        delete ig0.verified_method;
        delete ig0.graph;
        if (Object.keys(ig0).length) o.ig = ig0; else delete o.ig;

        const nextV = Math.max(1, Number(ws.profile_contacts_v || 0) + 1);
        await db.setWorkspaceSetting(payload.wsId, { profile_contacts: o, profile_contacts_v: nextV });
        try { await db.auditWorkspace(payload.wsId, Number(ws.owner_user_id || 0), 'ws.ig_oauth_disconnected', {}); } catch {}
      }
    } catch {}

    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
}
