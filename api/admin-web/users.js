import { requireSession } from '../../src/lib/adminWeb/auth.js';
import { json } from '../../src/lib/adminWeb/common.js';
import { getUsersList } from '../../src/lib/adminWeb/readModels.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  const session = await requireSession(req, res);
  if (!session) return;
  const data = await getUsersList({
    segment: req.query?.segment,
    q: req.query?.q,
    limit: req.query?.limit,
    page: req.query?.page,
  });
  return json(res, 200, { ok: true, data });
}
