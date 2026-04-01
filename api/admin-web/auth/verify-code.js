import { issueSession, verifyChallengeCode } from '../../../src/lib/adminWeb/auth.js';
import { json, readJsonBody } from '../../../src/lib/adminWeb/common.js';

export default async function handler(req, res) {
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
