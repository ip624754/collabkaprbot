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
  } catch {
    // ignore
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
  } catch {
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
  } catch {
    // Redis degraded: fail-open (rate-limit is best-effort).
    // IMPORTANT: do NOT fallback to non-atomic INCR+EXPIRE here (can create immortal keys).
    return {
      ok: true,
      allowed: true,
      remaining: lim,
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
// Atomic Redis helpers (Upstash REST safe)
//
// Goal: remove remaining non-atomic command pairs like INCR+EXPIRE and LPUSH+LTRIM.
// These helpers are best-effort and must never break bot UX.
// =====================================================

const LUA_INCR_EXPIRE_ON_FIRST = `
  local v = redis.call('INCR', KEYS[1])
  if v == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end
  return v
`;

const LUA_INCR_EXPIRE_ALWAYS = `
  local v = redis.call('INCR', KEYS[1])
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
  return v
`;

const LUA_LPUSH_TRIM_EXPIRE = `
  redis.call('LPUSH', KEYS[1], ARGV[1])
  redis.call('LTRIM', KEYS[1], 0, tonumber(ARGV[2]) - 1)
  local ttl = tonumber(ARGV[3])
  if ttl and ttl > 0 then
    redis.call('EXPIRE', KEYS[1], ttl)
  end
  return 1
`;

// Atomically INCR key and set EXPIRE only on the first hit.
// Returns the current value, or 0 if Redis is unavailable.
export async function incrWithExpireOnFirst(key, ttlSec) {
  const k0 = String(key || '').trim();
  const ttl = Math.max(1, Number(ttlSec) || 0);
  if (!k0 || !ttl) return 0;
  try {
    const r = await redis.eval(LUA_INCR_EXPIRE_ON_FIRST, [k0], [String(ttl)]);
    return Number(r) || 0;
  } catch {
    // Do not fallback to non-atomic INCR+EXPIRE (can create immortal keys).
    return 0;
  }
}

// Atomically INCR key and refresh EXPIRE every time (bounded storage).
// Returns the current value, or 0 if Redis is unavailable.
export async function incrWithExpire(key, ttlSec) {
  const k0 = String(key || '').trim();
  const ttl = Math.max(1, Number(ttlSec) || 0);
  if (!k0 || !ttl) return 0;
  try {
    const r = await redis.eval(LUA_INCR_EXPIRE_ALWAYS, [k0], [String(ttl)]);
    return Number(r) || 0;
  } catch {
    // Best-effort: metrics/counters must never break bot.
    return 0;
  }
}

// Atomically LPUSH + LTRIM (+ optional EXPIRE) for bounded Redis lists.
// Returns true if pushed, false otherwise.
export async function lpushTrim(listKey, payload, maxLen, ttlSec = null) {
  const k0 = String(listKey || '').trim();
  const maxN = Math.max(1, Number(maxLen) || 1);
  const ttl = Math.max(0, Number(ttlSec) || 0);
  if (!k0) return false;
  try {
    await redis.eval(
      LUA_LPUSH_TRIM_EXPIRE,
      [k0],
      [String(payload ?? ''), String(maxN), String(ttl)]
    );
    return true;
  } catch {
    return false;
  }
}
