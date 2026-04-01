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

function buildActivitySummary(user, paymentLight) {
  const parts = [];
  const workspaceCount = Array.isArray(user?._workspaces) ? user._workspaces.length : 0;
  const curatorCount = Array.isArray(user?._curator_in) ? user._curator_in.length : 0;
  if (workspaceCount > 0) parts.push(`владелец ${workspaceCount} workspace` + (workspaceCount > 1 ? 's' : ''));
  if (curatorCount > 0) parts.push(`куратор в ${curatorCount}`);
  if (Number(paymentLight?.total || 0) > 0) parts.push(`платежей ${Number(paymentLight.total || 0)}`);
  return parts.length ? parts.join(' · ') : 'Пока нет заметной активности.';
}

function buildStateHint(user, account, access, paymentLight) {
  const hints = [];
  if (user?.banned_at) return 'Пользователь заблокирован — проверяй operator context аккуратно.';
  if (access?.hasWorkspace) hints.push('Есть рабочий workspace');
  if (access?.hasChannel) hints.push('есть channel signal');
  if (Number(account?.credits || 0) > 0) hints.push(`${Number(account.credits || 0)} credits`);
  if (Number(paymentLight?.pending || 0) > 0) hints.push(`pending payments ${Number(paymentLight.pending || 0)}`);
  return hints.length ? hints.join(' · ') : 'Базовый пользовательский контекст без явных рисков.';
}

function buildAccessSummary({ workspaces = [], curatorIn = [], hasChannel = false, channelLabel = '', brandProfile = null }) {
  if (workspaces.length && hasChannel) {
    return `Есть ${workspaces.length} workspace, channel signal: ${channelLabel || 'подключён'}.`;
  }
  if (workspaces.length) return `Есть ${workspaces.length} workspace, но channel signal нет.`;
  if (curatorIn.length) return `Curator context в ${curatorIn.length} workspace.`;
  if (brandProfile?.brand_name) return `Есть brand profile: ${brandProfile.brand_name}.`;
  return 'Нет workspace / channel / curator signals.';
}

function buildRoleSummary(user, curatorIn = []) {
  const parts = [];
  if (user?.is_manager) parts.push('manager');
  if (user?.is_moderator) parts.push('moderator');
  if (user?.is_curator || curatorIn.length) parts.push(`curator in ${curatorIn.length || 1}`);
  return parts.length ? parts.join(' · ') : 'Дополнительных operator signals нет.';
}

function buildPlanLabel(plan, planUntil) {
  const value = String(plan || '').trim();
  if (!value) return '—';
  if (!planUntil) return value;
  return `${value} · до ${new Date(planUntil).toISOString().slice(0, 10)}`;
}

function mapAuditActionLabel(action) {
  const key = String(action || '').trim().toLowerCase();
  return ({
    set_user_note: 'Сохранена заметка',
    clear_user_note: 'Очищена заметка',
    logout: 'Выход из web-admin',
    revoke_all: 'Сброс web-сессий',
  })[key] || key || 'Действие';
}

function mapActorLabel(item) {
  const tgId = Number(item?.actorTgId || 0) || 0;
  return tgId ? `TG ${tgId}` : 'fallback';
}

function normalizeRecentAdminAudit(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => String(item?.action || '').trim())
    .map((item) => ({
      ...item,
      actionLabel: mapAuditActionLabel(item.action),
      actorLabel: mapActorLabel(item),
    }));
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
  const recentAdminAudit = normalizeRecentAdminAudit(await getRecentAdminWebAudit(12, { targetType: 'user', targetId: String(user.id) }));

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
      statusLabel: user.banned_at ? 'заблокирован' : 'активен',
      segment,
      stateHint: buildStateHint(user, { plan: user.brand_plan || '', credits: Number(user.brand_credits || 0) }, { hasWorkspace: workspaces.length > 0, hasChannel }, paymentLight),
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
      planLabel: buildPlanLabel(user.brand_plan || '', user.brand_plan_until || null),
      credits: Number(user.brand_credits || 0),
      creditsLabel: Number(user.brand_credits || 0) > 0 ? `${Number(user.brand_credits || 0)} credits` : '0 credits',
      summary: Number(user.brand_credits || 0) > 0
        ? `${buildPlanLabel(user.brand_plan || '', user.brand_plan_until || null)} · ${Number(user.brand_credits || 0)} credits`
        : `${buildPlanLabel(user.brand_plan || '', user.brand_plan_until || null)} · credits нет`,
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
      summary: buildAccessSummary({ workspaces, curatorIn, hasChannel, channelLabel, brandProfile: user._brand_profile || null }),
      roleSummary: buildRoleSummary(user, curatorIn),
    },
    activity: {
      createdAt: user.created_at || null,
      lastSeenAt: user.updated_at || user.created_at || null,
      recentSummary: buildActivitySummary(user, paymentLight),
      lastImportantAction: paymentLight.lastPaymentAt || user.updated_at || user.created_at || null,
      lastImportantActionLabel: paymentLight.lastPaymentAt ? `Последний платёж: ${paymentLight.lastPaymentAt}` : '',
      lightCounters: {
        workspacesOwned: workspaces.length,
        curatorIn: curatorIn.length,
        payments: Number(paymentLight.total || 0),
      },
    },
    note: note ? { ...note, updatedByLabel: note.byAdminUsername ? `@${String(note.byAdminUsername).replace(/^@/, '')}` : (Number(note.byAdminTgId || 0) ? `TG ${Number(note.byAdminTgId || 0)}` : '') } : null,
    paymentLight,
    recentAdminAudit,
    // Back-compat fields for STEP499 shell until STEP501 UI fully replaces them everywhere.
    paymentLightLegacy: paymentLight,
  };

  return detail;
}

