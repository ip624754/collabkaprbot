import { exportUsersDirectory } from '../../db/queries.js';
import { getAdminUserNotesBulk } from './notes.js';
import { CFG } from '../config.js';

const ALLOWED_SEGMENTS = ['all', 'brands', 'creators', 'curators', 'managers'];

export function normalizeUsersExportScope(scopeRaw = 'current', currentSegmentRaw = 'all') {
  const scope = String(scopeRaw || 'current').trim().toLowerCase();
  const currentSegment = ALLOWED_SEGMENTS.includes(String(currentSegmentRaw || '').trim().toLowerCase())
    ? String(currentSegmentRaw || '').trim().toLowerCase()
    : 'all';

  if (scope === 'current') {
    return {
      scope: 'current',
      segment: currentSegment,
      scopeLabel: 'current_filter',
      segmentLabel: currentSegment,
    };
  }

  if (scope === 'audit_snapshot' || scope === 'audit') {
    return {
      scope: 'audit_snapshot',
      segment: 'all',
      scopeLabel: 'audit_snapshot',
      segmentLabel: 'all',
    };
  }

  if (ALLOWED_SEGMENTS.includes(scope)) {
    return {
      scope,
      segment: scope,
      scopeLabel: scope,
      segmentLabel: scope,
    };
  }

  return {
    scope: 'current',
    segment: currentSegment,
    scopeLabel: 'current_filter',
    segmentLabel: currentSegment,
  };
}

function csvEsc(val) {
  const s = String(val ?? '');
  if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function msk(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
}

function buildUserRoles(row = {}) {
  const roles = [];
  const tgId = Number(row.tg_id || 0) || 0;
  if (tgId > 0 && Array.isArray(CFG.SUPER_ADMIN_TG_IDS) && CFG.SUPER_ADMIN_TG_IDS.includes(tgId)) roles.push('founder');
  if (row.is_manager) roles.push('manager');
  if (row.is_moderator) roles.push('moderator');
  if (row.is_curator) roles.push('curator');
  if (row.is_creator) roles.push('creator');
  const isBrand = !!row.has_brand_profile || !!row.brand_plan || Number(row.brand_credits || 0) > 0;
  if (isBrand) roles.push('brand');
  if (!roles.length) roles.push('user');
  return roles.join(';');
}

function buildSignals(row = {}) {
  const signals = [];
  if (row.is_creator) signals.push('creator');
  if (row.has_brand_profile) signals.push('brand_profile');
  if (row.is_curator) signals.push('curator');
  if (row.is_manager) signals.push('manager');
  if (row.is_moderator) signals.push('moderator');
  return signals.join(';');
}

function buildFilenameTag(resolved = {}, q = '') {
  const base = resolved.scope === 'current'
    ? `current_${resolved.segment}`
    : resolved.scope === 'audit_snapshot'
      ? 'audit_snapshot'
      : resolved.segment;
  return `${base}${q ? '_search' : ''}`;
}

export async function buildUsersCsvExport({ scope = 'current', currentSegment = 'all', q = '' } = {}) {
  const resolved = normalizeUsersExportScope(scope, currentSegment);
  const search = String(q || '').trim();
  const { rows, truncated } = await exportUsersDirectory(resolved.segment, search);
  const noteMap = await getAdminUserNotesBulk((rows || []).map((row) => Number(row.user_id || 0)));

  const header = [
    'user_id',
    'tg_id',
    'username',
    'status',
    'roles',
    'signals',
    'created_at_msk',
    'updated_at_msk',
    'brand_plan',
    'brand_plan_until_msk',
    'brand_credits',
    'brand_credits_spent',
    'has_note',
  ].join(',');

  const csvRows = (rows || []).map((row) => {
    const hasNote = noteMap.has(Number(row.user_id || 0));
    return [
      Number(row.user_id || 0),
      Number(row.tg_id || 0) || '',
      csvEsc(row.tg_username || ''),
      csvEsc(row.banned_at ? 'banned' : 'active'),
      csvEsc(buildUserRoles(row)),
      csvEsc(buildSignals(row)),
      csvEsc(msk(row.created_at)),
      csvEsc(msk(row.updated_at)),
      csvEsc(row.brand_plan || ''),
      csvEsc(msk(row.brand_plan_until)),
      Number(row.brand_credits || 0),
      Number(row.brand_credits_spent || 0),
      hasNote ? '1' : '0',
    ].join(',');
  });

  const ts = new Date().toISOString().slice(0, 10);
  const filename = `users_${buildFilenameTag(resolved, search)}_${ts}.csv`;
  const csv = '\uFEFF' + header + '\n' + csvRows.join('\n');

  return {
    filename,
    csv,
    rowsCount: csvRows.length,
    truncated: !!truncated,
    scope: resolved.scope,
    segment: resolved.segment,
    search,
    scopeLabel: resolved.scopeLabel,
  };
}

export function getUsersExportOptions() {
  return [
    { id: 'current', label: 'CSV: текущий фильтр' },
    { id: 'audit_snapshot', label: 'CSV: audit snapshot' },
    { id: 'all', label: 'CSV: все пользователи' },
    { id: 'brands', label: 'CSV: бренды' },
    { id: 'creators', label: 'CSV: креаторы' },
    { id: 'curators', label: 'CSV: кураторы / модераторы' },
    { id: 'managers', label: 'CSV: менеджеры брендов' },
  ];
}
