import {
  appendAdminWebAudit,
  clearAuthCookie,
  consumeAdminAuthRateLimit,
  createLoginChallenge,
  getChallengeStatusForBrowser,
  getSession,
  isAdminWebReady,
  isFounderActorTgId,
  issueSession,
  logout,
  requireFounderSession,
  revokeAllSessions,
  touchSession,
  verifyChallengeCode,
} from '../src/lib/adminWeb/auth.js';
import { getClientIp, getSearchParam, html, json, readJsonBody, timingSafeEq } from '../src/lib/adminWeb/common.js';
import { CFG } from '../src/lib/config.js';

function page(title, body) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{margin:0;font-family:Inter,system-ui,Arial,sans-serif;background:#071021;color:#eef3ff;display:grid;place-items:center;min-height:100vh;padding:24px}.card{max-width:560px;background:rgba(12,21,44,.88);border:1px solid rgba(133,177,255,.25);border-radius:20px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.35)}h1{margin:0 0 10px;font-size:28px}p{margin:8px 0;color:#bfc9e6;line-height:1.5}</style></head><body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`;
}

function getAction(req) {
  return String(getSearchParam(req, 'action', '') || '').trim().toLowerCase();
}

function rateLimitSubject(req, suffix = '') {
  return `${getClientIp(req) || 'unknown'}:${String(suffix || '')}`;
}

function rateLimitResponse(res, result) {
  if (!result?.ok) {
    json(res, 503, { ok: false, error: result?.error || 'auth_rate_limit_unavailable' });
    return true;
  }
  if (result.allowed) return false;
  const retryAfterSec = Math.max(1, Number(result.retryAfterSec || 60));
  res.setHeader('Retry-After', String(retryAfterSec));
  json(res, 429, { ok: false, error: 'rate_limited', retryAfterSec });
  return true;
}

function authErrorStatus(error) {
  const code = String(error || '');
  if (code === 'auth_store_unavailable' || code === 'session_store_failed') return 503;
  if (code === 'challenge_not_found') return 404;
  if (code === 'challenge_expired') return 410;
  if (code === 'browser_verifier_missing' || code === 'browser_binding_mismatch') return 403;
  if (code === 'challenge_not_approved' || code === 'challenge_not_pending' || code === 'challenge_consumed') return 409;
  if (code === 'fallback_code_disabled' || code === 'fallback_actor_not_allowed') return 403;
  if (code === 'code_locked') return 423;
  if (code === 'invalid_code') return 401;
  if (code === 'approved_actor_missing') return 409;
  return 400;
}

export default async function handler(req, res) {
  const action = getAction(req);

  // Legacy signed decision URLs are deliberately non-mutating now.
  if (action === 'decision') {
    return html(res, 410, page(
      'Ссылка подтверждения отключена',
      'Вход больше не подтверждается через web-ссылку. Используй Telegram callback-кнопку в сообщении от бота.',
    ));
  }

  if (action === 'start') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    if (!CFG.ADMIN_WEB_ENABLED) return json(res, 503, { ok: false, error: 'admin_web_disabled' });
    if (!String(CFG.ADMIN_WEB_SECRET || '')) return json(res, 503, { ok: false, error: 'admin_web_secret_missing' });
    const throttle = await consumeAdminAuthRateLimit({
      scope: 'start',
      subject: rateLimitSubject(req),
      limit: CFG.ADMIN_WEB_START_RATE_LIMIT,
      windowSec: CFG.ADMIN_WEB_START_RATE_WINDOW_SEC,
    });
    if (rateLimitResponse(res, throttle)) return;

    const body = await readJsonBody(req);
    const secret = String(body.secret || '');
    if (!timingSafeEq(secret, CFG.ADMIN_WEB_SECRET)) return json(res, 401, { ok: false, error: 'invalid_secret' });
    const result = await createLoginChallenge(req, res);
    return json(res, result.status || (result.ok ? 200 : 400), result);
  }

  if (action === 'status') {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    const challengeId = String(getSearchParam(req, 'challengeId', '') || '').trim();
    if (!challengeId) return json(res, 400, { ok: false, error: 'challenge_id_required' });
    const result = await getChallengeStatusForBrowser(req, challengeId);
    if (!result.ok) return json(res, result.status || authErrorStatus(result.error), result);
    return json(res, 200, {
      ok: true,
      challengeId: result.challengeId,
      status: result.status,
      expiresAt: new Date(Number(result.expiresAt || 0)).toISOString(),
      fallbackCodeEnabled: result.fallbackCodeEnabled === true,
    });
  }

  if (action === 'exchange') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    const body = await readJsonBody(req);
    const challengeId = String(body.challengeId || '').trim();
    if (!challengeId) return json(res, 400, { ok: false, error: 'challenge_id_required' });
    const issued = await issueSession(req, res, challengeId);
    if (!issued.ok) return json(res, authErrorStatus(issued.error), { ok: false, error: issued.error || 'session_issue_failed' });
    return json(res, 200, { ok: true, reused: issued.reused === true });
  }

  if (action === 'verify_code') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    const body = await readJsonBody(req);
    const challengeId = String(body.challengeId || '').trim();
    const code = String(body.code || '').trim();
    if (!challengeId || !code) return json(res, 400, { ok: false, error: 'challenge_and_code_required' });

    const throttle = await consumeAdminAuthRateLimit({
      scope: 'code',
      subject: rateLimitSubject(req, challengeId),
      limit: CFG.ADMIN_WEB_CODE_RATE_LIMIT,
      windowSec: CFG.ADMIN_WEB_CODE_RATE_WINDOW_SEC,
    });
    if (rateLimitResponse(res, throttle)) return;

    const verified = await verifyChallengeCode(req, challengeId, code);
    if (!verified.ok) {
      return json(res, authErrorStatus(verified.error), {
        ok: false,
        error: verified.error || 'invalid_code',
        attemptsRemaining: Number(verified.attemptsRemaining || 0),
      });
    }
    const issued = await issueSession(req, res, challengeId);
    if (!issued.ok) return json(res, authErrorStatus(issued.error), { ok: false, error: issued.error || 'session_issue_failed' });
    return json(res, 200, { ok: true, reused: issued.reused === true });
  }

  if (action === 'me') {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    if (!isAdminWebReady()) return json(res, 503, { ok: false, error: 'admin_web_not_configured' });
    const session = await getSession(req);
    if (!session) {
      clearAuthCookie(res);
      return json(res, 401, { ok: false, error: 'unauthorized' });
    }
    await touchSession(session);
    return json(res, 200, {
      ok: true,
      session: {
        actorTgId: Number(session.actorTgId || 0) || 0,
        isFounder: isFounderActorTgId(session.actorTgId),
        expiresAt: session.expiresAt || 0,
        issuedAt: session.issuedAt || 0,
        idleTimeoutSec: Number(CFG.ADMIN_WEB_IDLE_TIMEOUT_SEC || 0) || 0,
      },
    });
  }

  if (action === 'logout') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    const result = await logout(req, res);
    return json(res, 200, result);
  }

  if (action === 'revoke_all') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    const session = await requireFounderSession(req, res);
    if (!session) return;
    const result = await revokeAllSessions();
    clearAuthCookie(res);
    if (result.ok) {
      await appendAdminWebAudit({
        section: 'founder',
        action: 'revoke_all_sessions',
        actorTgId: session.actorTgId,
        targetType: 'session',
        targetId: 'all',
        reason: 'founder_split',
      });
    }
    return json(res, result.ok ? 200 : 500, result);
  }

  return json(res, 400, { ok: false, error: 'unknown_action' });
}
