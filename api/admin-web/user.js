import { requireSession } from '../../src/lib/adminWeb/auth.js';
import { json } from '../../src/lib/adminWeb/common.js';
import { getUserDetail } from '../../src/lib/adminWeb/readModels.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  const session = await requireSession(req, res);
  if (!session) return;
  const userId = Number(req.query?.id || 0) || 0;
  if (!userId) return json(res, 400, { ok: false, error: 'user_id_required' });
  const data = await getUserDetail(userId);
  if (!data) return json(res, 404, { ok: false, error: 'user_not_found' });
  return json(res, 200, { ok: true, data });
}
