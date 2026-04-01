import { requireSession } from '../src/lib/adminWeb/auth.js';
import { getSearchParam, json } from '../src/lib/adminWeb/common.js';
import { getOverviewSummary, getPaymentsSummary, getUserDetail, getUsersList } from '../src/lib/adminWeb/readModels.js';
import { getRuntimeSummary } from '../src/lib/adminWeb/runtime.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  const session = await requireSession(req, res);
  if (!session) return;

  const section = String(getSearchParam(req, 'section', '') || '').trim().toLowerCase();
  if (section === 'overview') {
    const data = await getOverviewSummary();
    return json(res, 200, { ok: true, data });
  }
  if (section === 'users') {
    const data = await getUsersList({
      q: getSearchParam(req, 'q', ''),
      segment: getSearchParam(req, 'segment', 'all'),
      limit: getSearchParam(req, 'limit', '20'),
      page: getSearchParam(req, 'page', '0'),
    });
    return json(res, 200, { ok: true, data });
  }
  if (section === 'user') {
    const id = Number(getSearchParam(req, 'id', '0') || 0) || 0;
    if (!id) return json(res, 400, { ok: false, error: 'user_id_required' });
    const data = await getUserDetail(id);
    if (!data) return json(res, 404, { ok: false, error: 'user_not_found' });
    return json(res, 200, { ok: true, data });
  }

  if (section === 'payments') {
    const data = await getPaymentsSummary();
    return json(res, 200, { ok: true, data });
  }
  if (section === 'runtime') {
    const data = await getRuntimeSummary();
    return json(res, 200, { ok: true, data });
  }
  return json(res, 400, { ok: false, error: 'unknown_section' });
}
