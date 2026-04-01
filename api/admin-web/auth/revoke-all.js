import { appendAdminWebAudit, requireSession, revokeAllSessions } from '../../../src/lib/adminWeb/auth.js';
import { json } from '../../../src/lib/adminWeb/common.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  const session = await requireSession(req, res);
  if (!session) return;
  const result = await revokeAllSessions();
  if (result.ok) {
    await appendAdminWebAudit({ section: 'auth', action: 'revoke_all', actorTgId: session.actorTgId, targetType: 'session', targetId: 'all' });
  }
  return json(res, result.ok ? 200 : 500, result);
}
