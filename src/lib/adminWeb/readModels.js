import { pool } from '../../db/pool.js';
import { getAdminMetricsSnapshot, listUsersDirectory, getUserCardById, normalizeUsersDirectoryFilters, getUsersDirectoryCohortCounters, getUsersDirectoryByIds } from '../../db/queries.js';
import { getAdminUserNote, getAdminUserNotesBulk } from './notes.js';
import { getRuntimeSummary } from './runtime.js';
import { getRecentAdminWebAudit, isFounderActorTgId } from './auth.js';
import { CFG } from '../config.js';
import { getUsersExportOptions } from './usersExport.js';
import { getUsersBulkOptions } from './usersBulk.js';

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


function isOlderThanDays(value, days = 30) {
  if (!value) return false;
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return false;
  return ts < (Date.now() - (Number(days || 0) * 24 * 60 * 60 * 1000));
}

function compareProblemDescriptor(user = {}, paymentLight = {}, meta = {}) {
  if (user?.banned_at) return 'banned';
  if (Number(paymentLight?.total || 0) > 0 && !meta?.hasChannel) return 'paid-no-channel';
  if (user?.brand_plan && !meta?.hasChannel) return 'plan-no-channel';
  if (Number(user?.brand_credits || 0) > 0 && isOlderThanDays(meta?.lastKnownActivityAt || meta?.last_known_activity_at, 30)) return 'stale-credits';
  if (isOlderThanDays(meta?.lastKnownActivityAt || meta?.last_known_activity_at, 90)) return 'stale-90d';
  return '';
}

function isDormantPayerMeta(paymentLight = {}, meta = {}) {
  return Number(paymentLight?.total || 0) > 0 && isOlderThanDays(meta?.lastKnownActivityAt || meta?.last_known_activity_at, 30);
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

function normalizeUsersPinIds(raw = []) {
  const values = Array.isArray(raw) ? raw : String(raw || '').split(',');
  const out = [];
  for (const value of values) {
    const num = Number(value || 0) || 0;
    if (!num || out.includes(num)) continue;
    out.push(num);
    if (out.length >= 5) break;
  }
  return out;
}

function compareSignalChips(user, paymentLight = {}, note = null) {
  const chips = [];
  if (user?.is_creator) chips.push({ label: 'creator', tone: 'is-accent' });
  if (user?.has_brand_profile) chips.push({ label: 'brand', tone: 'is-accent' });
  if (user?.is_curator) chips.push({ label: 'curator', tone: 'is-soft' });
  if (user?.is_manager) chips.push({ label: 'manager', tone: 'is-soft' });
  if (user?.is_moderator) chips.push({ label: 'moderator', tone: 'is-soft' });
  if (Array.isArray(user?._workspaces) && user._workspaces.some((w) => w?.channel_id || w?.channel_username)) chips.push({ label: 'channel', tone: 'is-good' });
  if (Number(paymentLight?.total || 0) > 0) chips.push({ label: `pay x${Number(paymentLight.total || 0)}`, tone: 'is-good' });
  if (note?.text) chips.push({ label: 'note', tone: 'is-soft' });
  return chips.slice(0, 6);
}

async function getPinnedUsersCompareCards(userIdsRaw = []) {
  const userIds = normalizeUsersPinIds(userIdsRaw);
  if (!userIds.length) return [];
  const [users, notesMap, paymentsResult, directoryRows] = await Promise.all([
    Promise.all(userIds.map((userId) => getUserCardById(userId))),
    getAdminUserNotesBulk(userIds),
    pool.query(
      `select user_id, count(*)::int as total, max(created_at) as last_payment_at
         from payments
        where user_id = any($1::int[])
        group by user_id`,
      [userIds]
    ).catch(() => ({ rows: [] })),
    getUsersDirectoryByIds(userIds).catch(() => []),
  ]);

  const paymentMap = new Map((paymentsResult?.rows || []).map((row) => [Number(row.user_id || 0), {
    total: Number(row.total || 0),
    lastPaymentAt: row.last_payment_at || null,
  }]));
  const directoryMap = new Map((directoryRows || []).map((row) => [Number(row.user_id || 0), {
    hasChannel: !!row.has_channel,
    paymentsCount: Number(row.payments_count || 0),
    problemScore: Number(row.problem_score || 0),
    lastKnownActivityAt: row.last_known_activity_at || row.updated_at || row.created_at || null,
  }]));

  const byId = new Map();
  users.forEach((user) => {
    if (user?.id) byId.set(Number(user.id || 0), user);
  });

  return userIds.map((userId) => {
    const user = byId.get(Number(userId || 0));
    if (!user) return null;
    const workspaces = Array.isArray(user._workspaces) ? user._workspaces : [];
    const curatorIn = Array.isArray(user._curator_in) ? user._curator_in : [];
    const paymentLight = paymentMap.get(Number(user.id || 0)) || { total: 0, lastPaymentAt: null };
    const note = notesMap.get(Number(user.id || 0)) || null;
    const directoryMeta = directoryMap.get(Number(user.id || 0)) || {};
    const segment = buildUserSegment(user);
    const hasChannel = Object.prototype.hasOwnProperty.call(directoryMeta, 'hasChannel') ? directoryMeta.hasChannel : workspaces.some((w) => w?.channel_id || w?.channel_username);
    const lastKnownActivityAt = directoryMeta.lastKnownActivityAt || user.updated_at || user.created_at || null;
    const problemDesc = compareProblemDescriptor(user, paymentLight, { hasChannel, lastKnownActivityAt });
    return {
      userId: Number(user.id || 0),
      tgId: Number(user.tg_id || 0) || 0,
      username: user.tg_username || '',
      displayName: buildDisplayName(user),
      segment,
      segmentLabel: ({ brand: 'бренд', creator: 'креатор', curator: 'куратор', manager: 'менеджер', user: 'пользователь' })[segment] || 'пользователь',
      status: user.banned_at ? 'banned' : 'active',
      plan: user.brand_plan || '',
      credits: Number(user.brand_credits || 0),
      hasChannel,
      workspaceCount: workspaces.length,
      curatorCount: curatorIn.length,
      paymentsCount: Number(paymentLight.total || directoryMeta.paymentsCount || 0),
      lastPaymentAt: paymentLight.lastPaymentAt || null,
      lastKnownActivityAt,
      notePreview: note?.text ? String(note.text).slice(0, 160) : '',
      signalChips: compareSignalChips(user, paymentLight, note),
      problemScore: Number(directoryMeta.problemScore || 0),
      problemDesc,
      isDormantPayer: isDormantPayerMeta(paymentLight, { lastKnownActivityAt }),
    };
  }).filter(Boolean);
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
    runtimeWarnings: Number(runtime?.summaryCards?.check || 0) || 0,
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
  const filters = normalizeUsersDirectoryFilters({
    segment: params.segment || 'all',
    planState: params.planState || 'all',
    creditsState: params.creditsState || 'all',
    channelState: params.channelState || 'all',
    activityWindow: params.activityWindow || 'all',
    paymentsState: params.paymentsState || 'all',
    sortBy: params.sortBy || 'created_desc',
    cohortView: params.cohortView || 'all',
  });
  const q = String(params.q || '').trim();
  const limit = Math.max(10, Math.min(50, Number(params.limit) || 20));
  const page = Math.max(0, Number(params.page) || 0);
  const pinIds = normalizeUsersPinIds(params.pinIds || params.pins || []);
  const offset = page * limit;

  const [listResult, cohortCounters, compareCards] = await Promise.all([
    listUsersDirectory(filters.segment, limit, offset, q, filters),
    getUsersDirectoryCohortCounters(filters.segment, q, filters),
    getPinnedUsersCompareCards(pinIds),
  ]);
  const rows = Array.isArray(listResult?.rows) ? listResult.rows : [];
  const total = Math.max(0, Number(rows[0]?.total_count ?? listResult?.total ?? 0) || 0);
  const totalPages = Math.max(1, Math.ceil((total || 0) / limit) || 1);
  const pageClamped = Math.min(page, Math.max(0, totalPages - 1));
  const fromRow = total > 0 ? (pageClamped * limit) + 1 : 0;
  const toRow = total > 0 ? Math.min(total, (pageClamped * limit) + rows.length) : 0;
  const noteMap = await getAdminUserNotesBulk(rows.map((x) => x.user_id));

  const items = rows.map((row) => {
    const note = noteMap.get(Number(row.user_id || 0)) || null;
    return {
      userId: Number(row.user_id || 0),
      tgId: Number(row.tg_id || 0),
      username: row.tg_username || '',
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      lastKnownActivityAt: row.last_known_activity_at || row.updated_at || row.created_at || null,
      brandPlan: row.brand_plan || '',
      brandPlanUntil: row.brand_plan_until || null,
      bannedAt: row.banned_at || null,
      brandCredits: Number(row.brand_credits || 0),
      paymentsCount: Number(row.payments_count || 0),
      lastPaymentAt: row.last_payment_at || null,
      problemScore: Number(row.problem_score || 0),
      segment: buildUserSegment(row),
      flags: {
        hasChannel: !!row.has_channel,
        hasPayments: !!row.has_payments,
        isCreator: !!row.is_creator,
        isCurator: !!row.is_curator,
        isModerator: !!row.is_moderator,
        isManager: !!row.is_manager,
        hasBrandProfile: !!row.has_brand_profile,
        isBanned: !!row.banned_at,
      },
      hasNote: !!note,
      notePreview: note?.text ? String(note.text).slice(0, 120) : '',
    };
  });

  const recentAudit = await getRecentAdminWebAudit(24);
  const recentExport = recentAudit
    .find((item) => String(item?.section || '') === 'users' && String(item?.action || '') === 'export_users_csv') || null;
  const recentBulkCopy = recentAudit
    .find((item) => String(item?.section || '') === 'users' && String(item?.action || '') === 'copy_users_bulk') || null;

  return {
    items,
    page: pageClamped,
    limit,
    hasNext: pageClamped + 1 < totalPages,
    pagination: {
      page: pageClamped,
      pageSize: limit,
      total,
      totalPages,
      fromRow,
      toRow,
      hasPrev: pageClamped > 0,
      hasNext: pageClamped + 1 < totalPages,
      visibleCount: rows.length,
    },
    exportOptions: getUsersExportOptions(),
    bulkOptions: getUsersBulkOptions(),
    exportMeta: {
      maxRows: 10000,
      currentSegment: filters.segment,
      currentSearch: q,
      currentFilters: filters,
      recentExport: recentExport ? {
        ts: recentExport.ts || null,
        actorTgId: Number(recentExport.actorTgId || 0) || 0,
        reason: String(recentExport.reason || ''),
      } : null,
    },
    bulkMeta: {
      basketMaxRows: 500,
      currentSegment: filters.segment,
      currentSearch: q,
      currentFilters: filters,
      recentCopy: recentBulkCopy ? {
        ts: recentBulkCopy.ts || null,
        actorTgId: Number(recentBulkCopy.actorTgId || 0) || 0,
        reason: String(recentBulkCopy.reason || ''),
      } : null,
    },
    filterRail: {
      currentFilters: filters,
      cohortCounters: cohortCounters || { all: 0 },
    },
    cohortTopline: cohortCounters || { all: 0 },
    compareRail: {
      maxPins: 5,
      pinIds,
      cards: compareCards || [],
    },
  };
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




function buildPaymentRow(row = {}) {
  const userId = Number(row.user_id || 0) || 0;
  const username = String(row.tg_username || '').trim();
  return {
    id: Number(row.id || 0),
    userId,
    tgId: Number(row.tg_id || 0),
    username,
    displayName: username ? `@${username}` : `user #${userId || '—'}`,
    kind: String(row.kind || '').trim() || 'payment',
    source: String(row.currency || '').trim() === 'XTR' ? 'telegram_stars' : 'payments',
    amountLabel: `${Number(row.total_amount || 0)} ${String(row.currency || '').trim() || 'XTR'}`,
    status: paymentStatusLabel(row.status),
    note: String(row.note || '').trim(),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    appliedAt: row.applied_at || null,
    applyingAt: row.applying_at || null,
  };
}

function buildPaymentDetailDiagnostics(payment = {}) {
  const status = paymentStatusLabel(payment.status);
  if (status === 'success') return { state: 'ok', label: 'Платёж завершён успешно', hint: 'Дополнительных действий не требуется.' };
  if (status === 'pending') return { state: 'degraded', label: 'Платёж ожидает завершения', hint: 'Проверь user context, recent events и Telegram-admin fallback.' };
  if (status === 'fallback') return { state: 'degraded', label: 'Есть fallback-сигнал', hint: 'Нужна founder/operator проверка через payment + user surfaces.' };
  if (status === 'failed') return { state: 'degraded', label: 'Платёж завершился с ошибкой', hint: 'Нужна operator проверка причины и bot/admin follow-up.' };
  return { state: 'unknown', label: 'Статус платежа не нормализован', hint: 'Проверь row status и runtime diagnostics.' };
}

function buildPaymentEventTrace(row = {}) {
  const events = [];
  const createdAt = row.created_at || null;
  const applyingAt = row.applying_at || null;
  const appliedAt = row.applied_at || null;
  const updatedAt = row.updated_at || null;
  if (createdAt) events.push({ kind: 'payment_created', label: 'Создан', at: createdAt });
  if (applyingAt) events.push({ kind: 'payment_applying', label: 'Перешёл в applying', at: applyingAt });
  if (appliedAt) events.push({ kind: 'payment_applied', label: 'Применён', at: appliedAt });
  if (!appliedAt && updatedAt && updatedAt !== createdAt) {
    const statusLabel = paymentStatusLabel(row.status);
    events.push({ kind: `payment_${statusLabel}`, label: `Последний статус: ${statusLabel}`, at: updatedAt });
  }
  const note = String(row.note || '').trim();
  if (note) events.push({ kind: 'payment_note', label: note.slice(0, 160), at: updatedAt || createdAt || null });
  return events.slice(0, 10);
}

function minutesSince(ts) {
  const time = ts ? new Date(ts).getTime() : 0;
  if (!time || Number.isNaN(time)) return null;
  return Math.max(0, Math.round((Date.now() - time) / 60000));
}

function buildPaymentFollowUp(payment = {}) {
  const status = paymentStatusLabel(payment.status);
  const staleMinutes = minutesSince(payment.updatedAt || payment.createdAt);
  if (status === 'success') {
    return {
      level: 'ok',
      label: 'Без действий',
      reason: 'Платёж завершён успешно.',
      nextStep: 'Дополнительных действий не требуется.',
      needsReview: false,
      queueBucket: 'no_action',
    };
  }
  if (status === 'pending') {
    if ((staleMinutes || 0) >= 30) {
      return {
        level: 'urgent',
        label: 'Нужен follow-up',
        reason: `Pending дольше ${staleMinutes} мин.`,
        nextStep: 'Проверь user card, runtime и payment signals; если кейс не двигается — follow-up через bot/admin fallback.',
        needsReview: true,
        queueBucket: 'urgent',
      };
    }
    return {
      level: 'watch',
      label: 'Наблюдать',
      reason: 'Платёж ещё обрабатывается.',
      nextStep: 'Обнови позже и следи за recent payment events.',
      needsReview: false,
      queueBucket: 'watch',
    };
  }
  if (status === 'fallback') {
    return {
      level: 'review',
      label: 'Проверить founder/operator',
      reason: 'Есть fallback-сигнал.',
      nextStep: 'Сверь user context, credits path и runtime warnings; ручные действия только через bot/admin fallback.',
      needsReview: true,
      queueBucket: 'review',
    };
  }
  if (status === 'failed') {
    return {
      level: 'urgent',
      label: 'Нужен разбор',
      reason: 'Платёж завершился с ошибкой.',
      nextStep: 'Проверь user card, runtime и последние payment-сигналы; дальше — operator follow-up через bot/admin fallback.',
      needsReview: true,
      queueBucket: 'urgent',
    };
  }
  return {
    level: 'review',
    label: 'Проверить статус',
    reason: 'Статус не нормализован.',
    nextStep: 'Проверь payment row и runtime diagnostics.',
    needsReview: true,
    queueBucket: 'review',
  };
}

function buildPaymentFollowUpGroups(summary = {}) {
  const pending = Number(summary.pending || 0);
  const pendingOld = Number(summary.pendingOld || 0);
  const failed = Number(summary.failed || 0);
  const fallback = Number(summary.fallback || 0);
  return {
    noAction: Number(summary.successful || 0),
    watch: Math.max(0, pending - pendingOld),
    review: fallback,
    urgent: failed + pendingOld,
  };
}

function buildPaymentFollowUpQueue(items = []) {
  const priority = { urgent: 3, review: 2, watch: 1, ok: 0 };
  return items
    .filter((item) => item?.followUp?.level && item.followUp.level !== 'ok')
    .sort((a, b) => {
      const pa = priority[a.followUp.level] || 0;
      const pb = priority[b.followUp.level] || 0;
      if (pa !== pb) return pb - pa;
      return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
    })
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      displayName: item.displayName,
      status: item.status,
      amountLabel: item.amountLabel,
      followUp: item.followUp,
      updatedAt: item.updatedAt,
      userId: Number(item.userId || 0) || 0,
    }));
}

function buildPaymentReviewBuckets(summary = {}, followUpGroups = {}) {
  return [
    {
      key: 'applied',
      label: 'Уже applied',
      count: Number(summary.successful || 0),
      help: 'успешно применённые события',
      tone: Number(summary.successful || 0) > 0 ? 'good' : 'info',
    },
    {
      key: 'manual_review',
      label: 'Ручной review',
      count: Number(followUpGroups.review || 0),
      help: 'fallback / founder-operator разбор',
      tone: Number(followUpGroups.review || 0) > 0 ? 'warn' : 'good',
    },
    {
      key: 'stuck',
      label: 'Stuck / needs check',
      count: Number(followUpGroups.urgent || 0),
      help: 'failed или pending старше порога',
      tone: Number(followUpGroups.urgent || 0) > 0 ? 'bad' : 'good',
    },
    {
      key: 'watch',
      label: 'Под наблюдением',
      count: Number(followUpGroups.watch || 0),
      help: 'pending-кейсы без срочного follow-up',
      tone: Number(followUpGroups.watch || 0) > 0 ? 'info' : 'good',
    },
    {
      key: 'history',
      label: 'History / info',
      count: Math.max(0, Number(summary.total || 0) - Number(summary.recent || 0)),
      help: 'старые события вне активного review',
      tone: 'info',
    },
  ];
}

function buildPaymentActionRail(summary = {}, followUpGroups = {}) {
  const urgent = Number(followUpGroups.urgent || 0);
  const review = Number(followUpGroups.review || 0);
  const watch = Number(followUpGroups.watch || 0);
  const needsReview = urgent + review;
  return [
    {
      key: 'stay_payments',
      label: urgent > 0 || review > 0 ? 'Оставаться в Payments' : 'Payments под обычным наблюдением',
      body: urgent > 0 || review > 0
        ? 'Сначала разберись с non-applied / fallback / failed кейсами здесь, а не через Users.'
        : 'Сигналов для срочного payment review сейчас нет.',
      href: '/admin/payments',
      cta: 'Payments review',
      tone: needsReview > 0 ? 'warn' : 'good',
    },
    {
      key: 'go_runtime',
      label: 'Когда идти в Runtime',
      body: urgent > 0
        ? 'Если кейс выглядит stuck, статус не двигается или есть delivery/retry шум — сначала Runtime.'
        : 'Runtime нужен только если payment проблема выглядит системной, а не пользовательской.',
      href: '/admin/runtime',
      cta: 'Открыть Runtime',
      tone: urgent > 0 ? 'warn' : 'info',
    },
    {
      key: 'go_user',
      label: 'Когда открывать user card',
      body: needsReview > 0 || watch > 0
        ? 'После payment detail проверь user card: plan, credits, channel и последнюю активность.'
        : 'User card нужен только для точечного follow-up после payment detail.',
      href: '/admin/users',
      cta: 'Открыть Users',
      tone: (needsReview > 0 || watch > 0) ? 'info' : 'good',
    },
  ];
}

function buildPaymentOperatorHints(summary = {}, followUpGroups = {}) {
  const hints = [];
  if (!summary.available) {
    hints.push({ kind: 'warning', message: 'Платёжная диагностика недоступна. Проверь DB/runtime surface.' });
    return hints;
  }
  if (Number(followUpGroups.urgent || 0) > 0) {
    hints.push({ kind: 'warning', message: `Есть кейсы для срочного follow-up: ${Number(followUpGroups.urgent || 0)}.` });
  }
  if (Number(followUpGroups.review || 0) > 0) {
    hints.push({ kind: 'warning', message: `Есть fallback-кейсы для founder/operator проверки: ${Number(followUpGroups.review || 0)}.` });
  }
  if (Number(followUpGroups.watch || 0) > 0) {
    hints.push({ kind: 'info', message: `Есть pending-кейсы под наблюдением: ${Number(followUpGroups.watch || 0)}.` });
  }
  if (!hints.length) {
    hints.push({ kind: 'info', message: 'Платёжный follow-up выглядит спокойно. Read-only режим сохраняется.' });
  }
  hints.push({ kind: 'info', message: 'Если кейс застрял, сначала открой payment detail, потом user card, и только потом иди в bot/admin fallback.' });
  return hints.slice(0, 4);
}

export async function getPaymentsSummary() {
  const out = {
    updatedAt: new Date().toISOString(),
    overall: { state: 'unknown', label: 'Данные пока недоступны' },
    summary: { total: 0, recent: 0, successful: 0, pending: 0, warnings: 0, needsReview: 0 },
    warnings: [{ level: 'info', message: 'Платёжных событий пока нет.', source: 'payments' }],
    groups: { success: 0, pending: 0, failed: 0, fallback: 0 },
    followUpGroups: { noAction: 0, watch: 0, review: 0, urgent: 0 },
    reviewBuckets: [],
    actionRail: [],
    followUpQueue: [],
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
        `select p.id, p.user_id, p.kind, p.currency, p.total_amount, p.status, p.note, p.created_at, p.updated_at, p.applying_at, p.applied_at,
                u.tg_id, u.tg_username
           from payments p
      left join users u on u.id = p.user_id
          order by p.created_at desc
          limit 12`
      );
      recentPayments = Array.isArray(r.rows) ? r.rows.map((row) => {
        const payment = buildPaymentRow(row);
        return { ...payment, followUp: buildPaymentFollowUp(payment) };
      }) : [];
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
  out.followUpGroups = buildPaymentFollowUpGroups(summary);
  out.reviewBuckets = buildPaymentReviewBuckets(summary, out.followUpGroups);
  out.actionRail = buildPaymentActionRail(summary, out.followUpGroups);
  out.warnings = buildPaymentWarnings(summary);
  out.recentPayments = recentPayments;
  out.followUpQueue = buildPaymentFollowUpQueue(recentPayments);
  out.hints = buildPaymentOperatorHints(summary, out.followUpGroups);
  return out;
}

export async function getPaymentDetail(paymentId) {
  const id = Number(paymentId || 0) || 0;
  if (!id) return null;
  let row = null;
  try {
    const r = await pool.query(
      `select p.id, p.user_id, p.kind, p.currency, p.total_amount, p.status, p.note,
              p.created_at, p.updated_at, p.applying_at, p.applied_at,
              u.tg_id, u.tg_username
         from payments p
    left join users u on u.id = p.user_id
        where p.id = $1
        limit 1`,
      [id]
    );
    row = r.rows?.[0] || null;
  } catch {
    row = null;
  }
  if (!row) return null;
  const payment = buildPaymentRow(row);
  const diagnostics = buildPaymentDetailDiagnostics(payment);
  const followUp = buildPaymentFollowUp(payment);
  const recentAdminAudit = await getRecentAdminWebAudit(8, { targetType: 'payment', targetId: String(payment.id) });
  return {
    updatedAt: payment.updatedAt || payment.createdAt || new Date().toISOString(),
    payment: {
      id: payment.id,
      kind: payment.kind,
      source: payment.source,
      amountLabel: payment.amountLabel,
      status: payment.status,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      note: payment.note || '',
    },
    user: {
      id: payment.userId,
      tgId: payment.tgId,
      username: payment.username || '',
      displayName: payment.displayName,
      link: payment.userId ? `/admin/users/${payment.userId}` : '',
    },
    diagnostics,
    followUp,
    events: buildPaymentEventTrace(row),
    hints: [
      { kind: followUp.level === 'urgent' || followUp.level === 'review' ? 'warning' : 'info', message: followUp.nextStep },
      { kind: diagnostics.state === 'ok' ? 'info' : 'warning', message: diagnostics.hint },
      { kind: 'info', message: 'Read-only режим: ручные действия выполняются через bot/admin fallback.' },
    ],
    recentAdminAudit,
  };
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
  if (Number(summary.blocked || 0) > 0 || Number(summary.failed || 0) > 0 || Number(summary.deliveryUnknown || 0) > 0 || Number(summary.deferred || 0) > 0 || Number(summary.quarantined || 0) > 0 || Number(summary.cooldownActive || 0) > 0 || Number(summary.active || 0) > 0) return 'degraded';
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
  if (!text) return 'Без названия';
  return text.split(/\n+/)[0].trim().slice(0, 80) || 'Без названия';
}

function buildCommsWarnings(summary = {}, extra = {}) {
  const warnings = [];
  if (!summary.available) {
    warnings.push({ level: 'warning', message: 'Раздел коммуникаций недоступен.', source: 'comms' });
    return warnings;
  }
  if (Number(summary.cooldownActive || 0) > 0) warnings.push({ level: 'warning', message: `Есть рассылки с активной паузой: ${Number(summary.cooldownActive || 0)}`, source: 'broadcasts' });
  if (Number(summary.blocked || 0) > 0) warnings.push({ level: 'warning', message: `Есть заблокированные доставки: ${Number(summary.blocked || 0)}`, source: 'outbox' });
  if (Number(summary.failed || 0) > 0) warnings.push({ level: 'warning', message: `Есть доставки с ошибкой: ${Number(summary.failed || 0)}`, source: 'outbox' });
  if (Number(summary.deliveryUnknown || 0) > 0) warnings.push({ level: 'warning', message: `Есть доставки с неопределённым исходом: ${Number(summary.deliveryUnknown || 0)}. Автоповтор отключён.`, source: 'outbox' });
  if (Number(summary.deferred || 0) > 0 || Number(summary.quarantined || 0) > 0) warnings.push({ level: 'warning', message: `Есть отложенные или изолированные повторы: ${Number(summary.deferred || 0) + Number(summary.quarantined || 0)}`, source: 'outbox' });
  if (Number(extra.draftsWithoutTest || 0) > 0) warnings.push({ level: 'info', message: `Есть черновики без тестовой отправки: ${Number(extra.draftsWithoutTest || 0)}`, source: 'drafts' });
  if (!warnings.length) warnings.push({ level: 'info', message: 'Явных предупреждений по коммуникациям нет.', source: 'comms' });
  return warnings;
}

function buildCommsHints(summary = {}, extra = {}) {
  if (!summary.available) {
    return [{ kind: 'warning', message: 'Таблицы рассылок недоступны. Проверь схему и текущий runtime baseline. Диагностика: broadcasts / broadcast_sent_log.' }];
  }
  const hints = [];
  if (Number(summary.active || 0) > 0) hints.push({ kind: 'warning', message: 'Есть активные рассылки. Массовый запуск из веб-админки выключен; используй Telegram-админку. Диагностика: live send → bot/admin fallback.' });
  if (Number(summary.drafts || 0) > 0) hints.push({ kind: 'info', message: 'Черновики можно редактировать в веб-админке и проверять тестовой отправкой себе. Массовый запуск здесь выключен.' });
  if (Number(summary.deliveryUnknown || 0) > 0) hints.push({ kind: 'warning', message: 'Неопределённые доставки нельзя отправлять повторно автоматически. Сверь Telegram и отметь исход вручную.' });
  if (Number(summary.blocked || 0) > 0 || Number(summary.failed || 0) > 0) hints.push({ kind: 'warning', message: 'Есть пропуски или ошибки доставки. Проверь снимок исходящих и Telegram-админку.' });
  if (Number(extra.recentTestSends || 0) > 0) hints.push({ kind: 'info', message: `Недавние тестовые отправки себе: ${Number(extra.recentTestSends || 0)}.` });
  if (!hints.length) hints.push({ kind: 'info', message: 'Черновики, объявления и исходящие работают без явных проблем. Веб-админка остаётся режимом проверки перед действием.' });
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
    warnings: [{ level: 'info', message: 'Записей рассылок пока нет.', source: 'comms' }],
    drafts: [],
    recentNotices: [],
    outbox: { queued: 0, processing: 0, warning: 0, failed: 0, sent: 0, blocked: 0, deferred: 0, quarantined: 0, deliveryUnknown: 0 },
    hints: [{ kind: 'info', message: 'Массовый запуск из веб-админки отключён. Используй предпросмотр и тестовую отправку себе.' }],
    recentAdminAudit: [],
    recentBroadcasts: [],
    unknownDeliveries: [],
    groups: { queued: 0, sent: 0, blocked: 0, deferred: 0, quarantined: 0, deliveryUnknown: 0 },
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
    deliveryUnknown: 0,
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
          count(*) filter (where status = 'delivery_unknown')::int as delivery_unknown,
          max(greatest(sent_at, delivery_unknown_at)) as latest_sent_at
        from broadcast_sent_log
      )
      select
        bc.total, bc.drafts, bc.active, bc.done_recent, bc.errors, bc.stopped, bc.cooldown_active, bc.latest_broadcast_at,
        sl.queued, sl.sent, sl.blocked, sl.deferred, sl.quarantined, sl.failed, sl.delivery_unknown, sl.latest_sent_at
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
      deliveryUnknown: Number(row.delivery_unknown || 0),
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
          coalesce(st.failed, 0)::int as failed_count,
          coalesce(st.delivery_unknown, 0)::int as delivery_unknown_count
        from broadcasts b
        left join users u on u.id = b.created_by_user_id
        left join lateral (
          select
            count(*) filter (where status = 'sent') as sent,
            count(*) filter (where status = 'queued') as queued,
            count(*) filter (where status = 'blocked') as blocked,
            count(*) filter (where status = 'failed') as failed,
            count(*) filter (where status = 'delivery_unknown') as delivery_unknown
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
        createdByLabel: row.tg_username ? `@${String(row.tg_username).trim()}` : 'Оператор',
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
        outbox: {
          sent: Number(row.sent_count || 0),
          queued: Number(row.queued_count || 0),
          blocked: Number(row.blocked_count || 0),
          failed: Number(row.failed_count || 0),
          deliveryUnknown: Number(row.delivery_unknown_count || 0),
        },
      })) : [];
    } catch {
      recentRows = [];
    }
  }

  let unknownDeliveries = [];
  if (summary.available && Number(summary.deliveryUnknown || 0) > 0) {
    try {
      const r = await pool.query(`
        select
          sl.broadcast_id, sl.user_id, u.tg_id, u.tg_username,
          sl.attempts, sl.last_attempt_at, sl.delivery_unknown_at,
          sl.last_error, sl.telegram_message_ids
        from broadcast_sent_log sl
        join users u on u.id = sl.user_id
        where sl.status = 'delivery_unknown'
        order by sl.delivery_unknown_at desc nulls last, sl.broadcast_id desc, sl.user_id desc
        limit 50
      `);
      unknownDeliveries = (r.rows || []).map((row) => ({
        broadcastId: Number(row.broadcast_id || 0),
        userId: Number(row.user_id || 0),
        tgId: Number(row.tg_id || 0),
        username: row.tg_username ? String(row.tg_username) : '',
        attempts: Number(row.attempts || 0),
        lastAttemptAt: row.last_attempt_at || null,
        unknownAt: row.delivery_unknown_at || null,
        reason: String(row.last_error || ''),
        telegramMessageIds: Array.isArray(row.telegram_message_ids) ? row.telegram_message_ids : [],
      }));
    } catch {
      unknownDeliveries = [];
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
      ? (commsOverallState(summary) === 'ok' ? 'Черновики, объявления и исходящие выглядят стабильно' : 'Есть сигналы по коммуникациям, требующие проверки')
      : 'Диагностика коммуникаций недоступна',
  };
  out.summary = {
    drafts: drafts.length,
    recentNotices: recentNotices.length,
    outboxPending: Number(summary.queued || 0) + Number(summary.deferred || 0) + Number(summary.quarantined || 0),
    outboxWarnings: Number(summary.blocked || 0) + Number(summary.failed || 0) + Number(summary.deliveryUnknown || 0),
    recentTestSends,
    warnings: warnings.filter((item) => String(item.level || '') !== 'info').length,
    total: summary.total,
    active: summary.active,
    doneRecent: summary.doneRecent,
    blocked: Number(summary.blocked || 0) + Number(summary.failed || 0),
    deliveryUnknown: Number(summary.deliveryUnknown || 0),
  };
  out.warnings = warnings;
  out.drafts = drafts;
  out.recentNotices = recentNotices;
  out.recentBroadcasts = recentRows;
  out.unknownDeliveries = unknownDeliveries;
  out.outbox = {
    queued: Number(summary.queued || 0),
    processing: Number(summary.deferred || 0),
    warning: Number(summary.blocked || 0) + Number(summary.quarantined || 0) + Number(summary.deliveryUnknown || 0),
    failed: Number(summary.failed || 0),
    sent: Number(summary.sent || 0),
    blocked: Number(summary.blocked || 0),
    deferred: Number(summary.deferred || 0),
    quarantined: Number(summary.quarantined || 0),
    deliveryUnknown: Number(summary.deliveryUnknown || 0),
  };
  out.groups = {
    queued: out.outbox.queued,
    sent: out.outbox.sent,
    blocked: out.outbox.blocked + out.outbox.failed,
    deferred: out.outbox.deferred,
    quarantined: out.outbox.quarantined,
    deliveryUnknown: out.outbox.deliveryUnknown,
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
  if (!founder) founderWarnings.push({ level: 'warning', message: 'Фаундерский слой доступен только для SUPER_ADMIN.', source: 'founder' });
  if (!CFG.FOUNDER_SALE_ENABLED) founderWarnings.push({ level: 'info', message: 'Founder Sale сейчас выключен.', source: 'founder_sale' });
  if (!CFG.PUBLIC_BASE_URL) founderWarnings.push({ level: 'warning', message: 'PUBLIC_BASE_URL missing — web-admin route будет недоступен, Telegram callback approval при этом остаётся отдельной identity boundary.', source: 'config' });
  if (!runtime?.services?.qstash || String(runtime.services.qstash.state || '') === 'missing') founderWarnings.push({ level: 'warning', message: 'QStash не настроен — publish/retry founder-слой ограничен.', source: 'qstash' });
  if (!founderWarnings.length) founderWarnings.push({ level: 'info', message: 'Явных фаундер-предупреждений нет.', source: 'founder' });

  const founderHints = [
    { kind: founder ? 'info' : 'warning', message: founder ? 'Фаундерский слой отделён от обычного operator UX. Опасные действия не смешиваются с read-first панелью.' : 'Текущая web-сессия не фаундер-класса. Read surfaces остаются доступны, а фаундерские действия скрыты.' },
    { kind: 'info', message: 'Завершение всех web-сессий остаётся единственным фаундерским web-action в STEP507. Остальные risky controls — bot-only.' },
    { kind: 'info', message: 'Founder Sale и auth/session policy читаются здесь как отдельный founder-layer, без writes в runtime/config.' },
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
      fallbackCodeEnabled: CFG.ADMIN_WEB_FALLBACK_CODE_ENABLED === true,
      codeMaxAttempts: Number(CFG.ADMIN_WEB_CODE_MAX_ATTEMPTS || 0),
      startRateLimit: Number(CFG.ADMIN_WEB_START_RATE_LIMIT || 0),
      startRateWindowSec: Number(CFG.ADMIN_WEB_START_RATE_WINDOW_SEC || 0),
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
      botOnlyControls: ['payment writes', 'deal mutation', 'channel rebind', 'live dialog actions'],
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
