import { logout } from '../../../src/lib/adminWeb/auth.js';
import { json } from '../../../src/lib/adminWeb/common.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  const result = await logout(req, res);
  return json(res, 200, result);
}
