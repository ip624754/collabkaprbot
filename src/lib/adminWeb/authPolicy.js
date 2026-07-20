export const ADMIN_AUTH_CHALLENGE_STATUSES = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  DENIED: 'denied',
  CONSUMED: 'consumed',
  EXPIRED: 'expired',
});

export function normalizeAdminAuthDecision(value) {
  const decision = String(value || '').trim().toLowerCase();
  if (decision === 'approve' || decision === 'a') return 'approve';
  if (decision === 'deny' || decision === 'd') return 'deny';
  return '';
}

export function isAdminAuthChallengeExpired(record, now = Date.now()) {
  return Number(record?.expiresAt || 0) <= Number(now || 0);
}

export function isAdminSessionIdleExpired(session, idleTimeoutSec, now = Date.now()) {
  const timeoutMs = Math.max(60, Number(idleTimeoutSec || 0)) * 1000;
  const lastSeenAt = Number(session?.lastSeenAt || session?.issuedAt || 0);
  if (!lastSeenAt) return true;
  return Number(now || 0) - lastSeenAt > timeoutMs;
}

export function isFallbackActorAllowed(actorTgId, approverIds = []) {
  const actor = Number(actorTgId || 0) || 0;
  return actor > 0 && (Array.isArray(approverIds) ? approverIds : []).map(Number).includes(actor);
}

export function applyAdminAuthDecisionReference(record, {
  decision,
  actorTgId,
  approverIds = [],
  now = Date.now(),
} = {}) {
  if (!record) return { ok: false, error: 'challenge_not_found' };
  const normalized = normalizeAdminAuthDecision(decision);
  if (!normalized) return { ok: false, error: 'invalid_decision' };
  if (!isFallbackActorAllowed(actorTgId, approverIds)) return { ok: false, error: 'approver_not_allowed' };
  if (String(record.status || '') !== ADMIN_AUTH_CHALLENGE_STATUSES.PENDING) {
    return { ok: false, error: 'challenge_not_pending' };
  }
  if (isAdminAuthChallengeExpired(record, now)) {
    return { ok: false, error: 'challenge_expired' };
  }
  if (normalized === 'deny') {
    return {
      ok: true,
      status: ADMIN_AUTH_CHALLENGE_STATUSES.DENIED,
      record: {
        ...record,
        status: ADMIN_AUTH_CHALLENGE_STATUSES.DENIED,
        deniedByTgId: Number(actorTgId),
        deniedAt: Number(now),
      },
    };
  }
  return {
    ok: true,
    status: ADMIN_AUTH_CHALLENGE_STATUSES.APPROVED,
    record: {
      ...record,
      status: ADMIN_AUTH_CHALLENGE_STATUSES.APPROVED,
      approvedByTgId: Number(actorTgId),
      approvedBy: 'telegram_callback',
      approvedAt: Number(now),
    },
  };
}

export function applyFallbackCodeAttemptReference(record, {
  candidateHash,
  verifierHash,
  fallbackActorTgId,
  approverIds = [],
  maxAttempts = 5,
  now = Date.now(),
} = {}) {
  if (!record) return { ok: false, error: 'challenge_not_found' };
  if (String(record.status || '') !== ADMIN_AUTH_CHALLENGE_STATUSES.PENDING) {
    return { ok: false, error: 'challenge_not_pending' };
  }
  if (isAdminAuthChallengeExpired(record, now)) return { ok: false, error: 'challenge_expired' };
  if (record.fallbackCodeEnabled !== true) return { ok: false, error: 'fallback_code_disabled' };
  if (!verifierHash || verifierHash !== String(record.browserVerifierHash || '')) {
    return { ok: false, error: 'browser_binding_mismatch' };
  }
  if (!isFallbackActorAllowed(fallbackActorTgId, approverIds)) {
    return { ok: false, error: 'fallback_actor_not_allowed' };
  }
  if (Number(record.fallbackActorTgId || 0) !== Number(fallbackActorTgId || 0)) {
    return { ok: false, error: 'fallback_actor_not_allowed' };
  }
  if (Number(record.codeLockedAt || 0) > 0) return { ok: false, error: 'code_locked' };

  if (!candidateHash || candidateHash !== String(record.codeHash || '')) {
    const attempts = Number(record.codeAttempts || 0) + 1;
    const effectiveMaxAttempts = Math.max(1, Number(record.codeMaxAttempts || maxAttempts || 5));
    const locked = attempts >= effectiveMaxAttempts;
    return {
      ok: false,
      error: locked ? 'code_locked' : 'invalid_code',
      attemptsRemaining: Math.max(0, effectiveMaxAttempts - attempts),
      record: {
        ...record,
        codeAttempts: attempts,
        codeLockedAt: locked ? Number(now) : Number(record.codeLockedAt || 0),
      },
    };
  }

  return {
    ok: true,
    status: ADMIN_AUTH_CHALLENGE_STATUSES.APPROVED,
    record: {
      ...record,
      status: ADMIN_AUTH_CHALLENGE_STATUSES.APPROVED,
      approvedByTgId: Number(fallbackActorTgId),
      approvedBy: 'fallback_code',
      approvedAt: Number(now),
      codeHash: '',
    },
  };
}

export function consumeApprovedChallengeReference(record, {
  verifierHash,
  sessionId,
  now = Date.now(),
} = {}) {
  if (!record) return { ok: false, error: 'challenge_not_found' };
  if (!verifierHash || verifierHash !== String(record.browserVerifierHash || '')) {
    return { ok: false, error: 'browser_binding_mismatch' };
  }
  if (isAdminAuthChallengeExpired(record, now)) return { ok: false, error: 'challenge_expired' };
  if (String(record.status || '') === ADMIN_AUTH_CHALLENGE_STATUSES.CONSUMED) {
    return record.sessionId
      ? { ok: true, status: ADMIN_AUTH_CHALLENGE_STATUSES.CONSUMED, reused: true, sessionId: String(record.sessionId) }
      : { ok: false, error: 'challenge_consumed' };
  }
  if (String(record.status || '') !== ADMIN_AUTH_CHALLENGE_STATUSES.APPROVED) {
    return { ok: false, error: 'challenge_not_approved' };
  }
  if (!(Number(record.approvedByTgId || 0) > 0)) return { ok: false, error: 'approved_actor_missing' };
  return {
    ok: true,
    status: ADMIN_AUTH_CHALLENGE_STATUSES.CONSUMED,
    sessionId: String(sessionId || ''),
    record: {
      ...record,
      status: ADMIN_AUTH_CHALLENGE_STATUSES.CONSUMED,
      consumedAt: Number(now),
      sessionId: String(sessionId || ''),
      sessionIssuedAt: Number(now),
    },
  };
}
