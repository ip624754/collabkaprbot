import { ADMIN_AUTH_ACTION } from './actions.js';

const CHALLENGE_ID_RE = /^[a-f0-9]{24}$/i;

export function isAdminAuthCallbackAction(action) {
  return String(action || '').trim() === ADMIN_AUTH_ACTION.DECIDE;
}

export function normalizeAdminAuthDecision(raw) {
  const value = String(raw || '').trim();
  if (value === 'a') return 'approve';
  if (value === 'd') return 'deny';
  return '';
}

export function parseAdminAuthDecisionPayload(payload) {
  if (!isAdminAuthCallbackAction(payload?.a)) {
    return Object.freeze({ ok: false, error: 'action_not_owned' });
  }

  const challengeId = String(payload?.c || '').trim();
  const decision = normalizeAdminAuthDecision(payload?.d);
  if (!CHALLENGE_ID_RE.test(challengeId) || !decision) {
    return Object.freeze({ ok: false, error: 'invalid_payload' });
  }

  return Object.freeze({
    ok: true,
    challengeId,
    decision,
  });
}
