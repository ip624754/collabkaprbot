import { requireSession } from '../../src/lib/adminWeb/auth.js';
import { json } from '../../src/lib/adminWeb/common.js';
import { getOverviewSummary } from '../../src/lib/adminWeb/readModels.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  const session = await requireSession(req, res);
  if (!session) return;
  const data = await getOverviewSummary();
  return json(res, 200, { ok: true, data });
}
