import { getSession, isAdminWebReady } from '../../../src/lib/adminWeb/auth.js';
import { json } from '../../../src/lib/adminWeb/common.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  if (!isAdminWebReady()) return json(res, 503, { ok: false, error: 'admin_web_not_configured' });
  const session = await getSession(req);
  if (!session) return json(res, 401, { ok: false, error: 'unauthorized' });
  return json(res, 200, { ok: true, session: { actorTgId: Number(session.actorTgId || 0) || 0, expiresAt: session.expiresAt || 0, issuedAt: session.issuedAt || 0 } });
}
