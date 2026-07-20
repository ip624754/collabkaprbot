import { CFG } from './config.js';
import { redis, k } from './redis.js';
import { getPaymentsFallbackApplyState } from './paymentsOps.js';

const CONTROL_AUDIT_KEY = k(['sys', 'control_surface_audit_recent']);

export const OPERATOR_CONTROL_KEYS = {
  pay_accept: k(['sys', 'pay_accept']),
  pay_auto_apply: k(['sys', 'pay_auto_apply']),
  matchfeat_auto_apply: k(['sys', 'matchfeat_auto_apply']),
  broadcast_qstash_fanout: k(['sys', 'broadcast_qstash_fanout']),
  admin_web_login_enabled: k(['sys', 'admin_web_login_enabled']),
};

const CONTROL_META_PREFIX = ['sys', 'control_meta'];

const CONTROL_DEFS = {
  admin_web_login: {
    id: 'admin_web_login',
    key: OPERATOR_CONTROL_KEYS.admin_web_login_enabled,
    defaultValue: true,
    label: 'Web-admin login',
    shortLabel: 'Web login',
    scope: 'auth',
  },
  pay_accept: {
    id: 'pay_accept',
    key: OPERATOR_CONTROL_KEYS.pay_accept,
    defaultValue: !!CFG.PAYMENTS_ACCEPT_DEFAULT,
    label: 'Приём платежей',
    shortLabel: 'Pay accept',
    scope: 'payments',
  },
  pay_auto_apply: {
    id: 'pay_auto_apply',
    key: OPERATOR_CONTROL_KEYS.pay_auto_apply,
    defaultValue: !!CFG.PAYMENTS_AUTO_APPLY_DEFAULT,
    label: 'Автовыдача платежей',
    shortLabel: 'Auto apply',
    scope: 'payments',
  },
  matchfeat_auto_apply: {
    id: 'matchfeat_auto_apply',
    key: OPERATOR_CONTROL_KEYS.matchfeat_auto_apply,
    defaultValue: true,
    label: 'Match/Feat auto-apply',
    shortLabel: 'Match/Feat',
    scope: 'matching',
  },
  broadcast_qstash_fanout: {
    id: 'broadcast_qstash_fanout',
    key: OPERATOR_CONTROL_KEYS.broadcast_qstash_fanout,
    defaultValue: false,
    label: 'QStash fan-out',
    shortLabel: 'Fan-out',
    scope: 'delivery',
  },
};

function controlMetaKey(controlId) {
  return k([...CONTROL_META_PREFIX, String(controlId || '').trim()]);
}

function toBool(value, defaultValue = false) {
  if (value === null || value === undefined) return !!defaultValue;
  const s = String(value).trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'on' || s === 'yes') return true;
  if (s === '0' || s === 'false' || s === 'off' || s === 'no') return false;
  return !!defaultValue;
}

async function getBool(key, defaultValue = false) {
  try {
    const raw = await redis.get(key);
    return toBool(raw, defaultValue);
  } catch {
    return !!defaultValue;
  }
}

async function setBool(key, value) {
  try {
    // TTL-LINT: allow-persistent — operator control flags are intentional runtime toggles.
    await redis.set(key, value ? '1' : '0');
    return true;
  } catch {
    return false;
  }
}

async function getControlMeta(controlId) {
  try {
    const raw = await redis.get(controlMetaKey(controlId));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}

async function setControlMeta(controlId, meta = {}) {
  try {
    // TTL-LINT: allow-persistent — metadata tracks the latest explicit operator change.
    await redis.set(controlMetaKey(controlId), meta);
    return true;
  } catch {
    return false;
  }
}

function buildAuditEntry(entry = {}) {
  return {
    ts: new Date().toISOString(),
    controlId: String(entry.controlId || 'unknown'),
    label: String(entry.label || entry.controlId || 'unknown'),
    actorTgId: Number(entry.actorTgId || 0) || 0,
    actorUsername: String(entry.actorUsername || '').trim(),
    action: String(entry.action || 'set'),
    previousValue: entry.previousValue ?? null,
    nextValue: entry.nextValue ?? null,
    note: String(entry.note || '').trim(),
    extra: entry.extra ?? null,
  };
}

export async function appendOperatorControlAudit(entry = {}) {
  const payload = buildAuditEntry(entry);
  const lua = `
    redis.call('LPUSH', KEYS[1], ARGV[1])
    redis.call('LTRIM', KEYS[1], 0, 99)
    redis.call('EXPIRE', KEYS[1], 1209600)
    return 1
  `;
  try {
    await redis.eval(lua, [CONTROL_AUDIT_KEY], [JSON.stringify(payload)]);
    return true;
  } catch {
    return false;
  }
}

export async function getRecentOperatorControlAudit(limit = 8) {
  try {
    const raw = await redis.lrange(CONTROL_AUDIT_KEY, 0, Math.max(0, Number(limit || 8) - 1));
    return (Array.isArray(raw) ? raw : []).map((item) => {
      try {
        return typeof item === 'string' ? JSON.parse(item) : item;
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function buildActorLabel(meta = {}) {
  if (meta.actorUsername) return `@${String(meta.actorUsername).replace(/^@/, '')}`;
  if (Number(meta.actorTgId || 0) > 0) return `tg:${Number(meta.actorTgId || 0)}`;
  return '—';
}

function buildBoolControlItem(def, value, meta = null) {
  return {
    id: def.id,
    label: def.label,
    shortLabel: def.shortLabel,
    scope: def.scope,
    kind: 'toggle',
    value: !!value,
    state: value ? 'on' : 'off',
    stateLabel: value ? 'ON' : 'OFF',
    tone: value ? 'good' : 'warn',
    meta: meta || null,
    changedAt: meta?.at || null,
    changedBy: buildActorLabel(meta || {}),
  };
}

function buildFallbackControlItem(state = {}) {
  const envOn = !!state.envEnabled;
  const rt = state.runtime || {};
  const runtimeOn = !!state.runtimeEnabled;
  const effective = !!state.effective;
  let ttlLabel = '';
  if (runtimeOn) {
    let ttlSec = Number.isFinite(rt.ttlSec) ? Number(rt.ttlSec) : null;
    if (ttlSec === null && rt.expAt) {
      try {
        const expMs = Date.parse(String(rt.expAt));
        if (Number.isFinite(expMs) && expMs > 0) ttlSec = Math.max(0, Math.round((expMs - Date.now()) / 1000));
      } catch {}
    }
    if (ttlSec !== null) ttlLabel = ` · ~${ttlSec}s`;
  }
  return {
    id: 'payments_fallback',
    label: 'Payments fallback',
    shortLabel: 'Fallback',
    scope: 'payments',
    kind: 'runtime_override',
    value: effective,
    state: effective ? 'incident' : 'off',
    stateLabel: effective ? 'ON' : 'OFF',
    tone: effective ? 'warn' : 'good',
    envEnabled: envOn,
    runtimeEnabled: runtimeOn,
    runtimeLabel: runtimeOn ? `ON${ttlLabel}` : 'OFF',
    changedAt: rt.at || null,
    changedBy: rt.byUser ? String(rt.byUser) : (rt.byTgId ? `tg:${Number(rt.byTgId)}` : '—'),
    meta: runtimeOn ? {
      at: rt.at || null,
      actorTgId: Number(rt.byTgId || 0) || 0,
      actorUsername: String(rt.byUser || '').replace(/^@/, ''),
      value: true,
      reason: rt.reason || '',
      expAt: rt.expAt || null,
    } : null,
  };
}

export async function getAdminWebLoginGateState() {
  try {
    const raw = await redis.get(OPERATOR_CONTROL_KEYS.admin_web_login_enabled);
    return { ok: true, enabled: toBool(raw, true) };
  } catch {
    return { ok: false, enabled: false, error: 'auth_store_unavailable' };
  }
}

export async function isAdminWebLoginEnabled() {
  const state = await getAdminWebLoginGateState();
  return state.ok === true && state.enabled === true;
}

export async function setOperatorControlToggle(controlId, enabled, meta = {}) {
  const def = CONTROL_DEFS[String(controlId || '').trim()];
  if (!def) return { ok: false, error: 'unknown_control' };
  const prev = await getBool(def.key, def.defaultValue);
  const next = !!enabled;
  const writeOk = await setBool(def.key, next);
  if (!writeOk) return { ok: false, error: 'redis_write_failed' };

  const controlMeta = {
    at: new Date().toISOString(),
    actorTgId: Number(meta.actorTgId || 0) || 0,
    actorUsername: String(meta.actorUsername || '').replace(/^@/, '').trim(),
    value: next,
    note: String(meta.note || '').trim(),
  };
  await setControlMeta(def.id, controlMeta);
  await appendOperatorControlAudit({
    controlId: def.id,
    label: def.label,
    actorTgId: controlMeta.actorTgId,
    actorUsername: controlMeta.actorUsername,
    action: 'toggle',
    previousValue: prev,
    nextValue: next,
    note: controlMeta.note,
  });

  return { ok: true, previousValue: prev, nextValue: next, meta: controlMeta };
}

export async function getOperatorControlSnapshot({ limit = 8 } = {}) {
  const [
    adminWebLogin,
    payAccept,
    payAutoApply,
    matchFeatAutoApply,
    broadcastFanout,
    adminWebLoginMeta,
    payAcceptMeta,
    payAutoApplyMeta,
    matchFeatMeta,
    broadcastMeta,
    paymentsFallbackState,
    audit,
  ] = await Promise.all([
    getBool(CONTROL_DEFS.admin_web_login.key, CONTROL_DEFS.admin_web_login.defaultValue),
    getBool(CONTROL_DEFS.pay_accept.key, CONTROL_DEFS.pay_accept.defaultValue),
    getBool(CONTROL_DEFS.pay_auto_apply.key, CONTROL_DEFS.pay_auto_apply.defaultValue),
    getBool(CONTROL_DEFS.matchfeat_auto_apply.key, CONTROL_DEFS.matchfeat_auto_apply.defaultValue),
    getBool(CONTROL_DEFS.broadcast_qstash_fanout.key, CONTROL_DEFS.broadcast_qstash_fanout.defaultValue),
    getControlMeta(CONTROL_DEFS.admin_web_login.id),
    getControlMeta(CONTROL_DEFS.pay_accept.id),
    getControlMeta(CONTROL_DEFS.pay_auto_apply.id),
    getControlMeta(CONTROL_DEFS.matchfeat_auto_apply.id),
    getControlMeta(CONTROL_DEFS.broadcast_qstash_fanout.id),
    getPaymentsFallbackApplyState(),
    getRecentOperatorControlAudit(limit),
  ]);

  const items = [
    buildBoolControlItem(CONTROL_DEFS.admin_web_login, adminWebLogin, adminWebLoginMeta),
    buildBoolControlItem(CONTROL_DEFS.pay_accept, payAccept, payAcceptMeta),
    buildBoolControlItem(CONTROL_DEFS.pay_auto_apply, payAutoApply, payAutoApplyMeta),
    buildBoolControlItem(CONTROL_DEFS.matchfeat_auto_apply, matchFeatAutoApply, matchFeatMeta),
    buildBoolControlItem(CONTROL_DEFS.broadcast_qstash_fanout, broadcastFanout, broadcastMeta),
    buildFallbackControlItem(paymentsFallbackState),
  ];

  const byId = Object.fromEntries(items.map((item) => [item.id, item]));
  return {
    updatedAt: new Date().toISOString(),
    items,
    byId,
    audit,
    compact: {
      adminWebLogin: !!adminWebLogin,
      payAccept: !!payAccept,
      payAutoApply: !!payAutoApply,
      matchFeatAutoApply: !!matchFeatAutoApply,
      broadcastFanout: !!broadcastFanout,
      paymentsFallback: !!paymentsFallbackState?.effective,
    },
  };
}
