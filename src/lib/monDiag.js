import { redis, k } from './redis.js';

const DIAG_TTL_SEC = 14 * 24 * 60 * 60;

export function toMonCode(v, maxLen = 48) {
  const s = String(v || '').toLowerCase();
  if (!s) return '';
  return s
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLen);
}

// Backwards compatible alias (older code used toShortCode)
export const toShortCode = toMonCode;

export function maskId(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (s.length <= 8) return s;
  return `${s.slice(0, 3)}…${s.slice(-3)}`;
}

// Backwards compatible alias (older code used maskMonId)
export const maskMonId = maskId;

export async function setMonRetryMeta({ atIso, action } = {}) {
  const at = String(atIso || '').trim();
  const act = String(action || '').trim();

  try {
    if (at) await redis.set(k(['mon', 'retry', 'last_at']), at, { ex: DIAG_TTL_SEC });
    if (act) await redis.set(k(['mon', 'retry', 'last_action']), act, { ex: DIAG_TTL_SEC });
  } catch {
    // best-effort
  }
}

export async function setMonRetryDiag({ atIso, action, status, errorCode } = {}) {
  const st = String(status || '').trim();
  const ec = toMonCode(errorCode);

  try {
    if (st) await redis.set(k(['mon', 'retry', 'last_status']), st, { ex: DIAG_TTL_SEC });

    // Keep old behavior: clear last_error when code is empty.
    if (ec) {
      await redis.set(k(['mon', 'retry', 'last_error']), ec, { ex: DIAG_TTL_SEC });
    } else {
      try { await redis.del(k(['mon', 'retry', 'last_error'])); } catch {}
    }
  } catch {
    // best-effort
  }
}

export async function setMonIntroDiag({ atIso, status, errorCode, offerId } = {}) {
  const args0 = arguments[0] || {};
  const hasEc = Object.prototype.hasOwnProperty.call(args0, 'errorCode');

  const at = String(atIso || '').trim() || new Date().toISOString();
  const st = String(status || '').trim();
  const ec = toMonCode(errorCode);
  const oid = offerId ? maskId(offerId) : '';

  try {
    if (at) await redis.set(k(['mon', 'intro', 'last_at']), at, { ex: DIAG_TTL_SEC });
    if (oid) await redis.set(k(['mon', 'intro', 'last_offer_id']), oid, { ex: DIAG_TTL_SEC });
    if (st) await redis.set(k(['mon', 'intro', 'last_status']), st, { ex: DIAG_TTL_SEC });

    // Keep old behavior: only touch last_error when errorCode key is present.
    if (hasEc) {
      if (ec) {
        await redis.set(k(['mon', 'intro', 'last_error']), ec, { ex: DIAG_TTL_SEC });
      } else {
        try { await redis.del(k(['mon', 'intro', 'last_error'])); } catch {}
      }
    }
  } catch {
    // best-effort
  }
}


export async function setMonAcceptDiag({ atIso, status, errorCode, appId, source } = {}) {
  const args0 = arguments[0] || {};
  const hasEc = Object.prototype.hasOwnProperty.call(args0, 'errorCode');
  const hasSrc = Object.prototype.hasOwnProperty.call(args0, 'source');

  const at = String(atIso || '').trim() || new Date().toISOString();
  const st = String(status || '').trim();
  const ec = toMonCode(errorCode);
  const id = appId ? maskId(appId) : '';
  const src = toMonCode(source, 16);

  try {
    if (at) await redis.set(k(['mon', 'accept', 'last_at']), at, { ex: DIAG_TTL_SEC });
    if (id) await redis.set(k(['mon', 'accept', 'last_app_id']), id, { ex: DIAG_TTL_SEC });
    if (st) await redis.set(k(['mon', 'accept', 'last_status']), st, { ex: DIAG_TTL_SEC });

    if (hasSrc) {
      if (src) {
        await redis.set(k(['mon', 'accept', 'last_source']), src, { ex: DIAG_TTL_SEC });
      } else {
        try { await redis.del(k(['mon', 'accept', 'last_source'])); } catch {}
      }
    }

    if (hasEc) {
      if (ec) {
        await redis.set(k(['mon', 'accept', 'last_error']), ec, { ex: DIAG_TTL_SEC });
      } else {
        try { await redis.del(k(['mon', 'accept', 'last_error'])); } catch {}
      }
    }
  } catch {
    // best-effort
  }
}

export async function setMonUnlockDiag({ atIso, status, errorCode, wsId, source } = {}) {
  const args0 = arguments[0] || {};
  const hasEc = Object.prototype.hasOwnProperty.call(args0, 'errorCode');
  const hasSrc = Object.prototype.hasOwnProperty.call(args0, 'source');

  const at = String(atIso || '').trim() || new Date().toISOString();
  const st = String(status || '').trim();
  const ec = toMonCode(errorCode);
  const id = wsId ? maskId(wsId) : '';
  const src = toMonCode(source, 16);

  try {
    if (at) await redis.set(k(['mon', 'unlock', 'last_at']), at, { ex: DIAG_TTL_SEC });
    if (id) await redis.set(k(['mon', 'unlock', 'last_ws_id']), id, { ex: DIAG_TTL_SEC });
    if (st) await redis.set(k(['mon', 'unlock', 'last_status']), st, { ex: DIAG_TTL_SEC });

    if (hasSrc) {
      if (src) {
        await redis.set(k(['mon', 'unlock', 'last_source']), src, { ex: DIAG_TTL_SEC });
      } else {
        try { await redis.del(k(['mon', 'unlock', 'last_source'])); } catch {}
      }
    }

    if (hasEc) {
      if (ec) {
        await redis.set(k(['mon', 'unlock', 'last_error']), ec, { ex: DIAG_TTL_SEC });
      } else {
        try { await redis.del(k(['mon', 'unlock', 'last_error'])); } catch {}
      }
    }
  } catch {
    // best-effort
  }
}
