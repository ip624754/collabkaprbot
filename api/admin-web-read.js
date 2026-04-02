import { appendAdminWebAudit, requireFounderSession, requireSession } from '../src/lib/adminWeb/auth.js';
import { getSearchParam, json } from '../src/lib/adminWeb/common.js';
import { getCommsSummary, getFounderSummary, getOverviewSummary, getPaymentDetail, getPaymentsSummary, getUserDetail, getUsersList } from '../src/lib/adminWeb/readModels.js';
import { getRuntimeSummary } from '../src/lib/adminWeb/runtime.js';
import { buildUsersCsvExport } from '../src/lib/adminWeb/usersExport.js';
import { getOperatorControlSnapshot } from '../src/lib/operatorControls.js';

function sendCsv(res, filename, body) {
  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', `attachment; filename="${String(filename || 'export.csv').replace(/"/g, '')}"`);
  res.send(body);
}

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
  if (section === 'users_export') {
    const exportPayload = await buildUsersCsvExport({
      scope: getSearchParam(req, 'scope', 'current'),
      currentSegment: getSearchParam(req, 'segment', 'all'),
      q: getSearchParam(req, 'q', ''),
    });
    await appendAdminWebAudit({
      section: 'users',
      action: 'export_users_csv',
      actorTgId: session.actorTgId,
      targetType: 'users_export',
      targetId: `${exportPayload.scope}:${exportPayload.segment}`,
      reason: `scope=${exportPayload.scope};segment=${exportPayload.segment};q=${exportPayload.search || '-'};rows=${exportPayload.rowsCount};truncated=${exportPayload.truncated ? 1 : 0}`,
      oldJson: null,
      newJson: {
        filename: exportPayload.filename,
        rows: exportPayload.rowsCount,
        truncated: exportPayload.truncated,
      },
    });
    return sendCsv(res, exportPayload.filename, exportPayload.csv);
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
  if (section === 'payment') {
    const id = Number(getSearchParam(req, 'id', '0') || 0) || 0;
    if (!id) return json(res, 400, { ok: false, error: 'payment_id_required' });
    const data = await getPaymentDetail(id);
    if (!data) return json(res, 404, { ok: false, error: 'payment_not_found' });
    return json(res, 200, { ok: true, data });
  }
  if (section === 'comms') {
    const data = await getCommsSummary();
    return json(res, 200, { ok: true, data });
  }
  if (section === 'founder') {
    const founderSession = await requireFounderSession(req, res);
    if (!founderSession) return;
    const data = await getFounderSummary(founderSession.actorTgId);
    return json(res, 200, { ok: true, data });
  }
  if (section === 'runtime') {
    const data = await getRuntimeSummary();
    return json(res, 200, { ok: true, data });
  }
  if (section === 'control_surface') {
    const data = await getOperatorControlSnapshot({ limit: 12 });
    return json(res, 200, { ok: true, data });
  }
  return json(res, 400, { ok: false, error: 'unknown_section' });
}
