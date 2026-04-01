import { redis, k } from '../redis.js';

const ADMIN_USER_NOTE_MAX = 1400;

function key(userId) {
  const uid = Number(userId || 0);
  return k(['adm_user_note', String(uid || 0)]);
}

export function normalizeAdminUserNote(v) {
  if (!v) return null;
  if (typeof v === 'string') {
    const text = String(v || '').trim();
    if (!text) return null;
    return { text, tags: [], updatedAt: '', byAdminTgId: 0, byAdminUsername: '' };
  }
  if (typeof v !== 'object' || Array.isArray(v)) return null;
  const text = String(v.text || '').replace(/\r/g, '').trim();
  const tags = Array.isArray(v.tags) ? v.tags.map((x) => String(x || '').trim()).filter(Boolean) : [];
  if (!text && tags.length === 0) return null;
  return {
    text: text ? (text.length > ADMIN_USER_NOTE_MAX ? text.slice(0, ADMIN_USER_NOTE_MAX) + '…' : text) : '',
    tags,
    updatedAt: String(v.updatedAt || ''),
    byAdminTgId: Number(v.byAdminTgId || 0) || 0,
    byAdminUsername: String(v.byAdminUsername || ''),
  };
}

export async function getAdminUserNote(userId) {
  const uid = Number(userId || 0);
  if (!uid) return null;
  try {
    const value = await redis.get(key(uid));
    return normalizeAdminUserNote(value);
  } catch {
    return null;
  }
}

export async function getAdminUserNotesBulk(userIds = []) {
  const ids = Array.from(new Set((Array.isArray(userIds) ? userIds : []).map((x) => Number(x || 0)).filter((x) => x > 0)));
  const out = new Map();
  if (!ids.length) return out;
  try {
    const keys = ids.map((id) => key(id));
    const values = typeof redis.mget === 'function'
      ? await redis.mget(keys)
      : await Promise.all(keys.map((item) => redis.get(item)));
    for (let i = 0; i < ids.length; i += 1) {
      const note = normalizeAdminUserNote(values?.[i]);
      if (note && (note.text || note.tags?.length)) out.set(ids[i], note);
    }
    return out;
  } catch {
    for (const id of ids) {
      const note = await getAdminUserNote(id);
      if (note && (note.text || note.tags?.length)) out.set(id, note);
    }
    return out;
  }
}

export async function setAdminUserNote(userId, text, meta = {}) {
  const uid = Number(userId || 0);
  if (!uid) return false;
  const raw = String(text || '').replace(/\r/g, '').trim();
  if (!raw) return false;
  const payload = {
    text: raw.length > ADMIN_USER_NOTE_MAX ? raw.slice(0, ADMIN_USER_NOTE_MAX) + '…' : raw,
    tags: [],
    updatedAt: new Date().toISOString(),
    byAdminTgId: Number(meta.byAdminTgId || 0) || 0,
    byAdminUsername: String(meta.byAdminUsername || ''),
  };
  try {
    // TTL-LINT: allow-persistent — admin web note reuses the same persistent Redis note contract as Telegram-admin.
    await redis.set(key(uid), payload);
    return true;
  } catch {
    return false;
  }
}

export async function clearAdminUserNote(userId) {
  const uid = Number(userId || 0);
  if (!uid) return false;
  try {
    await redis.del(key(uid));
    return true;
  } catch {
    return false;
  }
}
