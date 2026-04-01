import { pool } from '../../db/pool.js';
import { getAdminMetricsSnapshot, listUsersDirectory, getUserCardById } from '../../db/queries.js';
import { getAdminUserNote, getAdminUserNotesBulk } from './notes.js';
import { getRuntimeSummary } from './runtime.js';
import { getRecentAdminWebAudit } from './auth.js';

function buildUserSegment(row) {
  if (row?.has_brand_profile || row?.brand_plan || Number(row?.brand_credits || 0) > 0) return 'brand';
  if (row?.is_creator) return 'creator';
  if (row?.is_curator || row?.is_moderator) return 'curator';
  if (row?.is_manager) return 'manager';
  return 'user';
}


function buildDisplayName(row) {
  if (row?.tg_username) return `@${String(row.tg_username).trim()}`;
  if (row?._brand_profile?.brand_name) return String(row._brand_profile.brand_name).trim();
  return `user #${Number(row?.id || 0) || '—'}`;
}

function buildAccessSignals(row) {
  const out = [];
  if (row?.is_creator) out.push('creator');
  if (row?.has_brand_profile) out.push('brand');
  if (row?.is_curator) out.push('curator');
  if (row?.is_manager) out.push('manager');
  if (row?.is_moderator) out.push('moderator');
  if (Array.isArray(row?._workspaces) && row._workspaces.length) out.push('workspace_connected');
  if (Array.isArray(row?._workspaces) && row._workspaces.some((w) => w?.channel_id || w?.channel_username)) out.push('channel_connected');
  return out;
}


function normalizePaymentStatus(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'APPLIED' || raw === 'SUCCESS') return 'success';
  if (raw === 'RECEIVED' || raw === 'APPLYING' || raw === 'PENDING' || raw === 'PROCESSING') return 'pending';
  if (raw === 'ORPHANED' || raw === 'FALLBACK') return 'fallback';
  if (raw === 'ERROR' || raw === 'FAILED') return 'failed';
  return 'unknown';
}

function paymentStatusLabel(value) {
  const key = normalizePaymentStatus(value);
  return ({ success: 'success', pending: 'pending', failed: 'failed', fallback: 'fallback', unknown: 'unknown' })[key] || 'unknown';
}

function paymentOverallState(summary = {}) {
  if (!summary.available) return 'unknown';
  if (Number(summary.failed || 0) > 0 || Number(summary.fallback || 0) > 0 || Number(summary.pendingOld || 0) > 0) return 'degraded';
  return 'ok';
}

function buildPaymentWarnings(summary = {}) {
  const warnings = [];
  if (!summary.available) {
    warnings.push({ level: 'warning', message: 'Платёжная диагностика недоступна.', source: 'payments' });
    return warnings;
  }
  if (Number(summary.fallback || 0) > 0) warnings.push({ level: 'warning', message: `Есть fallback-платежи: ${Number(summary.fallback || 0)}`, source: 'payments' });
  if (Number(summary.failed || 0) > 0) warnings.push({ level: 'warning', message: `Есть failed-платежи: ${Number(summary.failed || 0)}`, source: 'payments' });
  if (Number(summary.pendingOld || 0) > 0) warnings.push({ level: 'warning', message: `Есть pending старше порога: ${Number(summary.pendingOld || 0)}`, source: 'payments' });
  if (!warnings.length) warnings.push({ level: 'info', message: 'Явных payment-предупреждений нет.', source: 'payments' });
  return warnings;
}

function buildActivitySummary(user, paymentLight) {
  const parts = [];
  const workspaceCount = Array.isArray(user?._workspaces) ? user._workspaces.length : 0;
  const curatorCount = Array.isArray(user?._curator_in) ? user._curator_in.length : 0;
  if (workspaceCount > 0) parts.push(`владелец ${workspaceCount} workspace` + (workspaceCount > 1 ? 's' : ''));
  if (curatorCount > 0) parts.push(`куратор в ${curatorCount}`);
  if (Number(paymentLight?.total || 0) > 0) parts.push(`платежей ${Number(paymentLight.total || 0)}`);
  return parts.length ? parts.join(' · ') : 'Нет выраженных сигналов активности.';
}

export async function getOverviewSummary() {
  const metrics = await getAdminMetricsSnapshot(7);
  const runtime = await getRuntimeSummary();
  const recentAudit = await getRecentAdminWebAudit(12);
  const cards = {
    usersTotal: Number(metrics?.users_total || 0),
    workspacesTotal: Number(metrics?.workspaces_total || 0),
    offersActive: Number(metrics?.offers_active || 0),
    giveawaysActive: Number(metrics?.giveaways_active || 0),
    paymentAlerts: Array.isArray(metrics?.payments)
      ? metrics.payments.filter((p) => String(p.status || '').toUpperCase() !== 'APPLIED').reduce((sum, p) => sum + Number(p.cnt || 0), 0)
      : 0,
    runtimeWarnings: Array.isArray(runtime?.notes) ? runtime.notes.length : 0,
  };
  return {
    cards,
    payments: Array.isArray(metrics?.payments) ? metrics.payments : [],
    analytics: metrics?.analytics_topline || null,
    runtime,
    recentAudit,
    ts: new Date().toISOString(),
  };
}

export async function getUsersList(params = {}) {
  const segment = String(params.segment || 'all').toLowerCase();
  const q = String(params.q || '').trim();
  const limit = Math.max(1, Math.min(50, Number(params.limit) || 20));
  const page = Math.max(0, Number(params.page) || 0);
  const offset = page * limit;

  const rows = await listUsersDirectory(segment, limit, offset, q);
  const noteMap = await getAdminUserNotesBulk(rows.map((x) => x.user_id));

  const items = rows.map((row) => {
    const note = noteMap.get(Number(row.user_id || 0)) || null;
    return {
      userId: Number(row.user_id || 0),
      tgId: Number(row.tg_id || 0),
      username: row.tg_username || '',
      createdAt: row.created_at || null,
      brandPlan: row.brand_plan || '',
      brandPlanUntil: row.brand_plan_until || null,
      brandCredits: Number(row.brand_credits || 0),
      segment: buildUserSegment(row),
      flags: {
        isCreator: !!row.is_creator,
        isCurator: !!row.is_curator,
        isModerator: !!row.is_moderator,
        isManager: !!row.is_manager,
        hasBrandProfile: !!row.has_brand_profile,
      },
      hasNote: !!note,
      notePreview: note?.text ? String(note.text).slice(0, 120) : '',
    };
  });

  return { items, page, limit, hasNext: rows.length === limit };
}

export async function getUserDetail(userId) {
  const user = await getUserCardById(Number(userId || 0));
  if (!user) return null;
  const note = await getAdminUserNote(user.id);

  let paymentLight = { total: 0, applied: 0, pending: 0, lastPaymentAt: null };
  try {
    const r = await pool.query(
      `select
         count(*)::int as total,
         count(*) filter (where upper(status)='APPLIED')::int as applied,
         count(*) filter (where upper(status)!='APPLIED')::int as pending,
         max(created_at) as last_payment_at
       from payments
       where user_id = $1`,
      [user.id]
    );
    paymentLight = {
      total: Number(r.rows?.[0]?.total || 0),
      applied: Number(r.rows?.[0]?.applied || 0),
      pending: Number(r.rows?.[0]?.pending || 0),
      lastPaymentAt: r.rows?.[0]?.last_payment_at || null,
    };
  } catch {
    // leave defaults
  }

  const segment = buildUserSegment(user);
  const workspaces = Array.isArray(user._workspaces) ? user._workspaces : [];
  const curatorIn = Array.isArray(user._curator_in) ? user._curator_in : [];
  const signals = buildAccessSignals(user);
  const hasChannel = workspaces.some((w) => w?.channel_id || w?.channel_username);
  const channelLabel = hasChannel
    ? workspaces.filter((w) => w?.channel_id || w?.channel_username).map((w) => w.channel_username ? `@${String(w.channel_username).replace(/^@/, '')}` : `channel ${w.channel_id}`).join(' · ')
    : '';
  const recentAdminAudit = await getRecentAdminWebAudit(12, { targetType: 'user', targetId: String(user.id) });

  const detail = {
    user: {
      id: Number(user.id || 0),
      tgId: Number(user.tg_id || 0),
      username: user.tg_username || '',
      displayName: buildDisplayName(user),
      createdAt: user.created_at || null,
      updatedAt: user.updated_at || null,
      bannedAt: user.banned_at || null,
      status: user.banned_at ? 'banned' : 'active',
      segment,
      flags: {
        isCreator: !!user.is_creator,
        isCurator: !!user.is_curator,
        isModerator: !!user.is_moderator,
        isManager: !!user.is_manager,
        hasBrandProfile: !!user.has_brand_profile,
      },
      workspaces,
      curatorIn,
      brandProfile: user._brand_profile || null,
    },
    account: {
      plan: user.brand_plan || '',
      planUntil: user.brand_plan_until || null,
      credits: Number(user.brand_credits || 0),
      creditsLabel: Number(user.brand_credits || 0) > 0 ? `${Number(user.brand_credits || 0)} credits` : 'no credits',
    },
    access: {
      hasWorkspace: workspaces.length > 0,
      workspaces,
      hasChannel,
      channelLabel,
      curatorIn,
      hasBrandProfile: !!user.has_brand_profile,
      brandProfile: user._brand_profile || null,
      signals,
    },
    activity: {
      createdAt: user.created_at || null,
      lastSeenAt: user.updated_at || user.created_at || null,
      recentSummary: buildActivitySummary(user, paymentLight),
      lastImportantAction: paymentLight.lastPaymentAt || user.updated_at || user.created_at || null,
      lightCounters: {
        workspacesOwned: workspaces.length,
        curatorIn: curatorIn.length,
        payments: Number(paymentLight.total || 0),
      },
    },
    note,
    paymentLight,
    recentAdminAudit,
    // Back-compat fields for STEP499 shell until STEP501 UI fully replaces them everywhere.
    paymentLightLegacy: paymentLight,
  };

  return detail;
}



export async function getPaymentsSummary() {
  const out = {
    updatedAt: new Date().toISOString(),
    overall: { state: 'unknown', label: 'Данные пока недоступны' },
    summary: { total: 0, recent: 0, successful: 0, pending: 0, warnings: 0, needsReview: 0 },
    warnings: [{ level: 'info', message: 'Платёжных событий пока нет.', source: 'payments' }],
    groups: { success: 0, pending: 0, failed: 0, fallback: 0 },
    recentPayments: [],
    hints: [{ kind: 'info', message: 'Read-only режим: для любых ручных действий использовать bot/admin fallback.' }],
  };

  let summary = {
    available: false,
    total: 0,
    recent: 0,
    successful: 0,
    pending: 0,
    failed: 0,
    fallback: 0,
    pendingOld: 0,
    latestEventAt: null,
  };

  try {
    const r = await pool.query(
      `select
         count(*)::int as total,
         count(*) filter (where created_at >= now() - interval '7 days')::int as recent,
         count(*) filter (where upper(status) = 'APPLIED')::int as successful,
         count(*) filter (where upper(status) in ('RECEIVED','APPLYING','PENDING','PROCESSING'))::int as pending,
         count(*) filter (where upper(status) in ('ERROR','FAILED'))::int as failed,
         count(*) filter (where upper(status) in ('ORPHANED','FALLBACK'))::int as fallback,
         count(*) filter (where upper(status) in ('RECEIVED','APPLYING','PENDING','PROCESSING') and created_at < now() - interval '30 minutes')::int as pending_old,
         max(updated_at) as latest_event_at
       from payments`
    );
    summary = {
      available: true,
      total: Number(r.rows?.[0]?.total || 0),
      recent: Number(r.rows?.[0]?.recent || 0),
      successful: Number(r.rows?.[0]?.successful || 0),
      pending: Number(r.rows?.[0]?.pending || 0),
      failed: Number(r.rows?.[0]?.failed || 0),
      fallback: Number(r.rows?.[0]?.fallback || 0),
      pendingOld: Number(r.rows?.[0]?.pending_old || 0),
      latestEventAt: r.rows?.[0]?.latest_event_at || null,
    };
  } catch {
    // keep safe defaults
  }

  let recentPayments = [];
  if (summary.available) {
    try {
      const r = await pool.query(
        `select p.id, p.user_id, p.kind, p.currency, p.total_amount, p.status, p.created_at, p.updated_at,
                u.tg_id, u.tg_username
           from payments p
      left join users u on u.id = p.user_id
          order by p.created_at desc
          limit 12`
      );
      recentPayments = Array.isArray(r.rows)
        ? r.rows.map((row) => ({
            id: Number(row.id || 0),
            userId: Number(row.user_id || 0),
            tgId: Number(row.tg_id || 0),
            username: row.tg_username || '',
            displayName: row.tg_username ? `@${String(row.tg_username).trim()}` : `user #${Number(row.user_id || 0) || '—'}`,
            kind: String(row.kind || '').trim() || 'payment',
            amountLabel: `${Number(row.total_amount || 0)} ${String(row.currency || '').trim() || 'XTR'}`,
            status: paymentStatusLabel(row.status),
            createdAt: row.created_at || null,
            updatedAt: row.updated_at || null,
          }))
        : [];
    } catch {
      recentPayments = [];
    }
  }

  out.updatedAt = summary.latestEventAt || out.updatedAt;
  out.overall = {
    state: paymentOverallState(summary),
    label: summary.available
      ? (paymentOverallState(summary) === 'ok' ? 'Платёжная поверхность выглядит стабильно' : 'Есть сигналы, требующие проверки')
      : 'Платёжная диагностика недоступна',
  };
  out.summary = {
    total: summary.total,
    recent: summary.recent,
    successful: summary.successful,
    pending: summary.pending,
    warnings: Number(summary.failed || 0) + Number(summary.fallback || 0) + Number(summary.pendingOld || 0),
    needsReview: Number(summary.failed || 0) + Number(summary.fallback || 0) + Number(summary.pendingOld || 0),
  };
  out.groups = {
    success: summary.successful,
    pending: summary.pending,
    failed: summary.failed,
    fallback: summary.fallback,
  };
  out.warnings = buildPaymentWarnings(summary);
  out.recentPayments = recentPayments;
  out.hints = [
    {
      kind: out.overall.state === 'ok' ? 'info' : 'warning',
      message: out.overall.state === 'ok'
        ? 'Read-only режим: для ручных действий использовать bot/admin fallback.'
        : 'Есть payment-сигналы для founder/operator проверки. Web surface остаётся read-only.',
    },
  ];
  return out;
}

