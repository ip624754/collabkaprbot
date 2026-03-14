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
const PAY_FALLBACK_RT_MIN_TTL_SEC = 5 * 60;
const PAY_FALLBACK_RT_MAX_TTL_SEC = 24 * 60 * 60;
const PAY_FALLBACK_RT_ALERT_REPEAT_SEC = 2 * 60 * 60;
const PAY_FALLBACK_RT_STALE_GRACE_SEC = 5 * 60;

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
  // 5 min .. 24 h (operator-only)
  return Math.max(PAY_FALLBACK_RT_MIN_TTL_SEC, Math.min(n || 0, PAY_FALLBACK_RT_MAX_TTL_SEC));
}

function parseIsoMs(v) {
  if (!v) return null;
  try {
    const ms = Date.parse(String(v));
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  } catch {
    return null;
  }
}

function roundHours1(n) {
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function bucket2h(nowMs = Date.now()) {
  return Math.floor(nowMs / (PAY_FALLBACK_RT_ALERT_REPEAT_SEC * 1000));
}

function heartbeatKey(bucket) {
  return k(['ops', 'payments', 'fallback_apply', 'heartbeat', String(bucket || 0)]);
}

function formatHoursTail(ageSec) {
  if (!Number.isFinite(ageSec) || ageSec < 0) return '—';
  const h = roundHours1(ageSec / 3600);
  return Number.isFinite(h) ? `${String(h)}h` : '—';
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
    const at = o.at ? String(o.at) : null;
    const expAt = o.expAt ? String(o.expAt) : null;
    const atMs = parseIsoMs(at);
    const expMs = parseIsoMs(expAt);

    let ageSec = null;
    if (atMs !== null) ageSec = Math.max(0, Math.round((Date.now() - atMs) / 1000));

    let leftSec = Number.isFinite(ttlSec) ? Math.max(0, Number(ttlSec)) : null;
    if (leftSec === null && expMs !== null) {
      leftSec = Math.max(0, Math.round((expMs - Date.now()) / 1000));
    }

    const hoursActive = Number.isFinite(ageSec) ? roundHours1(ageSec / 3600) : null;
    return {
      enabled,
      key: PAY_FALLBACK_RT_KEY,
      at,
      expAt,
      ttlSec: Number.isFinite(ttlSec) ? ttlSec : null,
      leftSec,
      ageSec,
      hoursActive,
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

export function getPaymentsFallbackGuardrailConfig() {
  return {
    minTtlSec: PAY_FALLBACK_RT_MIN_TTL_SEC,
    maxTtlSec: PAY_FALLBACK_RT_MAX_TTL_SEC,
    alertRepeatSec: PAY_FALLBACK_RT_ALERT_REPEAT_SEC,
  };
}

export async function enforcePaymentsFallbackRuntimeGuardrails({ source = 'cron' } = {}) {
  const rt = await getPaymentsFallbackRuntime();
  if (!rt?.enabled) return { ok: true, enabled: false, skipped: 'disabled' };

  const nowMs = Date.now();
  const expMs = parseIsoMs(rt.expAt);
  const ageSec = Number.isFinite(rt.ageSec) ? Number(rt.ageSec) : null;
  const staleExpired = expMs !== null && expMs <= nowMs;
  const staleHardCap = ageSec !== null && ageSec > (PAY_FALLBACK_RT_MAX_TTL_SEC + PAY_FALLBACK_RT_STALE_GRACE_SEC);

  if (staleExpired || staleHardCap) {
    const off = await setPaymentsFallbackRuntime({ enabled: false });
    try {
      await queueOpsDigestSafe({
        group: 'ops',
        reason: 'payments_fallback_apply_runtime_auto_disabled',
        title: 'Payments fallback runtime auto-disabled',
        kind: 'payments',
        payload: '',
        extra: [
          `source=${String(source || 'cron').slice(0, 40)}`,
          `why=${staleExpired ? 'expired' : 'hard_cap'}`,
          `active=${formatHoursTail(ageSec)}`,
          rt.expAt ? `until=${String(rt.expAt).slice(0, 19)}` : '',
          rt.byUser ? `by=${String(rt.byUser).slice(0, 80)}` : (rt.byTgId ? `by=tg:${rt.byTgId}` : ''),
          rt.reason ? `reason=${String(rt.reason).slice(0, 120)}` : '',
        ].filter(Boolean),
        dedupId: staleExpired ? 'pay_fb:auto_off:expired' : 'pay_fb:auto_off:hard_cap',
      });
    } catch {
      // ignore
    }
    return { ok: !!off?.ok, enabled: false, autoDisabled: true, why: staleExpired ? 'expired' : 'hard_cap' };
  }

  const bucket = bucket2h(nowMs);
  let reserved = false;
  try {
    reserved = !!(await redis.set(heartbeatKey(bucket), '1', { nx: true, ex: PAY_FALLBACK_RT_ALERT_REPEAT_SEC }));
  } catch {
    reserved = false;
  }

  if (!reserved) {
    return { ok: true, enabled: true, alertQueued: false, ageSec, hoursActive: rt.hoursActive };
  }

  try {
    await queueOpsDigestSafe({
      group: 'ops',
      reason: 'payments_fallback_apply_runtime_enabled',
      title: 'Payments fallback runtime still enabled',
      kind: 'payments',
      payload: '',
      extra: [
        `source=${String(source || 'cron').slice(0, 40)}`,
        `active=${formatHoursTail(ageSec)}`,
        Number.isFinite(rt.leftSec) ? `left=~${formatHoursTail(Math.max(0, Number(rt.leftSec || 0)))}` : '',
        rt.expAt ? `until=${String(rt.expAt).slice(0, 19)}` : '',
        rt.byUser ? `by=${String(rt.byUser).slice(0, 80)}` : (rt.byTgId ? `by=tg:${rt.byTgId}` : ''),
        rt.reason ? `reason=${String(rt.reason).slice(0, 120)}` : '',
      ].filter(Boolean),
      dedupId: `pay_fb:heartbeat:${bucket}`,
    });
  } catch {
    // ignore
  }

  return { ok: true, enabled: true, alertQueued: true, ageSec, hoursActive: rt.hoursActive };
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
