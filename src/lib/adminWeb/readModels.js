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

  return {
    user: {
      id: Number(user.id || 0),
      tgId: Number(user.tg_id || 0),
      username: user.tg_username || '',
      createdAt: user.created_at || null,
      bannedAt: user.banned_at || null,
      brandPlan: user.brand_plan || '',
      brandPlanUntil: user.brand_plan_until || null,
      brandCredits: Number(user.brand_credits || 0),
      flags: {
        isCreator: !!user.is_creator,
        isCurator: !!user.is_curator,
        isModerator: !!user.is_moderator,
        isManager: !!user.is_manager,
        hasBrandProfile: !!user.has_brand_profile,
      },
      workspaces: Array.isArray(user._workspaces) ? user._workspaces : [],
      curatorIn: Array.isArray(user._curator_in) ? user._curator_in : [],
      brandProfile: user._brand_profile || null,
    },
    note,
    paymentLight,
  };
}
