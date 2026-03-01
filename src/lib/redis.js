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
  if (!Number.isFinite(lim) || lim <= 0) {
    return {
      allowed: true,
      remaining: Number.POSITIVE_INFINITY,
      limit: lim,
      current: 0,
      resetSec: win
    };
  }

  // Atomic INCR + EXPIRE via Lua to prevent immortal keys on crash between operations.
  // If process dies between non-atomic INCR and EXPIRE, key stays forever without TTL,
  // permanently blocking rate-limited actions.
  const luaScript = `
    local v = redis.call('INCR', KEYS[1])
    if v == 1 then
      redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
    end
    local t = redis.call('TTL', KEYS[1])
    return {v, t}
  `;

  let current, ttl;
  try {
    const res = await redis.eval(luaScript, [key], [String(win)]);
    if (Array.isArray(res)) {
      current = Number(res[0]) || 0;
      ttl = Number(res[1]);
      if (ttl < 0) ttl = null;
    } else {
      current = Number(res) || 0;
      ttl = null;
    }
  } catch {
    // Redis error: fail-open (allow the action).
    return {
      allowed: true,
      remaining: lim,
      limit: lim,
      current: 0,
      resetSec: win
    };
  }

  const remaining = Math.max(0, lim - current);
  return {
    allowed: current <= lim,
    remaining,
    limit: lim,
    current,
    resetSec: ttl ?? win
  };
}
