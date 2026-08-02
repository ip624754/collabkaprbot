import { queueOpsDigestSafe } from '../../lib/opsDigest.js';
import { redis, k, incrWithExpireOnFirst } from '../../lib/redis.js';

function getDbBackoffSec() {
  const v = Number(process.env.BROADCAST_DB_BACKOFF_SEC || 60) || 60;
  return Math.max(10, Math.min(600, v));
}

function getDbBackoffJitterSec() {
  const v = Number(process.env.BROADCAST_DB_BACKOFF_JITTER_SEC || 15);
  if (!Number.isFinite(v)) return 15;
  return Math.max(0, Math.min(60, Math.trunc(v)));
}

function randIntInclusive(min, max) {
  const a = Math.trunc(Number(min));
  const b = Math.trunc(Number(max));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (hi <= lo) return lo;
  // NOTE: Math.random is fine here: we only need jitter against thundering herd.
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export function dbOverloadFuseKey() {
  return k(['ops', 'fuse', 'db_overload']);
}

function getDbOverloadFuseTtlSec() {
  const v = Number(process.env.BROADCAST_DB_OVERLOAD_FUSE_TTL_SEC || 50);
  if (!Number.isFinite(v)) return 50;
  return Math.max(10, Math.min(300, Math.trunc(v)));
}

// Best-effort local fuse for the rare path: DB overloaded + Redis unavailable.
// Scope: warm lambda instance only. This avoids repeatedly touching Neon while Redis is degraded.
let localDbDegradedUntilMs = 0;

function getLocalDbOverloadFuseTtlMs() {
  const v = Number(process.env.BROADCAST_DB_OVERLOAD_LOCAL_FUSE_TTL_MS || 15_000);
  if (!Number.isFinite(v)) return 15_000;
  return Math.max(5_000, Math.min(60_000, Math.trunc(v)));
}

export function getLocalDbOverloadFuseUntilMs(nowMs = Date.now()) {
  const untilMs = Number(localDbDegradedUntilMs || 0) || 0;
  if (!untilMs || untilMs <= nowMs) {
    localDbDegradedUntilMs = 0;
    return 0;
  }
  return untilMs;
}

function armLocalDbOverloadFuse(nowMs = Date.now()) {
  const ttlMs = getLocalDbOverloadFuseTtlMs();
  const nextUntilMs = nowMs + ttlMs;
  localDbDegradedUntilMs = Math.max(Number(localDbDegradedUntilMs || 0) || 0, nextUntilMs);
  return localDbDegradedUntilMs;
}

export function isDbOverloadError(err) {
  if (!err) return false;
  const code = String(err?.code || err?.errno || '').toUpperCase();
  const msg = String(err?.message || err).toLowerCase();

  // Common network / pool failures (pg/neon/serverless)
  if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) return true;

  // Postgres / pool saturation and transient disconnects
  if (['53300', '57P01', '57P02', '57P03', '08000', '08001', '08003', '08006', '08004'].includes(code)) return true;

  return (
    msg.includes('too many clients') ||
    msg.includes('remaining connection slots') ||
    msg.includes('connection terminated') ||
    msg.includes('terminating connection') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('connect econnrefused') ||
    msg.includes('could not connect') ||
    msg.includes('connection ended unexpectedly') ||
    msg.includes('no pg_hba.conf entry') // often shows up during misconfig / transient env
  );
}

function setQStashRetryAfterHeaders(res, sec) {
  const s = Math.max(1, Number(sec || 0) || 1);
  // QStash supports standard Retry-After (seconds) + Upstash-Retry-After (duration format).
  try { res.setHeader('Retry-After', String(s)); } catch {}
  try { res.setHeader('Upstash-Retry-After', `${s}s`); } catch {}
}

export async function respondDbOverload({ res, broadcastId, userId, tgId, attempt, where, err }) {
  const baseSec = getDbBackoffSec();
  const jitterMax = getDbBackoffJitterSec();
  const jitterSec = jitterMax > 0 ? randIntInclusive(0, jitterMax) : 0;
  const sec = Math.max(1, Number(baseSec) + Number(jitterSec));
  setQStashRetryAfterHeaders(res, sec);

  // DB overload fuse (Redis): short-circuit retries BEFORE touching Neon/pool on the next calls.
  // If Redis is unavailable too, arm a short local fuse for this warm instance.
  try {
    await redis.set(dbOverloadFuseKey(), new Date().toISOString(), { ex: getDbOverloadFuseTtlSec() });
  } catch {
    armLocalDbOverloadFuse();
  }

  // Redis-only metrics for operators: count today + last timestamp.
  // Best-effort and must never throw (we're already in a degraded path).
  try {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD UTC
    const ttlSec = 2 * 24 * 60 * 60;
    await incrWithExpireOnFirst(k(['ops', 'reasons', 'broadcast_db_overload', 'd', day]), ttlSec);
    await redis.set(k(['ops', 'reasons', 'broadcast_db_overload', 'last_at']), new Date().toISOString(), { ex: ttlSec });
    if (where) {
      await redis.set(
        k(['ops', 'reasons', 'broadcast_db_overload', 'last_where']),
        String(where).slice(0, 80),
        { ex: ttlSec }
      );
    }
  } catch (e) {
    // Reserve breadcrumb in stdout when Redis is down.
    try {
      console.warn(
        JSON.stringify({
          t: 'ops_event',
          ts: new Date().toISOString(),
          stage: 'redis_metrics',
          reason: 'broadcast_db_overload',
          where: String(where || '').slice(0, 80),
          broadcastId: Number(broadcastId || 0) || 0,
          userId: Number(userId || 0) || 0,
          tgId: Number(tgId || 0) || 0,
          err: String(e?.message || e).slice(0, 180),
        })
      );
    } catch {}
  }

  // Best-effort ops digest (Redis-only). Dedup per broadcast to avoid spam.
  try {
    const bid = Number(broadcastId || 0) || 0;
    await queueOpsDigestSafe({
      group: 'ops',
      reason: 'broadcast_db_overload',
      title: 'Broadcast delivery: DB overloaded',
      kind: 'db',
      payload: bid ? `broadcast=${bid}` : '',
      extra: [
        where ? `where=${where}` : '',
        userId ? `user=${userId}` : '',
        tgId ? `tg=${tgId}` : '',
        Number.isFinite(attempt) ? `attempt=${attempt}` : '',
        String(err?.code || '').trim() ? `code=${String(err.code).trim()}` : '',
        String(err?.message || err).slice(0, 180),
      ].filter(Boolean),
      dedupId: bid ? `broadcast_db_overload:${bid}` : 'broadcast_db_overload',
    });
  } catch {}

  res.status(429).json({
    ok: false,
    error: 'db_overloaded',
    retry_after_sec: sec,
    base_backoff_sec: baseSec,
    jitter_sec: jitterSec,
    where: where || null,
  });
}

export async function respondDbOverloadFuse({ res, broadcastId, userId, tgId, attempt, where, retryAfterSec, localFuse = false }) {
  const baseSec = getDbBackoffSec();
  const jitterMax = getDbBackoffJitterSec();
  const jitterSec = jitterMax > 0 ? randIntInclusive(0, jitterMax) : 0;
  const floorSec = Math.max(1, Number(retryAfterSec || 0) || 0);
  const sec = Math.max(floorSec, Number(baseSec) + Number(jitterSec));
  setQStashRetryAfterHeaders(res, sec);

  // Best-effort ops digest (deduped) so operators can see that the fuse is active.
  try {
    const bid = Number(broadcastId || 0) || 0;
    await queueOpsDigestSafe({
      group: 'ops',
      reason: 'broadcast_db_overload_fuse',
      title: 'Broadcast delivery: DB overload fuse active',
      kind: 'db',
      payload: bid ? `broadcast=${bid}` : '',
      extra: [
        where ? `where=${where}` : '',
        userId ? `user=${userId}` : '',
        tgId ? `tg=${tgId}` : '',
        Number.isFinite(attempt) ? `attempt=${attempt}` : '',
      ].filter(Boolean),
      dedupId: 'broadcast_db_overload_fuse',
    });
  } catch {}

  res.status(429).json({
    ok: false,
    error: 'db_overloaded',
    retry_after_sec: sec,
    base_backoff_sec: baseSec,
    jitter_sec: jitterSec,
    where: where || (localFuse ? 'local_fuse' : 'fuse'),
    fuse: true,
    local_fuse: Boolean(localFuse),
  });
}
