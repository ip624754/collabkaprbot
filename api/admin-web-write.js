import { appendAdminWebAudit, requireSession } from '../src/lib/adminWeb/auth.js';
import { getSearchParam, json, readJsonBody } from '../src/lib/adminWeb/common.js';
import { clearAdminUserNote, getAdminUserNote, setAdminUserNote } from '../src/lib/adminWeb/notes.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  const session = await requireSession(req, res);
  if (!session) return;

  const body = await readJsonBody(req);
  const action = String(getSearchParam(req, 'action', body.action || '') || body.action || '').trim().toLowerCase();

  if (action === 'set_note' || action === 'clear_note') {
    const userId = Number(body.userId || 0) || 0;
    if (!userId) return json(res, 400, { ok: false, error: 'user_id_required' });

    const oldNote = await getAdminUserNote(userId);
    const oldJson = oldNote
      ? {
          text: oldNote.text || '',
          updatedAt: oldNote.updatedAt || '',
          byAdminTgId: Number(oldNote.byAdminTgId || 0) || 0,
        }
      : null;

    const nextText = String(body.text || '').replace(/\r/g, '').trim();

    if (action === 'clear_note' || !nextText) {
      const ok = await clearAdminUserNote(userId);
      if (!ok) return json(res, 500, { ok: false, error: 'clear_failed' });
      await appendAdminWebAudit({
        section: 'users',
        action: 'clear_user_note',
        actorTgId: session.actorTgId,
        targetType: 'user',
        targetId: String(userId),
        reason: oldNote?.text ? 'clear' : 'normalize_blank',
        oldJson,
        newJson: null,
      });
      return json(res, 200, { ok: true });
    }

    const ok = await setAdminUserNote(userId, nextText, {
      byAdminTgId: session.actorTgId,
      byAdminUsername: '',
    });
    if (!ok) return json(res, 500, { ok: false, error: 'set_failed' });

    await appendAdminWebAudit({
      section: 'users',
      action: 'set_user_note',
      actorTgId: session.actorTgId,
      targetType: 'user',
      targetId: String(userId),
      reason: oldNote?.text ? 'update' : 'create',
      oldJson,
      newJson: {
        text: nextText,
        byAdminTgId: Number(session.actorTgId || 0) || 0,
      },
    });
    return json(res, 200, { ok: true });
  }

  return json(res, 400, { ok: false, error: 'unknown_action' });
}
