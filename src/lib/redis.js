import { Redis } from '@upstash/redis';
import { CFG } from './config.js';

export const redis = new Redis({
  url: CFG.UPSTASH_REDIS_REST_URL,
  token: CFG.UPSTASH_REDIS_REST_TOKEN
});

// Consume a one-time key (invites, etc.): return the value and delete the key.
// - Prefer atomic GETDEL (Redis >= 6.2)
// - Fallback to Lua EVAL (atomic)
// - Last resort: GET + DEL (non-atomic)
//
// Values stored via redis.set(key, object) are JSON-serialized by Upstash.
export async function consumeOnce(key) {
  // 1) GETDEL (atomic)
  try {
    if (typeof redis.getdel === 'function') {
      return await redis.getdel(key);
    }
  } catch {
    // ignore
  }

  // 2) EVAL (atomic)
  try {
    const script = "local v = redis.call('GET', KEYS[1]); if v then redis.call('DEL', KEYS[1]); end; return v";
    const raw = await redis.eval(script, [key], []);
    if (!raw) return null;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
    return raw;
  } catch (e) {
    await queueOpsDigestFromRedis({
      reason: 'redis_lua_failed',
      title: 'consumeOnce: eval fallback failed',
      kind: 'redis',
      payload: String(key || '').slice(0, 160),
      extra: [String(e?.name || 'Error') + ': ' + String(e?.message || e).slice(0, 180)],
      dedupId: 'redis_eval:consumeOnce',
    });
  }

  // 3) GET + DEL (best effort)
  const val = await redis.get(key);
  if (val) {
    try {
      await redis.del(key);
    } catch {
      // ignore
    }
  }
  return val;
}

export function k(parts) {
  // namespaced keys
  return [
    'mg',
    CFG.APP_ENV,
    ...parts.map((p) => String(p))
  ].join(':');
}

// =====================================================
// Ops digest (Redis-only): convert expensive infra failures into a buffered ops alert.
// - Best-effort: never throws.
// - Anti-spam: Redis NX dedup per reason/window.
// - No Telegram API usage here; cron flushes the digest periodically.
// =====================================================

function dayKey() {
  // YYYYMMDD UTC
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function hasOpsTargetsConfigured() {
  try {
    if (String(CFG.SUPPORT_CHAT_ID || '').trim()) return true;
  } catch {}
  try {
    return Array.isArray(CFG.SUPER_ADMIN_TG_IDS) && CFG.SUPER_ADMIN_TG_IDS.length > 0;
  } catch {
    return false;
  }
}

function opsBufferKey(group) {
  return k(['ops', 'alerts', String(group || 'ops'), 'd', dayKey()]);
}

function opsDedupKey(group, dedupId) {
  return k(['ops', 'alerts', String(group || 'ops'), 'dedup', String(dedupId || '')]);
}

function isErrorishReason(reason) {
  const r = String(reason || '').toLowerCase();
  return r.includes('error') || r.includes('failed') || r.includes('exception') || r.includes('panic') || r.includes('invalid');
}

function clampDedupTtlSec() {
  const win = Number(CFG.OPS_ALERT_SUMMARY_SEC || 600);
  return Math.max(60, Math.min(30 * 60, Number.isFinite(win) ? win : 600));
}

async function queueOpsDigestFromRedis({
  group = 'ops',
  reason = 'error',
  title = '',
  kind = 'redis',
  payload = '',
  extra = [],
  dedupId = null,
} = {}) {
  try {
    if (CFG.OPS_ALERT_SILENT && !isErrorishReason(reason)) return;
  } catch {}
  if (!hasOpsTargetsConfigured()) return;

  const g = String(group || 'ops');
  const dId = dedupId || `r:${String(reason || 'error')}|k:${String(kind || '')}`;

  try {
    const ok = await redis.set(opsDedupKey(g, dId), '1', { nx: true, ex: clampDedupTtlSec() });
    if (!ok) return;
  } catch {
    return;
  }

  const ev = {
    ts: new Date().toISOString(),
    reason: String(reason || 'error'),
    title: String(title || ''),
    kind: String(kind || ''),
    payload: String(payload || '').slice(0, 180),
    extra: (Array.isArray(extra) ? extra : []).map((s) => String(s || '').slice(0, 300)).filter(Boolean),
  };

  const bufK = opsBufferKey(g);
  try {
    const maxBuf = Math.max(10, Number(CFG.OPS_ALERT_BUFFER_MAX || 200));
    const ttlSec = 2 * 24 * 60 * 60;
    const lua = `
      redis.call('LPUSH', KEYS[1], ARGV[1])
      redis.call('LTRIM', KEYS[1], 0, tonumber(ARGV[2]) - 1)
      redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
      return 1
    `;
    await redis.eval(lua, [bufK], [JSON.stringify(ev), String(maxBuf), String(ttlSec)]);
  } catch {
    // ignore
  }
}


// =====================================================
// Token-based locks (safe unlock after TTL expiry)
//
// Naive locks (SET NX EX + DEL) are unsafe: if TTL expires and another
// process acquires the same key, the old process may still DEL() and
// accidentally release the new owner's lock.
//
// We store a random token as the value and release via Lua:
// delete only if the stored token matches.
// =====================================================

function randomToken() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // ignore
  }
  return (
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2) +
    '-' +
    Math.random().toString(36).slice(2)
  );
}

// Acquire a lock. Returns { token } or null.
export async function acquireLock(lockKey, ttlSec) {
  const token = randomToken();
  const ok = await redis.set(lockKey, token, { nx: true, ex: Number(ttlSec) });
  if (!ok) return null;
  return { token };
}

// Release a lock only if it is still owned by the given token.
// Best-effort: failures should not crash cron.
export async function releaseLock(lockKey, token) {
  if (!lockKey || !token) return false;
  const script =
    "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
  try {
    const r = await redis.eval(script, [lockKey], [String(token)]);
    return Number(r) === 1;
  } catch (e) {
    await queueOpsDigestFromRedis({
      reason: 'redis_lua_failed',
      title: 'releaseLock: eval failed',
      kind: 'redis',
      payload: String(lockKey || '').slice(0, 160),
      extra: [String(e?.name || 'Error') + ': ' + String(e?.message || e).slice(0, 180)],
      dedupId: 'redis_eval:releaseLock',
    });
    return false;
  }
}

// Simple rate limiter (good enough for Upstash REST Redis in our use-cases):
// - INCR key
// - if first hit => EXPIRE key
// Returns: { allowed, remaining, limit, current, resetSec }
// NOTE: this is infra-only in Commit 4; enforcement is wired in Commit 5.
export async function rateLimit(key, { limit = 0, windowSec = 60 } = {}) {
  const lim = Number(limit);
  const win = Number(windowSec);

  // lim<=0 => unlimited (fail-open)
  if (!Number.isFinite(lim) || lim <= 0) {
    return {
      ok: true,
      allowed: true,
      remaining: Number.POSITIVE_INFINITY,
      limit: lim,
      current: 0,
      resetSec: win
    };
  }

  let current = 0;
  try {
    // Atomic INCR + EXPIRE on first hit (prevents keys without TTL).
    const script = `
      local v = redis.call('INCR', KEYS[1])
      if v == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
      return v
    `;
    const r = await redis.eval(script, [key], [String(win)]);
    current = Number(r || 0);
  } catch (e) {
    await queueOpsDigestFromRedis({
      reason: 'redis_lua_failed',
      title: 'rateLimit: eval failed (fail-open)',
      kind: 'redis',
      payload: String(key || '').slice(0, 160),
      extra: [String(e?.name || 'Error') + ': ' + String(e?.message || e).slice(0, 180)],
      dedupId: 'redis_eval:rateLimit',
    });
    // Redis degraded or scripts unavailable: fail-open.
    // IMPORTANT: do NOT fallback to non-atomic INCR+EXPIRE, because it can leave keys without TTL.
    return {
      ok: true,
      allowed: true,
      remaining: Number.POSITIVE_INFINITY,
      limit: lim,
      current: 0,
      resetSec: win
    };
  }

  let ttl = null;
  try {
    ttl = await redis.ttl(key);
    if (ttl !== null && ttl < 0) ttl = null;
  } catch {
    ttl = null;
  }

  const allowed = current <= lim;
  const remaining = Math.max(0, lim - current);
  return {
    ok: allowed,
    allowed,
    remaining,
    limit: lim,
    current,
    resetSec: ttl ?? win
  };
}
// =====================================================
// Atomic counter helpers (Lua)
// =====================================================

// INCR key; if first hit => EXPIRE ttlSec (does not extend TTL on subsequent hits)
export async function incrWithExpireOnFirst(key, ttlSec) {
  if (!key) return 0;
  const ttl = Number(ttlSec);
  if (!Number.isFinite(ttl) || ttl <= 0) {
    try { return Number(await redis.incr(key)) || 0; } catch { return 0; }
  }

  try {
    const script = `
      local v = redis.call('INCR', KEYS[1])
      if v == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
      return v
    `;
    const r = await redis.eval(script, [key], [String(ttl)]);
    return Number(r || 0);
  } catch (e) {
    await queueOpsDigestFromRedis({
      reason: 'redis_lua_failed',
      title: 'incrWithExpireOnFirst: eval failed (non-atomic fallback)',
      kind: 'redis',
      payload: String(key || '').slice(0, 160),
      extra: [String(e?.name || 'Error') + ': ' + String(e?.message || e).slice(0, 180)],
      dedupId: 'redis_eval:incrWithExpireOnFirst',
    });
    // Fallback: best-effort (non-atomic)
    try {
      const r = await redis.incr(key);
      const v = Number(r || 0);
      if (v == 1) {
        try { await redis.expire(key, ttl); } catch {}
      }
      return v;
    } catch {
      return 0;
    }
  }
}

// INCR key; always EXPIRE ttlSec (sliding TTL)
export async function incrWithExpire(key, ttlSec) {
  if (!key) return 0;
  const ttl = Number(ttlSec);
  if (!Number.isFinite(ttl) || ttl <= 0) {
    try { return Number(await redis.incr(key)) || 0; } catch { return 0; }
  }

  try {
    const script = `
      local v = redis.call('INCR', KEYS[1])
      redis.call('EXPIRE', KEYS[1], ARGV[1])
      return v
    `;
    const r = await redis.eval(script, [key], [String(ttl)]);
    return Number(r || 0);
  } catch {
    // Fallback: best-effort (non-atomic)
    try {
      const r = await redis.incr(key);
      const v = Number(r || 0);
      try { await redis.expire(key, ttl); } catch {}
      return v;
    } catch {
      return 0;
    }
  }
}

// LPUSH + LTRIM (bounded list) with optional EXPIRE; atomic via Lua.
export async function lpushTrim(key, value, maxLen = 200, ttlSec = null) {
  if (!key) return false;
  const n = Math.max(1, Number(maxLen) || 1);
  const ttl = ttlSec === null || ttlSec === undefined ? null : Number(ttlSec);

  try {
    const script = `
      redis.call('LPUSH', KEYS[1], ARGV[1])
      redis.call('LTRIM', KEYS[1], 0, tonumber(ARGV[2]) - 1)
      if ARGV[3] and ARGV[3] ~= '' then
        redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
      end
      return 1
    `;
    const args = [String(value), String(n), (Number.isFinite(ttl) && ttl > 0) ? String(ttl) : ''];
    const r = await redis.eval(script, [key], args);
    return Number(r || 0) === 1;
  } catch {
    // Fallback: best-effort (non-atomic)
    try {
      await redis.lpush(key, value);
      await redis.ltrim(key, 0, n - 1);
      if (Number.isFinite(ttl) && ttl > 0) {
        try { await redis.expire(key, ttl); } catch {}
      }
      return true;
    } catch {
      return false;
    }
  }
}
