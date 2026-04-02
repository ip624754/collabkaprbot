import { appendAdminWebAudit, requireFounderSession, requireSession } from '../src/lib/adminWeb/auth.js';
import { getSearchParam, json } from '../src/lib/adminWeb/common.js';
import { getCommsSummary, getFounderSummary, getOverviewSummary, getPaymentDetail, getPaymentsSummary, getUserDetail, getUsersList } from '../src/lib/adminWeb/readModels.js';
import { getRuntimeSummary } from '../src/lib/adminWeb/runtime.js';
import { buildUsersCsvExport } from '../src/lib/adminWeb/usersExport.js';
import { buildUsersBulkPayload } from '../src/lib/adminWeb/usersBulk.js';
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
      planState: getSearchParam(req, 'plan_state', 'all'),
      creditsState: getSearchParam(req, 'credits_state', 'all'),
      channelState: getSearchParam(req, 'channel_state', 'all'),
      activityWindow: getSearchParam(req, 'activity_window', 'all'),
      paymentsState: getSearchParam(req, 'payments_state', 'all'),
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
      filters: {
        planState: getSearchParam(req, 'plan_state', 'all'),
        creditsState: getSearchParam(req, 'credits_state', 'all'),
        channelState: getSearchParam(req, 'channel_state', 'all'),
        activityWindow: getSearchParam(req, 'activity_window', 'all'),
        paymentsState: getSearchParam(req, 'payments_state', 'all'),
      },
    });
    await appendAdminWebAudit({
      section: 'users',
      action: 'export_users_csv',
      actorTgId: session.actorTgId,
      targetType: 'users_export',
      targetId: `${exportPayload.scope}:${exportPayload.segment}`,
      reason: `scope=${exportPayload.scope};segment=${exportPayload.segment};q=${exportPayload.search || '-'};plan=${exportPayload.filters?.planState || 'all'};credits=${exportPayload.filters?.creditsState || 'all'};channel=${exportPayload.filters?.channelState || 'all'};activity=${exportPayload.filters?.activityWindow || 'all'};payments=${exportPayload.filters?.paymentsState || 'all'};rows=${exportPayload.rowsCount};truncated=${exportPayload.truncated ? 1 : 0}`,
      oldJson: null,
      newJson: {
        filename: exportPayload.filename,
        rows: exportPayload.rowsCount,
        truncated: exportPayload.truncated,
      },
    });
    return sendCsv(res, exportPayload.filename, exportPayload.csv);
  }
  if (section === 'users_bulk') {
    const idsRaw = String(getSearchParam(req, 'ids', '') || '').trim();
    const userIds = idsRaw ? idsRaw.split(',').map((value) => Number(value || 0) || 0).filter((value) => value > 0) : [];
    const payload = await buildUsersBulkPayload({
      mode: getSearchParam(req, 'mode', 'tg_ids'),
      currentSegment: getSearchParam(req, 'segment', 'all'),
      q: getSearchParam(req, 'q', ''),
      userIds,
      filters: {
        planState: getSearchParam(req, 'plan_state', 'all'),
        creditsState: getSearchParam(req, 'credits_state', 'all'),
        channelState: getSearchParam(req, 'channel_state', 'all'),
        activityWindow: getSearchParam(req, 'activity_window', 'all'),
        paymentsState: getSearchParam(req, 'payments_state', 'all'),
      },
    });
    await appendAdminWebAudit({
      section: 'users',
      action: 'copy_users_bulk',
      actorTgId: session.actorTgId,
      targetType: 'users_bulk',
      targetId: `${payload.mode}:${payload.source}`,
      reason: `mode=${payload.mode};source=${payload.source};segment=${payload.segment};q=${payload.search || '-'};plan=${payload.filters?.planState || 'all'};credits=${payload.filters?.creditsState || 'all'};channel=${payload.filters?.channelState || 'all'};activity=${payload.filters?.activityWindow || 'all'};payments=${payload.filters?.paymentsState || 'all'};rows=${payload.rowsCount};truncated=${payload.truncated ? 1 : 0};ids=${payload.userIds.length}`,
      oldJson: null,
      newJson: {
        mode: payload.mode,
        source: payload.source,
        rows: payload.rowsCount,
        preview: payload.preview,
      },
    });
    return json(res, 200, { ok: true, data: payload });
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
