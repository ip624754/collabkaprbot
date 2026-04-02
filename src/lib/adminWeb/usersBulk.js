import { exportUsersDirectory, getUsersDirectoryByIds, normalizeUsersDirectoryFilters } from '../../db/queries.js';

const ALLOWED_MODES = ['tg_ids', 'usernames', 'user_ids'];

function normalizeMode(modeRaw = 'tg_ids') {
  const mode = String(modeRaw || 'tg_ids').trim().toLowerCase();
  return ALLOWED_MODES.includes(mode) ? mode : 'tg_ids';
}

function normalizeIds(idsRaw = []) {
  return Array.from(new Set((Array.isArray(idsRaw) ? idsRaw : String(idsRaw || '').split(','))
    .map((value) => Number(value || 0) || 0)
    .filter((value) => value > 0))).slice(0, 500);
}

function modeLabel(mode = 'tg_ids') {
  return ({ tg_ids: 'tg_id', usernames: 'username', user_ids: 'user_id' })[mode] || mode;
}

function csvEsc(val) {
  const s = String(val ?? '');
  if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function valueFromRow(row = {}, mode = 'tg_ids') {
  if (mode === 'user_ids') return Number(row.user_id || 0) || null;
  if (mode === 'tg_ids') return Number(row.tg_id || 0) || null;
  if (mode === 'usernames') {
    const username = String(row.tg_username || '').trim().replace(/^@/, '');
    return username ? `@${username}` : null;
  }
  return null;
}

export function getUsersBulkOptions() {
  return [
    { id: 'tg_ids', label: 'Копировать tg_id' },
    { id: 'usernames', label: 'Копировать usernames' },
    { id: 'user_ids', label: 'Копировать user_id' },
  ];
}

export async function buildUsersBulkPayload({ mode = 'tg_ids', currentSegment = 'all', q = '', userIds = [], filters = {} } = {}) {
  const resolvedMode = normalizeMode(mode);
  const normalizedIds = normalizeIds(userIds);
  const search = String(q || '').trim();
  const normalizedFilters = normalizeUsersDirectoryFilters({ segment: currentSegment, ...(filters || {}) });

  let rows = [];
  let truncated = false;
  let source = 'current_filter';
  if (normalizedIds.length) {
    rows = await getUsersDirectoryByIds(normalizedIds);
    source = 'selection_basket';
  } else {
    const result = await exportUsersDirectory(normalizedFilters.segment, search, normalizedFilters);
    rows = Array.isArray(result?.rows) ? result.rows : [];
    truncated = !!result?.truncated;
  }

  const seen = new Set();
  const values = [];
  for (const row of rows) {
    const value = valueFromRow(row, resolvedMode);
    if (value === null || value === undefined || value === '') continue;
    const key = String(value);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(key);
  }

  const text = values.join('\n');
  return {
    mode: resolvedMode,
    modeLabel: modeLabel(resolvedMode),
    source,
    segment: normalizedFilters.segment,
    search,
    userIds: normalizedIds,
    text,
    rowsCount: values.length,
    rowsSourceCount: rows.length,
    truncated,
    preview: values.slice(0, 5),
    filters: normalizedFilters,
  };
}

export function buildUsersBulkTextFile(payload = {}) {
  const lines = [
    `mode,${csvEsc(payload.mode || '')}`,
    `source,${csvEsc(payload.source || '')}`,
    `segment,${csvEsc(payload.segment || '')}`,
    `search,${csvEsc(payload.search || '')}`,
    `rows_count,${csvEsc(payload.rowsCount || 0)}`,
    '',
    String(payload.text || ''),
  ];
  return '\uFEFF' + lines.join('\n');
}
