import { pool } from '../../db/pool.js';
import { getAdminMetricsSnapshot, listUsersDirectory, getUserCardById } from '../../db/queries.js';
import { getAdminUserNote, getAdminUserNotesBulk } from './notes.js';
import { getRuntimeSummary } from './runtime.js';
import { getRecentAdminWebAudit, isFounderActorTgId } from './auth.js';
import { CFG } from '../config.js';

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


function normalizeBroadcastStatus(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'PENDING' || raw === 'DRAFT') return 'pending';
  if (raw === 'RUNNING') return 'running';
  if (raw === 'PAUSED') return 'paused';
  if (raw === 'DONE') return 'done';
  if (raw === 'ERROR') return 'error';
  if (raw === 'STOPPED') return 'stopped';
  return 'unknown';
}

function commsOverallState(summary = {}) {
  if (!summary.available) return 'unknown';
  if (Number(summary.blocked || 0) > 0 || Number(summary.failed || 0) > 0 || Number(summary.deferred || 0) > 0 || Number(summary.quarantined || 0) > 0 || Number(summary.cooldownActive || 0) > 0 || Number(summary.active || 0) > 0) return 'degraded';
  return 'ok';
}

function normalizeCommsAudience(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({ all: 'all', brands: 'brands', creators: 'creators', curators: 'curators', managers: 'managers' })[key] || 'all';
}

function buildDraftTitle(row = {}) {
  const explicit = String(row.draft_caption || '').trim();
  if (explicit) return explicit.slice(0, 80);
  const text = String(row.draft_text || '').trim();
  if (!text) return 'Untitled draft';
  return text.split(/\n+/)[0].trim().slice(0, 80) || 'Untitled draft';
}

function buildCommsWarnings(summary = {}, extra = {}) {
  const warnings = [];
  if (!summary.available) {
    warnings.push({ level: 'warning', message: 'Comms workspace недоступен.', source: 'comms' });
    return warnings;
  }
  if (Number(summary.cooldownActive || 0) > 0) warnings.push({ level: 'warning', message: `Есть active cooldown notices: ${Number(summary.cooldownActive || 0)}`, source: 'broadcasts' });
  if (Number(summary.blocked || 0) > 0) warnings.push({ level: 'warning', message: `Есть blocked deliveries: ${Number(summary.blocked || 0)}`, source: 'outbox' });
  if (Number(summary.failed || 0) > 0) warnings.push({ level: 'warning', message: `Есть failed deliveries: ${Number(summary.failed || 0)}`, source: 'outbox' });
  if (Number(summary.deferred || 0) > 0 || Number(summary.quarantined || 0) > 0) warnings.push({ level: 'warning', message: `Есть deferred/quarantined retries: ${Number(summary.deferred || 0) + Number(summary.quarantined || 0)}`, source: 'outbox' });
  if (Number(extra.draftsWithoutTest || 0) > 0) warnings.push({ level: 'info', message: `Есть draft без founder test-send: ${Number(extra.draftsWithoutTest || 0)}`, source: 'drafts' });
  if (!warnings.length) warnings.push({ level: 'info', message: 'Явных comms-предупреждений нет.', source: 'comms' });
  return warnings;
}

function buildCommsHints(summary = {}, extra = {}) {
  if (!summary.available) {
    return [{ kind: 'warning', message: 'Broadcasts / outbox таблицы недоступны. Проверь schema и runtime baseline.' }];
  }
  const hints = [];
  if (Number(summary.active || 0) > 0) hints.push({ kind: 'warning', message: 'Есть активные notices. Live send по-прежнему остаётся вне web и должен идти через bot/admin fallback.' });
  if (Number(summary.drafts || 0) > 0) hints.push({ kind: 'info', message: 'Drafts можно править в web и проверять через founder test-send без live mass send.' });
  if (Number(summary.blocked || 0) > 0 || Number(summary.failed || 0) > 0) hints.push({ kind: 'warning', message: 'Есть blocked / failed deliveries. Проверь outbox snapshot и operator fallback в Telegram-admin.' });
  if (Number(extra.recentTestSends || 0) > 0) hints.push({ kind: 'info', message: `Недавние founder test-sends: ${Number(extra.recentTestSends || 0)}.` });
  if (!hints.length) hints.push({ kind: 'info', message: 'Drafts, notices и outbox выглядят спокойно. Web workspace остаётся safe и read-first.' });
  return hints.slice(0, 4);
}

export async function getCommsSummary() {
  const out = {
    updatedAt: new Date().toISOString(),
    overall: { state: 'unknown', label: 'Данные пока недоступны' },
    summary: {
      drafts: 0,
      recentNotices: 0,
      outboxPending: 0,
      outboxWarnings: 0,
      recentTestSends: 0,
      warnings: 0,
      total: 0,
      active: 0,
      doneRecent: 0,
      blocked: 0,
    },
    warnings: [{ level: 'info', message: 'Notice rows пока отсутствуют.', source: 'comms' }],
    drafts: [],
    recentNotices: [],
    outbox: { queued: 0, processing: 0, warning: 0, failed: 0, sent: 0, blocked: 0, deferred: 0, quarantined: 0 },
    hints: [{ kind: 'info', message: 'Live send из web отключён. Используйте draft preview и founder test-send.' }],
    recentAdminAudit: [],
    recentBroadcasts: [],
    groups: { queued: 0, sent: 0, blocked: 0, deferred: 0, quarantined: 0 },
  };

  let summary = {
    available: false,
    total: 0,
    drafts: 0,
    active: 0,
    doneRecent: 0,
    errors: 0,
    stopped: 0,
    cooldownActive: 0,
    queued: 0,
    sent: 0,
    blocked: 0,
    deferred: 0,
    quarantined: 0,
    failed: 0,
    latestEventAt: null,
  };

  try {
    const r = await pool.query(`
      with bc as (
        select
          count(*)::int as total,
          count(*) filter (where upper(status) = 'PENDING')::int as drafts,
          count(*) filter (where upper(status) in ('RUNNING','PAUSED'))::int as active,
          count(*) filter (where upper(status) = 'DONE' and created_at >= now() - interval '7 days')::int as done_recent,
          count(*) filter (where upper(status) = 'ERROR')::int as errors,
          count(*) filter (where upper(status) = 'STOPPED')::int as stopped,
          count(*) filter (where cooldown_until is not null and cooldown_until > now())::int as cooldown_active,
          max(updated_at) as latest_broadcast_at
        from broadcasts
      ), sl as (
        select
          count(*) filter (where status = 'queued')::int as queued,
          count(*) filter (where status = 'sent')::int as sent,
          count(*) filter (where status = 'blocked')::int as blocked,
          count(*) filter (where status = 'deferred')::int as deferred,
          count(*) filter (where status = 'quarantined')::int as quarantined,
          count(*) filter (where status = 'failed')::int as failed,
          max(sent_at) as latest_sent_at
        from broadcast_sent_log
      )
      select
        bc.total, bc.drafts, bc.active, bc.done_recent, bc.errors, bc.stopped, bc.cooldown_active, bc.latest_broadcast_at,
        sl.queued, sl.sent, sl.blocked, sl.deferred, sl.quarantined, sl.failed, sl.latest_sent_at
      from bc cross join sl
    `);
    const row = r.rows?.[0] || {};
    summary = {
      available: true,
      total: Number(row.total || 0),
      drafts: Number(row.drafts || 0),
      active: Number(row.active || 0),
      doneRecent: Number(row.done_recent || 0),
      errors: Number(row.errors || 0),
      stopped: Number(row.stopped || 0),
      cooldownActive: Number(row.cooldown_active || 0),
      queued: Number(row.queued || 0),
      sent: Number(row.sent || 0),
      blocked: Number(row.blocked || 0),
      deferred: Number(row.deferred || 0),
      quarantined: Number(row.quarantined || 0),
      failed: Number(row.failed || 0),
      latestEventAt: row.latest_sent_at || row.latest_broadcast_at || null,
    };
  } catch {
    // keep defaults
  }

  let recentRows = [];
  if (summary.available) {
    try {
      const r = await pool.query(`
        select
          b.id, b.status, b.audience, b.draft_type, b.draft_text, b.draft_caption, b.total_count, b.created_at, b.updated_at,
          u.tg_username,
          coalesce(st.sent, 0)::int as sent_count,
          coalesce(st.queued, 0)::int as queued_count,
          coalesce(st.blocked, 0)::int as blocked_count,
          coalesce(st.failed, 0)::int as failed_count
        from broadcasts b
        left join users u on u.id = b.created_by_user_id
        left join lateral (
          select
            count(*) filter (where status = 'sent') as sent,
            count(*) filter (where status = 'queued') as queued,
            count(*) filter (where status = 'blocked') as blocked,
            count(*) filter (where status = 'failed') as failed
          from broadcast_sent_log sl
          where sl.broadcast_id = b.id
        ) st on true
        order by b.updated_at desc, b.id desc
        limit 20
      `);
      recentRows = Array.isArray(r.rows) ? r.rows.map((row) => ({
        id: Number(row.id || 0),
        status: normalizeBroadcastStatus(row.status),
        audience: normalizeCommsAudience(row.audience),
        kind: String(row.draft_type || '').trim() || 'notice',
        title: buildDraftTitle(row),
        bodyText: String(row.draft_text || '').trim(),
        preview: String(row.draft_text || row.draft_caption || '').trim().slice(0, 140),
        totalCount: Number(row.total_count || 0),
        createdByLabel: row.tg_username ? `@${String(row.tg_username).trim()}` : 'operator',
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
        outbox: {
          sent: Number(row.sent_count || 0),
          queued: Number(row.queued_count || 0),
          blocked: Number(row.blocked_count || 0),
          failed: Number(row.failed_count || 0),
        },
      })) : [];
    } catch {
      recentRows = [];
    }
  }

  const drafts = recentRows.filter((item) => item.status === 'pending').slice(0, 8);
  const recentNotices = recentRows.filter((item) => item.status !== 'pending').slice(0, 10);
  const recentAdminAudit = (await getRecentAdminWebAudit(20)).filter((item) => String(item?.section || '') === 'comms');
  const recentTestSends = recentAdminAudit.filter((item) => String(item?.action || '') === 'test_send_notice').length;
  const warnings = buildCommsWarnings(summary, { draftsWithoutTest: drafts.length && !recentTestSends ? drafts.length : 0 });

  out.updatedAt = summary.latestEventAt || out.updatedAt;
  out.overall = {
    state: commsOverallState(summary),
    label: summary.available
      ? (commsOverallState(summary) === 'ok' ? 'Drafts, notices и outbox выглядят стабильно' : 'Есть comms-сигналы, требующие проверки')
      : 'Comms диагностика недоступна',
  };
  out.summary = {
    drafts: drafts.length,
    recentNotices: recentNotices.length,
    outboxPending: Number(summary.queued || 0) + Number(summary.deferred || 0) + Number(summary.quarantined || 0),
    outboxWarnings: Number(summary.blocked || 0) + Number(summary.failed || 0),
    recentTestSends,
    warnings: warnings.filter((item) => String(item.level || '') !== 'info').length,
    total: summary.total,
    active: summary.active,
    doneRecent: summary.doneRecent,
    blocked: Number(summary.blocked || 0) + Number(summary.failed || 0),
  };
  out.warnings = warnings;
  out.drafts = drafts;
  out.recentNotices = recentNotices;
  out.recentBroadcasts = recentRows;
  out.outbox = {
    queued: Number(summary.queued || 0),
    processing: Number(summary.deferred || 0),
    warning: Number(summary.blocked || 0) + Number(summary.quarantined || 0),
    failed: Number(summary.failed || 0),
    sent: Number(summary.sent || 0),
    blocked: Number(summary.blocked || 0),
    deferred: Number(summary.deferred || 0),
    quarantined: Number(summary.quarantined || 0),
  };
  out.groups = {
    queued: out.outbox.queued,
    sent: out.outbox.sent,
    blocked: out.outbox.blocked + out.outbox.failed,
    deferred: out.outbox.deferred,
    quarantined: out.outbox.quarantined,
  };
  out.hints = buildCommsHints(summary, { recentTestSends });
  out.recentAdminAudit = recentAdminAudit.slice(0, 8);
  return out;
}


export async function getFounderSummary(actorTgId = 0) {
  const founder = isFounderActorTgId(actorTgId);
  const runtime = await getRuntimeSummary();
  const overview = await getOverviewSummary();
  const payments = await getPaymentsSummary();
  const comms = await getCommsSummary();
  const recentAudit = await getRecentAdminWebAudit(12);

  const founderWarnings = [];
  if (!founder) founderWarnings.push({ level: 'warning', message: 'Founder-only control surface доступен только для SUPER_ADMIN.', source: 'founder' });
  if (!CFG.FOUNDER_SALE_ENABLED) founderWarnings.push({ level: 'info', message: 'Founder Sale сейчас выключен.', source: 'founder_sale' });
  if (!CFG.PUBLIC_BASE_URL) founderWarnings.push({ level: 'warning', message: 'PUBLIC_BASE_URL missing — approve / signed links будут ограничены.', source: 'config' });
  if (!runtime?.services?.qstash || String(runtime.services.qstash.state || '') === 'missing') founderWarnings.push({ level: 'warning', message: 'QStash не настроен — publish/retry founder surfaces ограничены.', source: 'qstash' });
  if (!founderWarnings.length) founderWarnings.push({ level: 'info', message: 'Явных founder-предупреждений нет.', source: 'founder' });

  const founderHints = [
    { kind: founder ? 'info' : 'warning', message: founder ? 'Founder surface отделён от обычного operator UX. Dangerous actions не смешиваются с read-first панелью.' : 'Текущая web-сессия не founder-класса. Read surfaces остаются доступны, founder actions скрыты.' },
    { kind: 'info', message: 'Revoke all web sessions остаётся единственным founder action в STEP507. Остальные risky controls — bot-only.' },
    { kind: 'info', message: 'Founder Sale и auth/session policy читаются здесь как отдельный founder layer, без writes в runtime/config.' },
  ];

  return {
    updatedAt: new Date().toISOString(),
    founder: {
      allowed: founder,
      actorTgId: Number(actorTgId || 0) || 0,
      roleLabel: founder ? 'founder' : 'operator',
    },
    sessionPolicy: {
      loginTtlSec: Number(CFG.ADMIN_WEB_LOGIN_TTL_SEC || 0),
      sessionTtlSec: Number(CFG.ADMIN_WEB_SESSION_TTL_SEC || 0),
      idleTimeoutSec: Number(CFG.ADMIN_WEB_IDLE_TIMEOUT_SEC || 0),
      approversCount: Array.isArray(CFG.ADMIN_WEB_APPROVER_TG_IDS) ? CFG.ADMIN_WEB_APPROVER_TG_IDS.length : 0,
    },
    founderSale: {
      enabled: !!CFG.FOUNDER_SALE_ENABLED,
      deadline: CFG.FOUNDER_SALE_DEADLINE || '',
      brand3mPrice: Number(CFG.FOUNDER_BRAND_3M_PRICE || 0),
      brand12mPrice: Number(CFG.FOUNDER_BRAND_12M_PRICE || 0),
      creator12mPrice: Number(CFG.FOUNDER_CREATOR_12M_PRICE || 0),
      brand3mCredits: Number(CFG.FOUNDER_BRAND_3M_CREDITS || 0),
      brand12mCredits: Number(CFG.FOUNDER_BRAND_12M_CREDITS || 0),
    },
    controls: {
      canRevokeAllSessions: founder,
      dangerousWritesInWeb: false,
      botOnlyControls: ['payments writes', 'deal mutation', 'channel rebind', 'live dialog actions'],
    },
    snapshots: {
      usersTotal: Number(overview?.cards?.usersTotal || 0),
      paymentWarnings: Number(payments?.summary?.warnings || 0),
      runtimeState: String(runtime?.overall?.state || 'unknown'),
      commsWarnings: Number(comms?.summary?.warnings || 0),
    },
    warnings: founderWarnings,
    hints: founderHints,
    recentFounderAudit: (Array.isArray(recentAudit) ? recentAudit : []).filter((item) => ['founder', 'auth', 'system'].includes(String(item?.section || '')) || String(item?.action || '').includes('revoke')).slice(0, 10),
  };
}
