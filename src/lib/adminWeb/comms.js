import { pool } from '../../db/pool.js';
import { createBroadcast, getBroadcast, updateBroadcast } from '../../db/queries.js';
import { appendAdminWebAudit } from './auth.js';
import { escapeHtml } from './common.js';
import { sendTelegramMessage } from './telegram.js';

const ALLOWED_AUDIENCES = new Set(['all', 'brands', 'creators', 'curators', 'managers']);
const MAX_TITLE_LEN = 120;
const MAX_BODY_LEN = 4000;

function normalizeAudience(value) {
  const key = String(value || 'all').trim().toLowerCase();
  return ALLOWED_AUDIENCES.has(key) ? key : 'all';
}

function normalizeTitle(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, MAX_TITLE_LEN);
}

function normalizeBody(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, MAX_BODY_LEN);
}

async function getActorUserIdByTgId(actorTgId) {
  const tgId = Number(actorTgId || 0) || 0;
  if (!tgId) return 0;
  const r = await pool.query(`select id from users where tg_id = $1 limit 1`, [tgId]);
  return Number(r.rows?.[0]?.id || 0) || 0;
}

function draftSnapshot(row = {}) {
  return {
    id: Number(row.id || 0) || 0,
    status: String(row.status || ''),
    audience: normalizeAudience(row.audience || 'all'),
    draftType: String(row.draft_type || 'text').trim() || 'text',
    title: normalizeTitle(row.draft_caption || ''),
    body: String(row.draft_text || ''),
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null,
  };
}

export async function createNoticeDraftForActor({ actorTgId, title, audience, bodyText }) {
  const createdByUserId = await getActorUserIdByTgId(actorTgId);
  if (!createdByUserId) return { ok: false, error: 'actor_user_not_found' };

  const cleanBody = normalizeBody(bodyText);
  if (!cleanBody) return { ok: false, error: 'draft_body_required' };

  const row = await createBroadcast({
    createdByUserId,
    audience: normalizeAudience(audience),
    draftType: 'text',
    draftText: cleanBody,
    draftCaption: normalizeTitle(title) || null,
    draftFileId: null,
    buttonsJson: null,
  });
  if (!row?.id) return { ok: false, error: 'draft_create_failed' };

  await appendAdminWebAudit({
    section: 'comms',
    action: 'create_notice_draft',
    actorTgId,
    targetType: 'broadcast',
    targetId: String(row.id),
    reason: 'web_admin',
    newJson: draftSnapshot(row),
  });

  return { ok: true, draft: draftSnapshot(row) };
}

export async function updateNoticeDraftForActor({ actorTgId, draftId, title, audience, bodyText }) {
  const id = Number(draftId || 0) || 0;
  if (!id) return { ok: false, error: 'draft_id_required' };
  const row = await getBroadcast(id);
  if (!row) return { ok: false, error: 'draft_not_found' };
  if (String(row.status || '').toUpperCase() !== 'PENDING') return { ok: false, error: 'draft_not_editable' };

  const cleanBody = normalizeBody(bodyText);
  if (!cleanBody) return { ok: false, error: 'draft_body_required' };

  const oldJson = draftSnapshot(row);
  const fields = {
    audience: normalizeAudience(audience),
    draft_type: 'text',
    draft_text: cleanBody,
    draft_caption: normalizeTitle(title) || null,
  };
  await updateBroadcast(id, fields);
  const next = await getBroadcast(id);
  if (!next) return { ok: false, error: 'draft_reload_failed' };

  await appendAdminWebAudit({
    section: 'comms',
    action: 'update_notice_draft',
    actorTgId,
    targetType: 'broadcast',
    targetId: String(id),
    reason: 'web_admin',
    oldJson,
    newJson: draftSnapshot(next),
  });

  return { ok: true, draft: draftSnapshot(next) };
}

export async function testSendNoticeDraftToActor({ actorTgId, draftId }) {
  const id = Number(draftId || 0) || 0;
  const tgId = Number(actorTgId || 0) || 0;
  if (!id) return { ok: false, error: 'draft_id_required' };
  if (!tgId) return { ok: false, error: 'actor_tg_id_required' };

  const row = await getBroadcast(id);
  if (!row) return { ok: false, error: 'draft_not_found' };

  const title = normalizeTitle(row.draft_caption || 'Test notice');
  const body = normalizeBody(row.draft_text || row.draft_caption || '');
  if (!body) return { ok: false, error: 'draft_body_required' };

  const lines = [
    '<b>Founder test send</b>',
    '',
    title ? `<b>${escapeHtml(title)}</b>` : '',
    `Audience: <code>${escapeHtml(normalizeAudience(row.audience || 'all'))}</code>`,
    '',
    escapeHtml(body).replace(/\n/g, '\n'),
  ].filter(Boolean);

  const sent = await sendTelegramMessage(tgId, { text: lines.join('\n') });
  if (!sent?.ok) return { ok: false, error: 'telegram_test_send_failed' };

  await appendAdminWebAudit({
    section: 'comms',
    action: 'test_send_notice',
    actorTgId,
    targetType: 'broadcast',
    targetId: String(id),
    reason: 'founder_test_send',
    newJson: { previewToTgId: tgId, draft: draftSnapshot(row) },
  });

  return { ok: true };
}
