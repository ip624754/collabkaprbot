import { CFG } from './config.js';
import { redis, k, lpushTrim } from './redis.js';

function stdoutOpsFallback(event) {
  // Reserve channel when Redis is down: keep minimal incident context in stdout logs.
  // Must never throw.
  try {
    const e = event && typeof event === 'object' ? event : { msg: String(event || '') };
    // Keep payloads small and safe.
    const out = {
      t: 'ops_event',
      ts: new Date().toISOString(),
      ...e,
    };
    console.warn(JSON.stringify(out));
  } catch {
    // ignore
  }
}

function dayKey() {
  // YYYYMMDD UTC
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function hasOpsTargetsConfigured() {
  // Buffering ops events is pointless if nobody can receive them.
  try {
    if (String(CFG.SUPPORT_CHAT_ID || '').trim()) return true;
  } catch {
    // ignore
  }
  try {
    return Array.isArray(CFG.SUPER_ADMIN_TG_IDS) && CFG.SUPER_ADMIN_TG_IDS.length > 0;
  } catch {
    return false;
  }
}

function bufferKey(group) {
  return k(['ops', 'alerts', String(group || 'ops'), 'd', dayKey()]);
}

function dedupKey(group, dedupId) {
  return k(['ops', 'alerts', String(group || 'ops'), 'dedup', String(dedupId || '')]);
}

function isErrorishReason(reason) {
  const r = String(reason || '').toLowerCase();
  return (
    r.includes('error') ||
    r.includes('failed') ||
    r.includes('exception') ||
    r.includes('panic') ||
    r.includes('invalid')
  );
}

function clampDedupTtlSec() {
  const win = Number(CFG.OPS_ALERT_SUMMARY_SEC || 600);
  return Math.max(60, Math.min(30 * 60, Number.isFinite(win) ? win : 600));
}

export async function queueOpsDigest({
  group = 'ops',
  reason = 'error',
  title = '',
  paymentId = null,
  userId = null,
  tgId = null,
  kind = 'ops',
  payload = '',
  extra = [],
  dedupId = null,
} = {}) {
  // Keep operator chat quiet in silent mode.
  try {
    if (CFG.OPS_ALERT_SILENT && !isErrorishReason(reason)) return { queued: false, skipped: 'silent' };
  } catch {
    // ignore
  }

  if (!hasOpsTargetsConfigured()) return { queued: false, skipped: 'no_targets' };

  const g = String(group || 'ops');
  const bufK = bufferKey(g);

  const dId =
    dedupId ||
    (paymentId
      ? `p:${paymentId}|r:${reason}`
      : `r:${String(reason || 'error')}|k:${String(kind || '')}|u:${userId || ''}`);

  // Best-effort dedup.
  try {
    const ok = await redis.set(dedupKey(g, dId), '1', { nx: true, ex: clampDedupTtlSec() });
    if (!ok) return { queued: false, skipped: 'dedup' };
  } catch (e) {
    // If Redis is degraded, do not block the caller.
    stdoutOpsFallback({
      stage: 'dedup',
      group: g,
      reason: String(reason || 'error').slice(0, 64),
      title: String(title || '').slice(0, 120),
      kind: String(kind || '').slice(0, 64),
      paymentId: paymentId ? Number(paymentId) : null,
      userId: userId ? Number(userId) : null,
      tgId: tgId ? Number(tgId) : null,
      payload: String(payload || '').slice(0, 80),
      err: String(e?.message || e).slice(0, 160),
    });
    return { queued: false, skipped: 'redis_down' };
  }

  const ev = {
    ts: new Date().toISOString(),
    reason: String(reason || 'error'),
    title: String(title || ''),
    paymentId: paymentId ? Number(paymentId) : null,
    userId: userId ? Number(userId) : null,
    tgId: tgId ? Number(tgId) : null,
    kind: String(kind || ''),
    payload: String(payload || '').slice(0, 180),
    extra: (Array.isArray(extra) ? extra : [])
      .map((s) => String(s || '').slice(0, 300))
      .filter(Boolean),
  };

  // Atomic LPUSH + LTRIM (+ optional EXPIRE). Best-effort: never throws.
  try {
    const maxBuf = Math.max(10, Number(CFG.OPS_ALERT_BUFFER_MAX || 200));
    const ttlSec = 2 * 24 * 60 * 60;
    await lpushTrim(bufK, JSON.stringify(ev), maxBuf, ttlSec);
  } catch (e) {
    // ignore (best-effort), but keep a reserve breadcrumb.
    stdoutOpsFallback({
      stage: 'buffer',
      group: g,
      reason: String(ev.reason || 'error').slice(0, 64),
      title: String(ev.title || '').slice(0, 120),
      kind: String(ev.kind || '').slice(0, 64),
      paymentId: ev.paymentId,
      userId: ev.userId,
      tgId: ev.tgId,
      payload: String(ev.payload || '').slice(0, 80),
      err: String(e?.message || e).slice(0, 160),
    });
  }

  return { queued: true };
}

// Convenience: never throws.
export async function queueOpsDigestSafe(args) {
  try {
    return await queueOpsDigest(args);
  } catch (e) {
    stdoutOpsFallback({
      stage: 'safe_wrapper',
      reason: String(args?.reason || 'error').slice(0, 64),
      title: String(args?.title || '').slice(0, 120),
      kind: String(args?.kind || '').slice(0, 64),
      err: String(e?.message || e).slice(0, 160),
    });
    return { queued: false, error: 'queue_failed' };
  }
}
