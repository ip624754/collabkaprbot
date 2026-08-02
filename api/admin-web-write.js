import { appendAdminWebAudit, isFounderSession, requireSession } from '../src/lib/adminWeb/auth.js';
import { getSearchParam, isRequestBodyTooLargeError, json, readJsonBody } from '../src/lib/adminWeb/common.js';
import {
  createNoticeDraftForActor,
  resolveUnknownBroadcastDeliveryForActor,
  testSendNoticeDraftToActor,
  updateNoticeDraftForActor,
} from '../src/lib/adminWeb/comms.js';
import { clearAdminUserNote, getAdminUserNote, setAdminUserNote } from '../src/lib/adminWeb/notes.js';
import { configureFoundingCohort, removeFoundingCohortMember, setFoundingCohortMember } from '../src/lib/adminWeb/foundingCohort.js';

async function readBodyOrReply(req, res) {
  try {
    return await readJsonBody(req);
  } catch (error) {
    if (isRequestBodyTooLargeError(error)) {
      json(res, 413, { ok: false, error: 'request_body_too_large' });
      return null;
    }
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  const session = await requireSession(req, res);
  if (!session) return;
  const body = await readBodyOrReply(req, res);
  if (!body) return;
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

  if (action === 'configure_founding_cohort') {
    if (!isFounderSession(session)) return json(res, 403, { ok: false, error: 'founder_only' });
    const result = await configureFoundingCohort({
      actorTgId: session.actorTgId,
      launchWedge: body.launchWedge,
      ownerLabel: body.ownerLabel,
      ownerTgId: body.ownerTgId,
      followUpCadenceDays: body.followUpCadenceDays,
      nextReviewAt: body.nextReviewAt,
    });
    if (!result.ok) return json(res, result.error === 'cohort_busy' ? 409 : 400, result);
    await appendAdminWebAudit({
      section: 'users',
      action: 'configure_founding_cohort',
      actorTgId: session.actorTgId,
      targetType: 'founding_cohort',
      targetId: 'v1',
      reason: 'bounded_launch_operations',
      oldJson: result.previous?.config || result.previous || null,
      newJson: result.state || null,
    });
    return json(res, 200, { ok: true });
  }

  if (action === 'set_founding_cohort_member') {
    if (!isFounderSession(session)) return json(res, 403, { ok: false, error: 'founder_only' });
    const result = await setFoundingCohortMember({
      actorTgId: session.actorTgId,
      userId: body.userId,
      status: body.status,
      profileReviewed: body.profileReviewed === true,
      contactReviewed: body.contactReviewed === true,
      termsReviewed: body.termsReviewed === true,
      onboardingCanary: body.onboardingCanary,
      blocker: body.blocker,
      note: body.note,
    });
    if (!result.ok) return json(res, result.error === 'cohort_busy' ? 409 : 400, result);
    await appendAdminWebAudit({
      section: 'users',
      action: 'set_founding_cohort_member',
      actorTgId: session.actorTgId,
      targetType: 'user',
      targetId: String(Number(body.userId || 0) || 0),
      reason: 'bounded_launch_operations',
      oldJson: result.previous?.members?.[String(Number(body.userId || 0) || 0)] || null,
      newJson: result.result?.member || null,
    });
    return json(res, 200, { ok: true });
  }

  if (action === 'remove_founding_cohort_member') {
    if (!isFounderSession(session)) return json(res, 403, { ok: false, error: 'founder_only' });
    const result = await removeFoundingCohortMember({ actorTgId: session.actorTgId, userId: body.userId });
    if (!result.ok) return json(res, result.error === 'cohort_busy' ? 409 : 400, result);
    await appendAdminWebAudit({
      section: 'users',
      action: 'remove_founding_cohort_member',
      actorTgId: session.actorTgId,
      targetType: 'user',
      targetId: String(Number(body.userId || 0) || 0),
      reason: 'bounded_launch_operations',
      oldJson: result.result?.removed || null,
      newJson: null,
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

  if (action === 'resolve_broadcast_delivery_unknown') {
    if (!isFounderSession(session)) return json(res, 403, { ok: false, error: 'founder_only' });
    const result = await resolveUnknownBroadcastDeliveryForActor({
      actorTgId: session.actorTgId,
      broadcastId: body.broadcastId,
      userId: body.userId,
      resolution: body.resolution,
      note: body.note,
    });
    return json(res, result.ok ? 200 : 400, result);
  }

  return json(res, 400, { ok: false, error: 'unknown_action' });
}
