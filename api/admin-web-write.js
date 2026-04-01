import { appendAdminWebAudit, isFounderSession, requireSession } from '../src/lib/adminWeb/auth.js';
import { getSearchParam, json, readJsonBody } from '../src/lib/adminWeb/common.js';
import { createNoticeDraftForActor, testSendNoticeDraftToActor, updateNoticeDraftForActor } from '../src/lib/adminWeb/comms.js';
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
    if (action === 'clear_note') {
      const ok = await clearAdminUserNote(userId);
      if (!ok) return json(res, 500, { ok: false, error: 'clear_failed' });
      await appendAdminWebAudit({
        section: 'users',
        action: 'clear_user_note',
        actorTgId: session.actorTgId,
        targetType: 'user',
        targetId: String(userId),
        reason: 'web_admin',
        oldJson: oldNote || null,
        newJson: null,
      });
      return json(res, 200, { ok: true });
    }
    const text = String(body.text || '').trim();
    if (!text) return json(res, 400, { ok: false, error: 'note_text_required' });
    const ok = await setAdminUserNote(userId, text, { byAdminTgId: session.actorTgId, byAdminUsername: '' });
    if (!ok) return json(res, 500, { ok: false, error: 'set_failed' });
    await appendAdminWebAudit({
      section: 'users',
      action: 'set_user_note',
      actorTgId: session.actorTgId,
      targetType: 'user',
      targetId: String(userId),
      reason: oldNote?.text ? 'update' : 'create',
      oldJson: oldNote || null,
      newJson: { text },
    });
    return json(res, 200, { ok: true });
  }

  if (action === 'create_notice_draft') {
    const result = await createNoticeDraftForActor({
      actorTgId: session.actorTgId,
      title: body.title,
      audience: body.audience,
      bodyText: body.bodyText,
    });
    return json(res, result.ok ? 200 : 400, result);
  }

  if (action === 'update_notice_draft') {
    const result = await updateNoticeDraftForActor({
      actorTgId: session.actorTgId,
      draftId: body.draftId,
      title: body.title,
      audience: body.audience,
      bodyText: body.bodyText,
    });
    return json(res, result.ok ? 200 : 400, result);
  }

  if (action === 'test_send_notice') {
    if (!isFounderSession(session)) return json(res, 403, { ok: false, error: 'founder_only' });
    const result = await testSendNoticeDraftToActor({ actorTgId: session.actorTgId, draftId: body.draftId });
    return json(res, result.ok ? 200 : 400, result);
  }

  return json(res, 400, { ok: false, error: 'unknown_action' });
}
