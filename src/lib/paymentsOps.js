import { CFG } from './config.js';
import * as R from './redis.js';
import { queueOpsDigestSafe } from './opsDigest.js';

// Payments operator controls & observability (Redis-only, best-effort).
//
// Goals:
// - runtime toggle for PAYMENTS_FALLBACK_APPLY (with TTL) from admin UI
// - cron/bot can check effective state (env OR runtime)
// - never throw: all functions are safe to call in user flows

const redis = R.redis;
const k = R.k;
const incrWithExpire = typeof R.incrWithExpire === 'function' ? R.incrWithExpire : async () => 0;

// Redis key: short-lived runtime override for fallback apply.
// Value is an object; TTL is set via EX.
const PAY_FALLBACK_RT_KEY = k(['sys', 'pay_fallback_apply']);

// Observability: payload signature issues (Redis-only counters; shown in /api/health)
const PAY_PAYLOAD_ISSUE_TTL_SEC = 14 * 24 * 60 * 60; // 14 days

function dayKey() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function issueKey(bucket, day = dayKey()) {
  return k(['ops', 'payments', 'payload', String(bucket || 'unknown'), 'd', String(day || dayKey())]);
}

function normalizeIssueBucket(issue) {
  const r = String(issue || '').toLowerCase();
  if (r.includes('unsigned')) return 'unsigned';
  if (r.includes('bad_sig') || r.includes('sig')) return 'bad_sig';
  if (r.includes('bad_payload') || r.includes('format')) return 'bad_format';
  if (r.includes('hmac')) return 'hmac_error';
  return 'other';
}

export async function recordPaymentsPayloadIssue({
  issue,
  paymentId = null,
  userId = null,
  tgId = null,
  kind = null,
  payload = '',
  extra = [],
  day = null,
} = {}) {
  const bucket = normalizeIssueBucket(issue);
  const d = String(day || dayKey());
  const key = issueKey(bucket, d);

  // Counter: best-effort.
  try {
    await incrWithExpire(key, PAY_PAYLOAD_ISSUE_TTL_SEC);
  } catch {
    // ignore
  }

  // Ops digest: only for potentially dangerous / misconfig issues (avoid noise).
  const b = String(bucket);
  if (b === 'bad_sig' || b === 'hmac_error' || b === 'bad_format') {
    try {
      await queueOpsDigestSafe({
        group: 'ops',
        reason: `payments_payload_${b}`,
        title: 'Payments payload signature issue',
        paymentId: paymentId ? Number(paymentId) : null,
        userId: userId ? Number(userId) : null,
        tgId: tgId ? Number(tgId) : null,
        kind: 'payments',
        payload: String(payload || '').slice(0, 180),
        extra: [
          `bucket=${b}`,
          kind ? `kind=${String(kind).slice(0, 40)}` : '',
          issue ? `issue=${String(issue).slice(0, 80)}` : '',
          ...(Array.isArray(extra) ? extra : []).map((x) => String(x || '').slice(0, 120)),
        ].filter(Boolean),
        dedupId: `pay_payload:${b}:${d}`,
      });
    } catch {
      // ignore
    }
  }

  return { ok: true, bucket, day: d };
}

export async function getPaymentsPayloadIssueCounts(day = null) {
  const d = String(day || dayKey());
  const buckets = ['unsigned', 'bad_sig', 'bad_format', 'hmac_error', 'other'];
  try {
    const vals = await Promise.all(buckets.map((b) => redis.get(issueKey(b, d))));
    const out = {};
    for (let i = 0; i < buckets.length; i++) {
      out[buckets[i]] = Number(vals[i] || 0) || 0;
    }
    return { ok: true, day: d, counts: out };
  } catch {
    return { ok: false, day: d, counts: null };
  }
}

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
