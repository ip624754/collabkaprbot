import { createLoginChallenge } from '../../../src/lib/adminWeb/auth.js';
import { json, readJsonBody, timingSafeEq } from '../../../src/lib/adminWeb/common.js';
import { CFG } from '../../../src/lib/config.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  const body = await readJsonBody(req);
  const secret = String(body.secret || '');
  if (!CFG.ADMIN_WEB_ENABLED) return json(res, 503, { ok: false, error: 'admin_web_disabled' });
  if (!String(CFG.ADMIN_WEB_SECRET || '')) return json(res, 503, { ok: false, error: 'admin_web_secret_missing' });
  if (!timingSafeEq(secret, CFG.ADMIN_WEB_SECRET)) return json(res, 401, { ok: false, error: 'invalid_secret' });

  const result = await createLoginChallenge(req);
  return json(res, result.status || (result.ok ? 200 : 400), result);
}
