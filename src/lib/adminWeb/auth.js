import { CFG } from '../config.js';
import { redis, k } from '../redis.js';
import { clearCookie, getAdminWebBaseUrl, getClientIp, hmacSha256, json, nowIso, parseCookies, randomCode, randomId, setCookie, sha256, shortUa, timingSafeEq } from './common.js';
import { notifyLoginChallenge, getAdminApproverIds } from './telegram.js';

const COOKIE_NAME = 'collabka_admin_session';

function challengeKey(id) {
  return k(['admin_web', 'challenge', String(id || '')]);
}
function sessionKey(id) {
  return k(['admin_web', 'session', String(id || '')]);
}
function auditKey() {
  return k(['admin_web', 'audit_recent']);
}
function revokeBeforeKey() {
  return k(['admin_web', 'revoke_before']);
}

function getLoginTtlSec() {
  return Math.max(60, Number(CFG.ADMIN_WEB_LOGIN_TTL_SEC || 300));
}
function getSessionTtlSec() {
  return Math.max(600, Number(CFG.ADMIN_WEB_SESSION_TTL_SEC || 28800));
}

export function isAdminWebReady() {
  return !!CFG.ADMIN_WEB_ENABLED && !!String(CFG.ADMIN_WEB_SECRET || '').trim() && !!String(CFG.ADMIN_WEB_SESSION_SECRET || '').trim();
}

function getSigningSecret() {
  return String(CFG.ADMIN_WEB_SESSION_SECRET || CFG.WEBHOOK_SECRET_TOKEN || '');
}

export async function createLoginChallenge(req) {
  if (!isAdminWebReady()) {
    return { ok: false, status: 503, error: 'admin_web_not_configured' };
  }
  const approverIds = getAdminApproverIds();
  if (!approverIds.length) return { ok: false, status: 503, error: 'approvers_not_configured' };

  const challengeId = randomId(12);
  const code = randomCode();
  const requestedAt = Date.now();
  const expiresAtMs = requestedAt + getLoginTtlSec() * 1000;
  const ip = getClientIp(req);
  const ua = shortUa(req);

  const record = {
    id: challengeId,
    status: 'pending',
    codeHash: sha256(code),
    requestedAt: requestedAt,
    expiresAt: expiresAtMs,
    requestIpHash: ip ? sha256(ip) : '',
    requestIpPreview: ip || '',
    userAgent: ua,
    approveMode: getAdminWebBaseUrl() ? 'telegram_approve' : 'telegram_code',
    approvedByTgId: 0,
    approvedAt: 0,
    deniedAt: 0,
  };

  try {
    await redis.set(challengeKey(challengeId), record, { ex: getLoginTtlSec() });
  } catch (e) {
    return { ok: false, status: 500, error: `challenge_store_failed:${String(e?.message || e)}` };
  }

  const baseUrl = getAdminWebBaseUrl();
  const tg = await notifyLoginChallenge({
    challengeId,
    code,
    expiresAt: new Date(expiresAtMs).toISOString(),
    ua,
    ip,
    buildDecisionUrl: baseUrl ? ((decision, actorId) => buildDecisionUrl(challengeId, decision, actorId)) : null,
  });

  if (!tg.ok) {
    return { ok: false, status: 502, error: 'telegram_notify_failed' };
  }

  return {
    ok: true,
    challengeId,
    expiresAt: new Date(expiresAtMs).toISOString(),
    mode: record.approveMode,
  };
}

export function buildDecisionUrl(challengeId, decision, actorTgId) {
  const base = getAdminWebBaseUrl();
  const exp = Date.now() + getLoginTtlSec() * 1000;
  const actor = Number(actorTgId || 0) || 0;
  const payload = `${challengeId}:${decision}:${actor}:${exp}`;
  const sig = hmacSha256(getSigningSecret(), payload);
  return `${base}/api/admin-web-auth?action=decision&challengeId=${encodeURIComponent(challengeId)}&decision=${encodeURIComponent(decision)}&actor=${actor}&exp=${exp}&sig=${sig}`;
}

export async function getChallenge(challengeId) {
  try {
    return await redis.get(challengeKey(challengeId));
  } catch {
    return null;
  }
}

export async function updateChallenge(challengeId, patch = {}) {
  const cur = await getChallenge(challengeId);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  const ttl = Math.max(30, Math.ceil((Number(next.expiresAt || 0) - Date.now()) / 1000));
  try {
    await redis.set(challengeKey(challengeId), next, { ex: ttl });
    return next;
  } catch {
    return null;
  }
}

export async function approveChallenge({ challengeId, decision, actorTgId, exp, sig }) {
  const payload = `${challengeId}:${decision}:${Number(actorTgId || 0) || 0}:${Number(exp || 0)}`;
  const expected = hmacSha256(getSigningSecret(), payload);
  if (!timingSafeEq(expected, sig)) return { ok: false, error: 'invalid_signature' };
  if (Number(exp || 0) < Date.now()) return { ok: false, error: 'link_expired' };
  const cur = await getChallenge(challengeId);
  if (!cur) return { ok: false, error: 'challenge_not_found' };
  if (String(cur.status) !== 'pending') return { ok: false, error: 'challenge_not_pending' };
  if (Number(cur.expiresAt || 0) < Date.now()) {
    await updateChallenge(challengeId, { status: 'expired' });
    return { ok: false, error: 'challenge_expired' };
  }
  const patch = decision === 'approve'
    ? { status: 'approved', approvedByTgId: Number(actorTgId || 0) || 0, approvedAt: Date.now() }
    : { status: 'denied', deniedAt: Date.now() };
  await updateChallenge(challengeId, patch);
  return { ok: true, status: patch.status };
}

export async function verifyChallengeCode(challengeId, code) {
  const cur = await getChallenge(challengeId);
  if (!cur) return { ok: false, error: 'challenge_not_found' };
  if (String(cur.status) !== 'pending') return { ok: false, error: 'challenge_not_pending' };
  if (Number(cur.expiresAt || 0) < Date.now()) {
    await updateChallenge(challengeId, { status: 'expired' });
    return { ok: false, error: 'challenge_expired' };
  }
  if (sha256(String(code || '')) !== String(cur.codeHash || '')) {
    return { ok: false, error: 'invalid_code' };
  }
  const next = await updateChallenge(challengeId, { status: 'approved', approvedByTgId: 0, approvedAt: Date.now(), approvedBy: 'telegram_code_fallback' });
  return { ok: !!next, error: next ? null : 'challenge_update_failed' };
}

export async function issueSession(res, challengeId) {
  const ch = await getChallenge(challengeId);
  if (!ch || String(ch.status) !== 'approved') return { ok: false, error: 'challenge_not_approved' };
  if (ch.sessionId) {
    try {
      const existing = await redis.get(sessionKey(ch.sessionId));
      if (existing && Number(existing.expiresAt || 0) > Date.now()) {
        setCookie(res, COOKIE_NAME, ch.sessionId, { maxAge: getSessionTtlSec() });
        return { ok: true, sessionId: ch.sessionId, reused: true };
      }
    } catch {
      // ignore and mint a fresh session below
    }
  }
  const sessionId = randomId(18);
  const issuedAt = Date.now();
  const record = {
    id: sessionId,
    actorTgId: Number(ch.approvedByTgId || 0) || 0,
    issuedAt,
    expiresAt: issuedAt + getSessionTtlSec() * 1000,
    challengeId,
    lastSeenAt: issuedAt,
  };
  try {
    await redis.set(sessionKey(sessionId), record, { ex: getSessionTtlSec() });
    await updateChallenge(challengeId, { sessionId, sessionIssuedAt: issuedAt });
    setCookie(res, COOKIE_NAME, sessionId, { maxAge: getSessionTtlSec() });
    return { ok: true, sessionId };
  } catch {
    return { ok: false, error: 'session_store_failed' };
  }
}

export async function getSession(req) {
  const cookies = parseCookies(req);
  const sessionId = String(cookies[COOKIE_NAME] || '').trim();
  if (!sessionId) return null;
  try {
    const session = await redis.get(sessionKey(sessionId));
    if (!session) return null;
    if (Number(session.expiresAt || 0) < Date.now()) return null;
    const revokeBefore = Number((await redis.get(revokeBeforeKey())) || 0);
    if (revokeBefore && Number(session.issuedAt || 0) < revokeBefore) return null;
    return { ...session, id: sessionId };
  } catch {
    return null;
  }
}

export async function touchSession(session) {
  if (!session?.id) return;
  const next = { ...session, lastSeenAt: Date.now() };
  try {
    await redis.set(sessionKey(session.id), next, { ex: Math.max(60, Math.ceil((Number(next.expiresAt || 0) - Date.now()) / 1000)) });
  } catch {
    // ignore
  }
}

export async function requireSession(req, res) {
  if (!isAdminWebReady()) {
    json(res, 503, { ok: false, error: 'admin_web_not_configured' });
    return null;
  }
  const session = await getSession(req);
  if (!session) {
    json(res, 401, { ok: false, error: 'unauthorized' });
    return null;
  }
  await touchSession(session);
  return session;
}

export async function logout(req, res) {
  const cookies = parseCookies(req);
  const sessionId = String(cookies[COOKIE_NAME] || '').trim();
  if (sessionId) {
    try { await redis.del(sessionKey(sessionId)); } catch {}
  }
  clearCookie(res, COOKIE_NAME);
  return { ok: true };
}

export async function revokeAllSessions() {
  try {
    await redis.set(revokeBeforeKey(), String(Date.now()), { ex: getSessionTtlSec() });
    return { ok: true };
  } catch {
    return { ok: false, error: 'revoke_failed' };
  }
}

export async function appendAdminWebAudit(entry = {}) {
  const payload = {
    ts: nowIso(),
    section: String(entry.section || 'system'),
    action: String(entry.action || 'unknown'),
    actorTgId: Number(entry.actorTgId || 0) || 0,
    targetType: String(entry.targetType || ''),
    targetId: String(entry.targetId || ''),
    reason: String(entry.reason || ''),
    oldJson: entry.oldJson ?? null,
    newJson: entry.newJson ?? null,
  };
  const key = auditKey();
  const lua = `
    redis.call('LPUSH', KEYS[1], ARGV[1])
    redis.call('LTRIM', KEYS[1], 0, 99)
    redis.call('EXPIRE', KEYS[1], 1209600)
    return 1
  `;
  try {
    await redis.eval(lua, [key], [JSON.stringify(payload)]);
  } catch {
    // ignore
  }
}

export async function getRecentAdminWebAudit(limit = 10, filters = {}) {
  try {
    const raw = await redis.lrange(auditKey(), 0, Math.max(0, Number(limit || 10) - 1));
    const items = (Array.isArray(raw) ? raw : []).map((item) => {
      try { return typeof item === 'string' ? JSON.parse(item) : item; } catch { return null; }
    }).filter(Boolean);
    const targetType = String(filters?.targetType || '').trim();
    const targetId = String(filters?.targetId || '').trim();
    if (!targetType && !targetId) return items;
    return items.filter((item) => {
      if (targetType && String(item?.targetType || '') !== targetType) return false;
      if (targetId && String(item?.targetId || '') !== targetId) return false;
      return true;
    });
  } catch {
    return [];
  }
}

export function clearAuthCookie(res) {
  clearCookie(res, COOKIE_NAME);
}
