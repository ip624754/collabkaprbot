import { getChallenge, issueSession } from '../../../src/lib/adminWeb/auth.js';
import { json } from '../../../src/lib/adminWeb/common.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  const challengeId = String(req.query?.challengeId || '').trim();
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
