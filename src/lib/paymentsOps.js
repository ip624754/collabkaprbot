import { CFG } from './config.js';
import * as R from './redis.js';

// Payments operator controls & observability (Redis-only, best-effort).
//
// Goals:
// - runtime toggle for PAYMENTS_FALLBACK_APPLY (with TTL) from admin UI
// - cron/bot can check effective state (env OR runtime)
// - never throw: all functions are safe to call in user flows

const redis = R.redis;
const k = R.k;

// Redis key: short-lived runtime override for fallback apply.
// Value is an object; TTL is set via EX.
const PAY_FALLBACK_RT_KEY = k(['sys', 'pay_fallback_apply']);

function nowIso() {
  return new Date().toISOString();
}

function toInt(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
}

function clampTtlSec(ttlSec) {
  const n = toInt(ttlSec, 0);
  // 5 min .. 7 days (operator-only)
  return Math.max(5 * 60, Math.min(n || 0, 7 * 24 * 60 * 60));
}

function normalizeObj(v) {
  if (!v) return null;
  if (typeof v === 'object' && !Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const o = JSON.parse(v);
      if (o && typeof o === 'object' && !Array.isArray(o)) return o;
    } catch {
      // ignore
    }
  }
  return null;
}

export async function getPaymentsFallbackRuntime() {
  try {
    const v = await redis.get(PAY_FALLBACK_RT_KEY);
    const o = normalizeObj(v);
    if (!o) return { enabled: false, key: PAY_FALLBACK_RT_KEY };

    // Best-effort TTL (optional API)
    let ttlSec = null;
    try {
      if (typeof redis.ttl === 'function') ttlSec = toInt(await redis.ttl(PAY_FALLBACK_RT_KEY), null);
    } catch {
      ttlSec = null;
    }

    const enabled = !!o.enabled;
    const expAt = o.expAt ? String(o.expAt) : null;
    return {
      enabled,
      key: PAY_FALLBACK_RT_KEY,
      at: o.at ? String(o.at) : null,
      expAt,
      ttlSec: Number.isFinite(ttlSec) ? ttlSec : null,
      byTgId: o.byTgId ? Number(o.byTgId) : null,
      byUser: o.byUser ? String(o.byUser) : null,
      reason: o.reason ? String(o.reason) : null,
    };
  } catch {
    // Redis degraded: runtime override unavailable.
    return { enabled: false, key: PAY_FALLBACK_RT_KEY, error: 'redis_unavailable' };
  }
}

export async function setPaymentsFallbackRuntime({
  enabled,
  ttlSec,
  byTgId = null,
  byUser = null,
  reason = null,
} = {}) {
  const on = !!enabled;

  if (!on) {
    try {
      await redis.del(PAY_FALLBACK_RT_KEY);
      return { ok: true, enabled: false };
    } catch {
      return { ok: false, enabled: false, error: 'redis_unavailable' };
    }
  }

  const ttl = clampTtlSec(ttlSec);
  const expAt = new Date(Date.now() + ttl * 1000).toISOString();
  const obj = {
    enabled: true,
    at: nowIso(),
    expAt,
    ttlSec: ttl,
    byTgId: byTgId ? Number(byTgId) : null,
    byUser: byUser ? String(byUser) : null,
    reason: reason ? String(reason) : null,
  };

  try {
    await redis.set(PAY_FALLBACK_RT_KEY, obj, { ex: ttl });
    return { ok: true, enabled: true, ttlSec: ttl, expAt };
  } catch {
    return { ok: false, enabled: false, error: 'redis_unavailable' };
  }
}

export async function isPaymentsFallbackApplyEnabled() {
  // Effective state: env OR runtime.
  try {
    if (CFG.PAYMENTS_FALLBACK_APPLY_ENABLED) return true;
  } catch {
    // ignore
  }
  const rt = await getPaymentsFallbackRuntime();
  return !!rt.enabled;
}

export async function getPaymentsFallbackApplyState() {
  const envEnabled = !!CFG.PAYMENTS_FALLBACK_APPLY_ENABLED;
  const rt = await getPaymentsFallbackRuntime();
  const runtimeEnabled = !!rt.enabled;
  return {
    envEnabled,
    runtimeEnabled,
    effective: envEnabled || runtimeEnabled,
    runtime: rt,
  };
}
