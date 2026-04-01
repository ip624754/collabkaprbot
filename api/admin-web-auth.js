import { approveChallenge, appendAdminWebAudit, clearAuthCookie, createLoginChallenge, getChallenge, getSession, isAdminWebReady, issueSession, logout, requireSession, revokeAllSessions, verifyChallengeCode } from '../src/lib/adminWeb/auth.js';
import { getSearchParam, html, json, readJsonBody, timingSafeEq } from '../src/lib/adminWeb/common.js';
import { CFG } from '../src/lib/config.js';

function page(title, body) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{margin:0;font-family:Inter,system-ui,Arial,sans-serif;background:#071021;color:#eef3ff;display:grid;place-items:center;min-height:100vh;padding:24px}.card{max-width:560px;background:rgba(12,21,44,.88);border:1px solid rgba(133,177,255,.25);border-radius:20px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.35)}h1{margin:0 0 10px;font-size:28px}p{margin:8px 0;color:#bfc9e6;line-height:1.5}</style></head><body><div class="card"><h1>${title}</h1><p>${body}</p><p>Можно вернуться в веб-админку и обновить статус входа.</p></div></body></html>`;
}

function getAction(req) {
  return String(getSearchParam(req, 'action', '') || '').trim().toLowerCase();
}

export default async function handler(req, res) {
  const action = getAction(req);

  if (action === 'decision') {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    const challengeId = String(getSearchParam(req, 'challengeId', '') || '').trim();
    const decision = String(getSearchParam(req, 'decision', '') || '').trim();
    const actor = Number(getSearchParam(req, 'actor', '0') || 0) || 0;
    const exp = Number(getSearchParam(req, 'exp', '0') || 0) || 0;
    const sig = String(getSearchParam(req, 'sig', '') || '').trim();
    const result = await approveChallenge({ challengeId, decision, actorTgId: actor, exp, sig });
    if (!result.ok) return html(res, 400, page('Не удалось обработать вход', `Причина: ${String(result.error || 'unknown')}`));
    if (decision === 'deny') return html(res, 200, page('Вход отклонён', 'Этот login challenge помечен как denied.'));
    return html(res, 200, page('Вход подтверждён', 'Challenge помечен как approved.'));
  }

  if (action === 'start') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    const body = await readJsonBody(req);
    const secret = String(body.secret || '');
    if (!CFG.ADMIN_WEB_ENABLED) return json(res, 503, { ok: false, error: 'admin_web_disabled' });
    if (!String(CFG.ADMIN_WEB_SECRET || '')) return json(res, 503, { ok: false, error: 'admin_web_secret_missing' });
    if (!timingSafeEq(secret, CFG.ADMIN_WEB_SECRET)) return json(res, 401, { ok: false, error: 'invalid_secret' });
    const result = await createLoginChallenge(req);
    return json(res, result.status || (result.ok ? 200 : 400), result);
  }

  if (action === 'status') {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    const challengeId = String(getSearchParam(req, 'challengeId', '') || '').trim();
    if (!challengeId) return json(res, 400, { ok: false, error: 'challenge_id_required' });
    const challenge = await getChallenge(challengeId);
    if (!challenge) return json(res, 404, { ok: false, error: 'challenge_not_found' });
    const status = String(challenge.status || 'pending');
    if (status === 'approved') {
      const issued = await issueSession(res, challengeId);
      if (!issued.ok) return json(res, 500, { ok: false, error: issued.error || 'session_issue_failed' });
    }
    return json(res, 200, {
      ok: true,
      challengeId,
      status,
      expiresAt: new Date(Number(challenge.expiresAt || 0)).toISOString(),
    });
  }

  if (action === 'verify_code') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    const body = await readJsonBody(req);
    const challengeId = String(body.challengeId || '').trim();
    const code = String(body.code || '').trim();
    if (!challengeId || !code) return json(res, 400, { ok: false, error: 'challenge_and_code_required' });
    const verified = await verifyChallengeCode(challengeId, code);
    if (!verified.ok) return json(res, 401, { ok: false, error: verified.error || 'invalid_code' });
    const issued = await issueSession(res, challengeId);
    if (!issued.ok) return json(res, 500, { ok: false, error: issued.error || 'session_issue_failed' });
    return json(res, 200, { ok: true });
  }

  if (action === 'me') {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    if (!isAdminWebReady()) return json(res, 503, { ok: false, error: 'admin_web_not_configured' });
    const session = await getSession(req);
    if (!session) return json(res, 401, { ok: false, error: 'unauthorized' });
    return json(res, 200, { ok: true, session: { actorTgId: Number(session.actorTgId || 0) || 0, expiresAt: session.expiresAt || 0, issuedAt: session.issuedAt || 0 } });
  }

  if (action === 'logout') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    const result = await logout(req, res);
    return json(res, 200, result);
  }

  if (action === 'revoke_all') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    const session = await requireSession(req, res);
    if (!session) return;
    const result = await revokeAllSessions();
    clearAuthCookie(res);
    if (result.ok) {
      await appendAdminWebAudit({ section: 'auth', action: 'revoke_all', actorTgId: session.actorTgId, targetType: 'session', targetId: 'all' });
    }
    return json(res, result.ok ? 200 : 500, result);
  }

  return json(res, 400, { ok: false, error: 'unknown_action' });
}
