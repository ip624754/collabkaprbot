import { redis, k } from '../lib/redis.js'; 
import { CFG } from '../lib/config.js';

const EXPECT_TEXT_DEFAULT_TTL_SEC = 15 * 60;

// Safety: even if handlers keep re-arming expectText on invalid input,
// a user must not get stuck in input mode indefinitely.
// We cap the *total lifetime* of an expectText session from its first arm.
const EXPECT_TEXT_MAX_LIFETIME_SEC = (() => {
  const n = Number(CFG.EXPECT_TEXT_MAX_LIFETIME_SEC || 0);
  if (!Number.isFinite(n) || n <= 0) return 2 * 60 * 60; // default: 2h
  return Math.max(5 * 60, Math.min(n, 24 * 60 * 60)); // 5min..24h
})();

export async function setExpectText(tgId, payload, ttlSec = EXPECT_TEXT_DEFAULT_TTL_SEC) {
  try {
    const now = Date.now();
    const p = (payload && typeof payload === 'object') ? { ...payload } : { value: payload };
    const startedAtRaw = Number(p._startedAt);
    const startedAt = (Number.isFinite(startedAtRaw) && startedAtRaw > 0) ? startedAtRaw : now;
    p._startedAt = startedAt;

    const ageSec = Math.max(0, Math.floor((now - startedAt) / 1000));
    const remainingMax = Math.max(0, EXPECT_TEXT_MAX_LIFETIME_SEC - ageSec);

    // If the session already exceeded max lifetime — drop it.
    if (remainingMax <= 1) {
      try { await redis.del(k(['expectText', tgId])); } catch {}
      return;
    }

    const want = Number(ttlSec);
    const ttl = Number.isFinite(want) && want > 0 ? want : EXPECT_TEXT_DEFAULT_TTL_SEC;
    const ex = Math.max(30, Math.min(ttl, remainingMax));
    await redis.set(k(['expectText', tgId]), p, { ex });
  } catch (e) {
    console.error('[REDIS] setExpectText failed', String(e?.message || e));
  }
}

export async function getExpectText(tgId) {
  try {
    return await redis.get(k(['expectText', tgId]));
  } catch (e) {
    console.error('[REDIS] getExpectText failed', String(e?.message || e));
    return null;
  }
}

export async function clearExpectText(tgId) {
  try {
    await redis.del(k(['expectText', tgId]));
  } catch (e) {
    console.error('[REDIS] clearExpectText failed', String(e?.message || e));
  }
}

export async function setDraft(tgId, draft, ttlSec = 60 * 60) {
  try {
    await redis.set(k(['draft', tgId]), draft, { ex: ttlSec });
  } catch (e) {
    console.error('[REDIS] setDraft failed', String(e?.message || e));
  }
}

export async function getDraft(tgId) {
  try {
    return await redis.get(k(['draft', tgId]));
  } catch (e) {
    console.error('[REDIS] getDraft failed', String(e?.message || e));
    return null;
  }
}

export async function clearDraft(tgId) {
  try {
    await redis.del(k(['draft', tgId]));
  } catch (e) {
    console.error('[REDIS] clearDraft failed', String(e?.message || e));
  }
}
