import { CFG } from '../config.js';
import { redis, k } from '../redis.js';
import {
  clearCookie,
  getClientIp,
  hmacSha256,
  json,
  nowIso,
  parseCookies,
  randomCode,
  randomId,
  setCookie,
  sha256,
  shortUa,
  timingSafeEq,
} from './common.js';
import { notifyLoginChallenge, getAdminApproverIds } from './telegram.js';
import { getAdminWebLoginGateState } from '../operatorControls.js';
import {
  ADMIN_AUTH_CHALLENGE_STATUSES,
  isAdminSessionIdleExpired,
  isFallbackActorAllowed,
  normalizeAdminAuthDecision,
} from './authPolicy.js';

const COOKIE_NAME = 'collabka_admin_session';
const LOGIN_VERIFIER_COOKIE_NAME = 'collabka_admin_login_verifier';
const ADMIN_WEB_AUTH_VERSION = 2;

function challengeKey(id) {
  return k(['admin_web', 'challenge', String(id || '')]);
}
function sessionKey(id) {
  return k(['admin_web', 'session', String(id || '')]);
}
function sessionKeyPrefix() {
  return k(['admin_web', 'session', '']);
}
function auditKey() {
  return k(['admin_web', 'audit_recent']);
}
function revokeBeforeKey() {
  return k(['admin_web', 'revoke_before']);
}
function throttleKey(scope, subject) {
  return k(['admin_web', 'auth_rl', String(scope || 'unknown'), sha256(String(subject || 'unknown')).slice(0, 32)]);
}

function getLoginTtlSec() {
  return Math.max(60, Number(CFG.ADMIN_WEB_LOGIN_TTL_SEC || 300));
}
function getSessionTtlSec() {
  return Math.max(600, Number(CFG.ADMIN_WEB_SESSION_TTL_SEC || 28800));
}
function getIdleTimeoutSec() {
  return Math.max(60, Math.min(getSessionTtlSec(), Number(CFG.ADMIN_WEB_IDLE_TIMEOUT_SEC || 1800)));
}
function getCodeMaxAttempts() {
  return Math.max(3, Math.min(10, Number(CFG.ADMIN_WEB_CODE_MAX_ATTEMPTS || 5)));
}

export function isFounderActorTgId(actorTgId) {
  const tgId = Number(actorTgId || 0) || 0;
  return tgId > 0 && Array.isArray(CFG.SUPER_ADMIN_TG_IDS) && CFG.SUPER_ADMIN_TG_IDS.includes(tgId);
}

export function isFounderSession(session) {
  return !!session && isFounderActorTgId(session.actorTgId);
}

export function isAdminWebReady() {
  return !!CFG.ADMIN_WEB_ENABLED && !!String(CFG.ADMIN_WEB_SECRET || '').trim() && !!String(CFG.ADMIN_WEB_SESSION_SECRET || '').trim();
}

function getSigningSecret() {
  return String(CFG.ADMIN_WEB_SESSION_SECRET || CFG.WEBHOOK_SECRET_TOKEN || '');
}

function getFallbackActorTgId() {
  const actor = Number(CFG.ADMIN_WEB_FALLBACK_ACTOR_TG_ID || 0) || 0;
  return isFallbackActorAllowed(actor, getAdminApproverIds()) ? actor : 0;
}

function isFallbackCodeEnabled() {
  return CFG.ADMIN_WEB_FALLBACK_CODE_ENABLED === true && getFallbackActorTgId() > 0;
}

function browserVerifierHash(challengeId, verifier) {
  return hmacSha256(getSigningSecret(), `browser:${String(challengeId || '')}:${String(verifier || '')}`);
}

function fallbackCodeHash(challengeId, code) {
  return hmacSha256(getSigningSecret(), `fallback-code:${String(challengeId || '')}:${String(code || '')}`);
}

function readBrowserVerifier(req) {
  const cookies = parseCookies(req);
  return String(cookies[LOGIN_VERIFIER_COOKIE_NAME] || '').trim();
}

function setBrowserVerifierCookie(res, verifier) {
  setCookie(res, LOGIN_VERIFIER_COOKIE_NAME, verifier, {
    maxAge: getLoginTtlSec(),
    sameSite: 'Strict',
  });
}

function parseEvalJson(raw) {
  if (raw && typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw || '{}'));
  } catch {
    return { ok: false, error: 'auth_state_decode_failed' };
  }
}

async function evalJson(script, keys, args) {
  try {
    const raw = await redis.eval(script, keys, args.map((value) => String(value)));
    return parseEvalJson(raw);
  } catch (error) {
    return { ok: false, error: 'auth_store_unavailable', detail: String(error?.message || error) };
  }
}

export async function consumeAdminAuthRateLimit({ scope, subject, limit, windowSec }) {
  const lim = Math.max(1, Number(limit || 1));
  const win = Math.max(30, Number(windowSec || 60));
  const script = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end
    local ttl = redis.call('TTL', KEYS[1])
    return cjson.encode({ ok = true, allowed = current <= tonumber(ARGV[2]), current = current, limit = tonumber(ARGV[2]), retryAfterSec = ttl })
  `;
  return evalJson(script, [throttleKey(scope, subject)], [win, lim]);
}

export function buildDecisionCallback(challengeId, decision) {
  const normalized = normalizeAdminAuthDecision(decision);
  if (!normalized) return '';
  return `a:aw_auth_dec|c:${String(challengeId || '')}|d:${normalized === 'approve' ? 'a' : 'd'}`;
}

export async function createLoginChallenge(req, res) {
  if (!isAdminWebReady()) {
    return { ok: false, status: 503, error: 'admin_web_not_configured' };
  }
  const loginGate = await getAdminWebLoginGateState();
  if (!loginGate.ok) {
    return { ok: false, status: 503, error: 'auth_store_unavailable' };
  }
  if (!loginGate.enabled) {
    return { ok: false, status: 503, error: 'admin_web_login_paused' };
  }
  const approverIds = getAdminApproverIds();
  if (!approverIds.length) return { ok: false, status: 503, error: 'approvers_not_configured' };

  const challengeId = randomId(12);
  const verifier = randomId(32);
  const fallbackEnabled = isFallbackCodeEnabled();
  const fallbackActorTgId = fallbackEnabled ? getFallbackActorTgId() : 0;
  const code = fallbackEnabled ? randomCode() : '';
  const requestedAt = Date.now();
  const expiresAtMs = requestedAt + getLoginTtlSec() * 1000;
  const ip = getClientIp(req);
  const ua = shortUa(req);

  const record = {
    id: challengeId,
    status: ADMIN_AUTH_CHALLENGE_STATUSES.PENDING,
    browserVerifierHash: browserVerifierHash(challengeId, verifier),
    codeHash: fallbackEnabled ? fallbackCodeHash(challengeId, code) : '',
    codeAttempts: 0,
    codeMaxAttempts: getCodeMaxAttempts(),
    codeLockedAt: 0,
    fallbackCodeEnabled: fallbackEnabled,
    fallbackActorTgId,
    requestedAt,
    expiresAt: expiresAtMs,
    requestIpHash: ip ? sha256(ip) : '',
    requestIpPreview: ip || '',
    userAgent: ua,
    approveMode: 'telegram_callback',
    approvedByTgId: 0,
    approvedAt: 0,
    deniedAt: 0,
    consumedAt: 0,
  };

  try {
    await redis.set(challengeKey(challengeId), record, { ex: getLoginTtlSec() });
    setBrowserVerifierCookie(res, verifier);
  } catch (error) {
    return { ok: false, status: 503, error: 'challenge_store_failed' };
  }

  const tg = await notifyLoginChallenge({
    challengeId,
    code,
    fallbackEnabled,
    fallbackActorTgId,
    expiresAt: new Date(expiresAtMs).toISOString(),
    ua,
    ip,
    buildDecisionCallback,
  });

  if (!tg.ok) {
    try { await redis.del(challengeKey(challengeId)); } catch {}
    clearCookie(res, LOGIN_VERIFIER_COOKIE_NAME);
    return { ok: false, status: 502, error: 'telegram_notify_failed' };
  }

  return {
    ok: true,
    challengeId,
    expiresAt: new Date(expiresAtMs).toISOString(),
    mode: record.approveMode,
    fallbackCodeEnabled: fallbackEnabled,
  };
}

export async function getChallengeStatusForBrowser(req, challengeId) {
  const verifier = readBrowserVerifier(req);
  if (!verifier) return { ok: false, status: 401, error: 'browser_verifier_missing' };
  let challenge;
  try {
    challenge = await redis.get(challengeKey(challengeId));
  } catch {
    return { ok: false, status: 503, error: 'auth_store_unavailable' };
  }
  if (!challenge) return { ok: false, status: 404, error: 'challenge_not_found' };
  const expected = browserVerifierHash(challengeId, verifier);
  if (!timingSafeEq(expected, challenge.browserVerifierHash)) {
    return { ok: false, status: 403, error: 'browser_binding_mismatch' };
  }
  const expired = Number(challenge.expiresAt || 0) <= Date.now();
  return {
    ok: true,
    challengeId: String(challenge.id || challengeId),
    status: expired ? ADMIN_AUTH_CHALLENGE_STATUSES.EXPIRED : String(challenge.status || ADMIN_AUTH_CHALLENGE_STATUSES.PENDING),
    expiresAt: Number(challenge.expiresAt || 0),
    fallbackCodeEnabled: challenge.fallbackCodeEnabled === true,
  };
}

export async function approveChallengeFromTelegram({ challengeId, decision, actorTgId }) {
  const normalized = normalizeAdminAuthDecision(decision);
  if (!normalized) return { ok: false, error: 'invalid_decision' };
  const actor = Number(actorTgId || 0) || 0;
  const allowed = getAdminApproverIds().includes(actor);
  const now = Date.now();
  const script = `
    local raw = redis.call('GET', KEYS[1])
    if not raw then return cjson.encode({ ok = false, error = 'challenge_not_found' }) end
    local decoded, record = pcall(cjson.decode, raw)
    if not decoded then return cjson.encode({ ok = false, error = 'auth_state_decode_failed' }) end
    if ARGV[4] ~= '1' then return cjson.encode({ ok = false, error = 'approver_not_allowed' }) end
    if tostring(record.status or '') ~= 'pending' then return cjson.encode({ ok = false, error = 'challenge_not_pending', status = tostring(record.status or '') }) end
    local now = tonumber(ARGV[1])
    if tonumber(record.expiresAt or 0) <= now then
      record.status = 'expired'
      local ttl = math.max(30, math.ceil((tonumber(record.expiresAt or 0) - now) / 1000))
      redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ttl)
      return cjson.encode({ ok = false, error = 'challenge_expired' })
    end
    local decision = ARGV[2]
    local actor = tonumber(ARGV[3])
    if decision == 'approve' then
      record.status = 'approved'
      record.approvedByTgId = actor
      record.approvedBy = 'telegram_callback'
      record.approvedAt = now
      record.codeHash = ''
    elseif decision == 'deny' then
      record.status = 'denied'
      record.deniedByTgId = actor
      record.deniedAt = now
      record.codeHash = ''
    else
      return cjson.encode({ ok = false, error = 'invalid_decision' })
    end
    local ttl = math.max(30, math.ceil((tonumber(record.expiresAt or 0) - now) / 1000))
    redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ttl)
    return cjson.encode({ ok = true, status = record.status, actorTgId = actor })
  `;
  const result = await evalJson(script, [challengeKey(challengeId)], [now, normalized, actor, allowed ? 1 : 0]);
  if (result.ok) {
    await appendAdminWebAudit({
      section: 'auth',
      action: `challenge_${result.status}`,
      actorTgId: actor,
      targetType: 'admin_web_challenge',
      targetId: String(challengeId || ''),
      reason: 'telegram_callback',
    });
  }
  return result;
}

export async function verifyChallengeCode(req, challengeId, code) {
  if (!CFG.ADMIN_WEB_FALLBACK_CODE_ENABLED) return { ok: false, error: 'fallback_code_disabled' };
  const fallbackActor = getFallbackActorTgId();
  if (!fallbackActor) return { ok: false, error: 'fallback_actor_not_allowed' };
  const verifier = readBrowserVerifier(req);
  if (!verifier) return { ok: false, error: 'browser_verifier_missing' };
  const now = Date.now();
  const candidateHash = fallbackCodeHash(challengeId, String(code || ''));
  const verifierHash = browserVerifierHash(challengeId, verifier);
  const script = `
    local raw = redis.call('GET', KEYS[1])
    if not raw then return cjson.encode({ ok = false, error = 'challenge_not_found' }) end
    local decoded, record = pcall(cjson.decode, raw)
    if not decoded then return cjson.encode({ ok = false, error = 'auth_state_decode_failed' }) end
    local now = tonumber(ARGV[1])
    if tostring(record.status or '') ~= 'pending' then return cjson.encode({ ok = false, error = 'challenge_not_pending', status = tostring(record.status or '') }) end
    if tonumber(record.expiresAt or 0) <= now then return cjson.encode({ ok = false, error = 'challenge_expired' }) end
    if record.fallbackCodeEnabled ~= true then return cjson.encode({ ok = false, error = 'fallback_code_disabled' }) end
    if tonumber(record.fallbackActorTgId or 0) ~= tonumber(ARGV[5]) then return cjson.encode({ ok = false, error = 'fallback_actor_not_allowed' }) end
    if tostring(record.browserVerifierHash or '') ~= ARGV[3] then return cjson.encode({ ok = false, error = 'browser_binding_mismatch' }) end
    if tonumber(record.codeLockedAt or 0) > 0 then return cjson.encode({ ok = false, error = 'code_locked' }) end
    local maxAttempts = tonumber(record.codeMaxAttempts or ARGV[4])
    if tostring(record.codeHash or '') ~= ARGV[2] then
      local attempts = tonumber(record.codeAttempts or 0) + 1
      record.codeAttempts = attempts
      local errorCode = 'invalid_code'
      if attempts >= maxAttempts then
        record.codeLockedAt = now
        errorCode = 'code_locked'
      end
      local ttl = math.max(30, math.ceil((tonumber(record.expiresAt or 0) - now) / 1000))
      redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ttl)
      return cjson.encode({ ok = false, error = errorCode, attemptsRemaining = math.max(0, maxAttempts - attempts) })
    end
    record.status = 'approved'
    record.approvedByTgId = tonumber(ARGV[5])
    record.approvedBy = 'fallback_code'
    record.approvedAt = now
    record.codeHash = ''
    local ttl = math.max(30, math.ceil((tonumber(record.expiresAt or 0) - now) / 1000))
    redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ttl)
    return cjson.encode({ ok = true, status = 'approved', actorTgId = tonumber(ARGV[5]) })
  `;
  const result = await evalJson(
    script,
    [challengeKey(challengeId)],
    [now, candidateHash, verifierHash, getCodeMaxAttempts(), fallbackActor],
  );
  if (result.ok) {
    await appendAdminWebAudit({
      section: 'auth',
      action: 'challenge_approved',
      actorTgId: fallbackActor,
      targetType: 'admin_web_challenge',
      targetId: String(challengeId || ''),
      reason: 'fallback_code',
    });
  }
  return result;
}

export async function issueSession(req, res, challengeId) {
  const verifier = readBrowserVerifier(req);
  if (!verifier) return { ok: false, error: 'browser_verifier_missing' };
  const sessionId = randomId(18);
  const now = Date.now();
  const verifierHash = browserVerifierHash(challengeId, verifier);
  const sessionTtl = getSessionTtlSec();
  const script = `
    local raw = redis.call('GET', KEYS[1])
    if not raw then return cjson.encode({ ok = false, error = 'challenge_not_found' }) end
    local decoded, record = pcall(cjson.decode, raw)
    if not decoded then return cjson.encode({ ok = false, error = 'auth_state_decode_failed' }) end
    local now = tonumber(ARGV[1])
    if tostring(record.browserVerifierHash or '') ~= ARGV[2] then return cjson.encode({ ok = false, error = 'browser_binding_mismatch' }) end
    if tonumber(record.expiresAt or 0) <= now then return cjson.encode({ ok = false, error = 'challenge_expired' }) end
    if tostring(record.status or '') == 'consumed' then
      local existingId = tostring(record.sessionId or '')
      if existingId == '' then return cjson.encode({ ok = false, error = 'challenge_consumed' }) end
      local existingRaw = redis.call('GET', ARGV[6] .. existingId)
      if not existingRaw then return cjson.encode({ ok = false, error = 'challenge_consumed' }) end
      local existingDecoded, existingSession = pcall(cjson.decode, existingRaw)
      if not existingDecoded or tonumber(existingSession.authVersion or 0) ~= tonumber(ARGV[7]) then
        return cjson.encode({ ok = false, error = 'challenge_consumed' })
      end
      return cjson.encode({ ok = true, status = 'consumed', sessionId = existingId, reused = true, actorTgId = tonumber(record.approvedByTgId or 0) })
    end
    if tostring(record.status or '') ~= 'approved' then return cjson.encode({ ok = false, error = 'challenge_not_approved', status = tostring(record.status or '') }) end
    local actor = tonumber(record.approvedByTgId or 0)
    if not actor or actor <= 0 then return cjson.encode({ ok = false, error = 'approved_actor_missing' }) end
    local sessionId = ARGV[3]
    local sessionTtl = tonumber(ARGV[4])
    local expiresAt = now + sessionTtl * 1000
    local session = {
      id = sessionId,
      actorTgId = actor,
      issuedAt = now,
      expiresAt = expiresAt,
      challengeId = tostring(record.id or ''),
      lastSeenAt = now,
      authVersion = tonumber(ARGV[7])
    }
    redis.call('SET', KEYS[2], cjson.encode(session), 'EX', sessionTtl)
    record.status = 'consumed'
    record.consumedAt = now
    record.sessionId = sessionId
    record.sessionIssuedAt = now
    local challengeTtl = math.max(30, math.ceil((tonumber(record.expiresAt or 0) - now) / 1000))
    redis.call('SET', KEYS[1], cjson.encode(record), 'EX', challengeTtl)
    return cjson.encode({ ok = true, status = 'consumed', sessionId = sessionId, actorTgId = actor, reused = false })
  `;
  const result = await evalJson(
    script,
    [challengeKey(challengeId), sessionKey(sessionId)],
    [now, verifierHash, sessionId, sessionTtl, challengeId, sessionKeyPrefix(), ADMIN_WEB_AUTH_VERSION],
  );
  if (!result.ok) return result;
  setCookie(res, COOKIE_NAME, result.sessionId, { maxAge: sessionTtl, sameSite: 'Strict' });
  return result;
}

export async function getSession(req) {
  const cookies = parseCookies(req);
  const sessionId = String(cookies[COOKIE_NAME] || '').trim();
  if (!sessionId) return null;
  try {
    const session = await redis.get(sessionKey(sessionId));
    if (!session) return null;
    const now = Date.now();
    if (Number(session.authVersion || 0) !== ADMIN_WEB_AUTH_VERSION) {
      try { await redis.del(sessionKey(sessionId)); } catch {}
      return null;
    }
    if (Number(session.expiresAt || 0) <= now) {
      try { await redis.del(sessionKey(sessionId)); } catch {}
      return null;
    }
    if (isAdminSessionIdleExpired(session, getIdleTimeoutSec(), now)) {
      try { await redis.del(sessionKey(sessionId)); } catch {}
      return null;
    }
    const revokeBefore = Number((await redis.get(revokeBeforeKey())) || 0);
    if (revokeBefore && Number(session.issuedAt || 0) < revokeBefore) return null;
    return { ...session, id: sessionId };
  } catch {
    return null;
  }
}

export async function touchSession(session) {
  if (!session?.id) return false;
  const next = { ...session, lastSeenAt: Date.now() };
  try {
    await redis.set(sessionKey(session.id), next, { ex: Math.max(60, Math.ceil((Number(next.expiresAt || 0) - Date.now()) / 1000)) });
    return true;
  } catch {
    return false;
  }
}

export async function requireSession(req, res) {
  if (!isAdminWebReady()) {
    json(res, 503, { ok: false, error: 'admin_web_not_configured' });
    return null;
  }
  const session = await getSession(req);
  if (!session) {
    clearCookie(res, COOKIE_NAME);
    json(res, 401, { ok: false, error: 'unauthorized' });
    return null;
  }
  await touchSession(session);
  return session;
}

export async function requireFounderSession(req, res) {
  const session = await requireSession(req, res);
  if (!session) return null;
  if (!isFounderSession(session)) {
    json(res, 403, { ok: false, error: 'founder_only' });
    return null;
  }
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
    // Audit durability is tracked separately in STEP588X findings.
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
