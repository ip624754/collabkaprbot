import assert from 'node:assert/strict';
import {
  ADMIN_AUTH_CHALLENGE_STATUSES,
  applyAdminAuthDecisionReference,
  applyFallbackCodeAttemptReference,
  consumeApprovedChallengeReference,
  isAdminAuthChallengeExpired,
  isAdminSessionIdleExpired,
  isFallbackActorAllowed,
  normalizeAdminAuthDecision,
} from '../src/lib/adminWeb/authPolicy.js';
import { handleAdminAuthChallengeCallback } from '../src/bot/domains/adminAuth/index.js';

let assertions = 0;
function ok(value, message) {
  assertions += 1;
  assert.ok(value, message);
}
function equal(actual, expected, message) {
  assertions += 1;
  assert.equal(actual, expected, message);
}

const NOW = 1_720_000_000_000;
const APPROVERS = [111, 222];
const base = {
  id: 'abcdef0123456789abcdef01',
  status: ADMIN_AUTH_CHALLENGE_STATUSES.PENDING,
  expiresAt: NOW + 300_000,
  browserVerifierHash: 'browser-hash',
  fallbackCodeEnabled: false,
  codeHash: '',
  codeAttempts: 0,
  codeLockedAt: 0,
};

equal(normalizeAdminAuthDecision('approve'), 'approve', 'approve normalizes');
equal(normalizeAdminAuthDecision('a'), 'approve', 'a normalizes');
equal(normalizeAdminAuthDecision('deny'), 'deny', 'deny normalizes');
equal(normalizeAdminAuthDecision('d'), 'deny', 'd normalizes');
equal(normalizeAdminAuthDecision('other'), '', 'unknown decision rejected');
ok(isFallbackActorAllowed(111, APPROVERS), 'configured approver is allowed');
equal(isFallbackActorAllowed(333, APPROVERS), false, 'unknown actor rejected');
equal(isAdminAuthChallengeExpired(base, NOW), false, 'fresh challenge remains active');
ok(isAdminAuthChallengeExpired({ ...base, expiresAt: NOW }, NOW), 'boundary expiry is closed');

const unauthorizedApprove = applyAdminAuthDecisionReference(base, {
  decision: 'approve', actorTgId: 333, approverIds: APPROVERS, now: NOW,
});
equal(unauthorizedApprove.error, 'approver_not_allowed', 'actual Telegram actor must be allowlisted');

const approved = applyAdminAuthDecisionReference(base, {
  decision: 'approve', actorTgId: 111, approverIds: APPROVERS, now: NOW,
});
ok(approved.ok, 'allowlisted Telegram actor can approve');
equal(approved.record.status, 'approved', 'approval moves pending to approved');
equal(approved.record.approvedByTgId, 111, 'approval records actual Telegram actor');
equal(approved.record.approvedBy, 'telegram_callback', 'approval source is callback');

const replayDecision = applyAdminAuthDecisionReference(approved.record, {
  decision: 'deny', actorTgId: 222, approverIds: APPROVERS, now: NOW + 1,
});
equal(replayDecision.error, 'challenge_not_pending', 'second decision cannot overwrite first decision');

const denied = applyAdminAuthDecisionReference(base, {
  decision: 'deny', actorTgId: 222, approverIds: APPROVERS, now: NOW,
});
ok(denied.ok, 'allowlisted actor can deny');
equal(denied.record.status, 'denied', 'deny moves pending to denied');
equal(denied.record.deniedByTgId, 222, 'deny records actual actor');

const expiredDecision = applyAdminAuthDecisionReference({ ...base, expiresAt: NOW - 1 }, {
  decision: 'approve', actorTgId: 111, approverIds: APPROVERS, now: NOW,
});
equal(expiredDecision.error, 'challenge_expired', 'expired challenge cannot be approved');

const fallbackRecord = {
  ...base,
  fallbackCodeEnabled: true,
  fallbackActorTgId: 111,
  codeMaxAttempts: 5,
  codeHash: 'correct-hash',
};
const noBrowser = applyFallbackCodeAttemptReference(fallbackRecord, {
  candidateHash: 'correct-hash', verifierHash: 'wrong', fallbackActorTgId: 111, approverIds: APPROVERS, now: NOW,
});
equal(noBrowser.error, 'browser_binding_mismatch', 'forwarded challenge cannot use fallback code');

const wrongFallbackActor = applyFallbackCodeAttemptReference(fallbackRecord, {
  candidateHash: 'correct-hash', verifierHash: 'browser-hash', fallbackActorTgId: 333, approverIds: APPROVERS, now: NOW,
});
equal(wrongFallbackActor.error, 'fallback_actor_not_allowed', 'fallback actor must be explicit approver');

const changedFallbackActor = applyFallbackCodeAttemptReference(fallbackRecord, {
  candidateHash: 'correct-hash', verifierHash: 'browser-hash', fallbackActorTgId: 222, approverIds: APPROVERS, now: NOW,
});
equal(changedFallbackActor.error, 'fallback_actor_not_allowed', 'in-flight challenge keeps its original fallback actor attribution');

let attemptRecord = fallbackRecord;
for (let attempt = 1; attempt <= 4; attempt += 1) {
  const result = applyFallbackCodeAttemptReference(attemptRecord, {
    candidateHash: 'wrong-hash', verifierHash: 'browser-hash', fallbackActorTgId: 111,
    approverIds: APPROVERS, maxAttempts: 5, now: NOW + attempt,
  });
  equal(result.error, 'invalid_code', `attempt ${attempt} remains bounded invalid`);
  equal(result.record.codeAttempts, attempt, `attempt ${attempt} is atomically counted in reference model`);
  attemptRecord = result.record;
}
const locked = applyFallbackCodeAttemptReference(attemptRecord, {
  candidateHash: 'wrong-hash', verifierHash: 'browser-hash', fallbackActorTgId: 111,
  approverIds: APPROVERS, maxAttempts: 5, now: NOW + 5,
});
equal(locked.error, 'code_locked', 'fifth invalid attempt locks fallback code');
ok(Number(locked.record.codeLockedAt) > 0, 'lock timestamp is stored');
const afterLock = applyFallbackCodeAttemptReference(locked.record, {
  candidateHash: 'correct-hash', verifierHash: 'browser-hash', fallbackActorTgId: 111,
  approverIds: APPROVERS, maxAttempts: 5, now: NOW + 6,
});
equal(afterLock.error, 'code_locked', 'correct code cannot bypass lockout');

const fallbackApproved = applyFallbackCodeAttemptReference(fallbackRecord, {
  candidateHash: 'correct-hash', verifierHash: 'browser-hash', fallbackActorTgId: 111,
  approverIds: APPROVERS, maxAttempts: 5, now: NOW,
});
ok(fallbackApproved.ok, 'explicitly enabled fallback can approve');
equal(fallbackApproved.record.approvedByTgId, 111, 'fallback session is attributed to explicit actor');
equal(fallbackApproved.record.approvedBy, 'fallback_code', 'fallback source is recorded');
equal(fallbackApproved.record.codeHash, '', 'successful fallback removes reusable code hash');

const fallbackDisabled = applyFallbackCodeAttemptReference(base, {
  candidateHash: '', verifierHash: 'browser-hash', fallbackActorTgId: 111,
  approverIds: APPROVERS, maxAttempts: 5, now: NOW,
});
equal(fallbackDisabled.error, 'fallback_code_disabled', 'fallback is disabled by default');

const consumeWrongBrowser = consumeApprovedChallengeReference(approved.record, {
  verifierHash: 'wrong', sessionId: 'session-a', now: NOW + 10,
});
equal(consumeWrongBrowser.error, 'browser_binding_mismatch', 'approved challenge is useless in another browser');

const consumed = consumeApprovedChallengeReference({ ...approved.record, browserVerifierHash: 'browser-hash' }, {
  verifierHash: 'browser-hash', sessionId: 'session-a', now: NOW + 10,
});
ok(consumed.ok, 'origin browser can consume approved challenge');
equal(consumed.record.status, 'consumed', 'approved challenge becomes consumed');
equal(consumed.record.sessionId, 'session-a', 'one session id is pinned to challenge');

const replayConsume = consumeApprovedChallengeReference(consumed.record, {
  verifierHash: 'browser-hash', sessionId: 'session-b', now: NOW + 20,
});
ok(replayConsume.ok && replayConsume.reused, 'replay recovers same session only');
equal(replayConsume.sessionId, 'session-a', 'replay cannot mint a second session');

const actorMissing = consumeApprovedChallengeReference({
  ...approved.record, browserVerifierHash: 'browser-hash', approvedByTgId: 0,
}, { verifierHash: 'browser-hash', sessionId: 'session-a', now: NOW + 10 });
equal(actorMissing.error, 'approved_actor_missing', 'session cannot be anonymous');

const activeSession = { issuedAt: NOW, lastSeenAt: NOW, expiresAt: NOW + 60_000 };
equal(isAdminSessionIdleExpired(activeSession, 300, NOW + 299_000), false, 'session remains active before idle limit');
ok(isAdminSessionIdleExpired(activeSession, 300, NOW + 301_000), 'session expires after idle limit');
ok(isAdminSessionIdleExpired({}, 300, NOW), 'session without lastSeen fails closed');


function makeCallbackCtx(actorTgId = 111) {
  const events = [];
  return {
    from: { id: actorTgId },
    events,
    async answerCallbackQuery(payload) {
      events.push({ type: 'answer', payload });
    },
    async editMessageReplyMarkup(payload) {
      events.push({ type: 'edit_markup', payload });
    },
  };
}

const unrelatedCtx = makeCallbackCtx();
const unrelatedHandled = await handleAdminAuthChallengeCallback(
  unrelatedCtx,
  { a: 'a:home' },
  { approve: async () => ({ ok: true }) }
);
equal(unrelatedHandled, false, 'non-auth callback stays available to the normal callback router');
equal(unrelatedCtx.events.length, 0, 'non-auth callback has no auth side effects');

let approveCalls = 0;
const invalidCtx = makeCallbackCtx();
const invalidHandled = await handleAdminAuthChallengeCallback(
  invalidCtx,
  { a: 'a:aw_auth_dec', c: 'bad', d: 'a' },
  { approve: async () => { approveCalls += 1; return { ok: true }; } }
);
ok(invalidHandled, 'malformed auth callback is consumed by the auth route');
equal(approveCalls, 0, 'malformed auth callback never reaches the Redis auth transition');
equal(invalidCtx.events[0]?.payload?.text, 'Некорректный запрос входа.', 'malformed auth callback gets bounded feedback');

const approveCtx = makeCallbackCtx(222);
let approvedInput = null;
const approveHandled = await handleAdminAuthChallengeCallback(
  approveCtx,
  { a: 'a:aw_auth_dec', c: base.id, d: 'a' },
  { approve: async (input) => { approvedInput = input; return { ok: true, status: 'approved' }; } }
);
ok(approveHandled, 'valid approval callback is routed');
equal(approvedInput?.challengeId, base.id, 'challenge id is passed to the canonical auth service');
equal(approvedInput?.decision, 'approve', 'compact approve decision is normalized');
equal(approvedInput?.actorTgId, 222, 'actual Telegram callback actor is authoritative at routing boundary');
equal(approveCtx.events.filter((event) => event.type === 'edit_markup').length, 1, 'successful callback removes reusable buttons');
equal(approveCtx.events.filter((event) => event.type === 'answer').length, 1, 'successful callback is acknowledged once');
equal(approveCtx.events.find((event) => event.type === 'answer')?.payload?.text, 'Вход одобрен для исходного браузера.', 'approval feedback preserves browser-binding truth');

const denyCtx = makeCallbackCtx(111);
let deniedInput = null;
await handleAdminAuthChallengeCallback(
  denyCtx,
  { a: 'a:aw_auth_dec', c: base.id, d: 'd' },
  { approve: async (input) => { deniedInput = input; return { ok: true, status: 'denied' }; } }
);
equal(deniedInput?.decision, 'deny', 'compact deny decision is normalized');
equal(denyCtx.events.find((event) => event.type === 'answer')?.payload?.text, 'Вход отклонён.', 'deny feedback is explicit');

const rejectedCtx = makeCallbackCtx(333);
await handleAdminAuthChallengeCallback(
  rejectedCtx,
  { a: 'a:aw_auth_dec', c: base.id, d: 'a' },
  { approve: async () => ({ ok: false, error: 'approver_not_allowed' }) }
);
equal(
  rejectedCtx.events.find((event) => event.type === 'answer')?.payload?.text,
  'Эта кнопка доступна только назначенному approver.',
  'unauthorized approver gets the canonical rejection without falling into unknown_callback'
);

console.log(`✅ admin web auth critical policy tests PASS (${assertions} assertions)`);
