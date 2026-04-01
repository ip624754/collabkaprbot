import { appendAdminWebAudit, requireSession } from '../src/lib/adminWeb/auth.js';
import { json, readJsonBody } from '../src/lib/adminWeb/common.js';
import { clearAdminUserNote, getAdminUserNote, setAdminUserNote } from '../src/lib/adminWeb/notes.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  const session = await requireSession(req, res);
  if (!session) return;
  const body = await readJsonBody(req);
  const action = String(req.query?.action || body.action || '').trim().toLowerCase();

  if (action === 'set_note' || action === 'clear_note') {
    const userId = Number(body.userId || 0) || 0;
    if (!userId) return json(res, 400, { ok: false, error: 'user_id_required' });
    const oldNote = await getAdminUserNote(userId);
    if (action === 'clear_note') {
      const ok = await clearAdminUserNote(userId);
      if (!ok) return json(res, 500, { ok: false, error: 'clear_failed' });
      await appendAdminWebAudit({ section: 'users', action: 'clear_note', actorTgId: session.actorTgId, targetType: 'user', targetId: String(userId), reason: 'web_admin' });
      return json(res, 200, { ok: true });
    }
    const text = String(body.text || '').trim();
    if (!text) return json(res, 400, { ok: false, error: 'note_text_required' });
    const ok = await setAdminUserNote(userId, text, { byAdminTgId: session.actorTgId, byAdminUsername: '' });
    if (!ok) return json(res, 500, { ok: false, error: 'set_failed' });
    await appendAdminWebAudit({ section: 'users', action: 'set_note', actorTgId: session.actorTgId, targetType: 'user', targetId: String(userId), reason: oldNote?.text ? 'update' : 'create' });
    return json(res, 200, { ok: true });
  }

  return json(res, 400, { ok: false, error: 'unknown_action' });
}
