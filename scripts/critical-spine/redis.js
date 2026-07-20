import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Redis } from '@upstash/redis';

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  return JSON.parse(String(value));
}

function buildRes() {
  const headers = new Map();
  return {
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    getHeader(name) { return headers.get(String(name).toLowerCase()); },
  };
}

export async function runRedisSpine({ url, token }) {
  const redis = new Redis({ url, token });
  const unique = `${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  const prefix = `critical_spine:${unique}`;
  const keys = new Set();
  const key = (suffix) => {
    const value = `${prefix}:${suffix}`;
    keys.add(value);
    return value;
  };

  // Production modules read env once at import time. Use a unique non-production
  // namespace so the integration run cannot collide with application keys.
  process.env.APP_ENV = `critical_spine_${unique}`;
  process.env.UPSTASH_REDIS_REST_URL = url;
  process.env.UPSTASH_REDIS_REST_TOKEN = token;
  process.env.DATABASE_URL ||= 'postgresql://critical:critical@localhost/critical';
  process.env.BOT_TOKEN ||= '123456:test-token';
  process.env.WEBHOOK_SECRET_TOKEN ||= 'critical-spine-webhook-secret-1234567890';
  process.env.ADMIN_WEB_ENABLED = '1';
  process.env.ADMIN_WEB_SECRET = 'critical-spine-admin-secret-123456789012345';
  process.env.ADMIN_WEB_SESSION_SECRET = 'critical-spine-session-secret-123456789012';
  process.env.ADMIN_WEB_APPROVER_TG_IDS = '77';
  process.env.SUPER_ADMIN_TG_IDS = '77';

  try {
    // Raw Redis capability: SET NX must admit exactly one concurrent claimant.
    const claimKey = key('raw_claim');
    const claims = await Promise.all(
      Array.from({ length: 12 }, (_, i) => redis.set(claimKey, `worker-${i}`, { nx: true, ex: 120 }))
    );
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal((await redis.ttl(claimKey)) > 0, true);

    const { k } = await import('../../src/lib/redis.js');
    const {
      claimCriticalTelegramUpdate,
      finalizeCriticalTelegramUpdate,
    } = await import('../../src/lib/criticalUpdateReplay.js');
    const {
      approveChallengeFromTelegram,
      consumeAdminAuthRateLimit,
      issueSession,
    } = await import('../../src/lib/adminWeb/auth.js');
    const { hmacSha256, sha256 } = await import('../../src/lib/adminWeb/common.js');

    // Execute the production critical-update receipt functions against real Redis.
    const updateId = 700_000_000 + crypto.randomInt(1, 90_000_000);
    const update = {
      update_id: updateId,
      callback_query: { data: 'a:gw_draw_now|g:42', from: { id: 77 } },
    };
    const receiptKey = k(['telegram', 'critical_update_receipt', updateId]);
    keys.add(receiptKey);
    const receiptClaims = await Promise.all(
      Array.from({ length: 10 }, () => claimCriticalTelegramUpdate(update, { client: redis, ttlSec: 120 }))
    );
    const winner = receiptClaims.find((x) => x.claimed === true);
    assert.ok(winner);
    assert.equal(receiptClaims.filter((x) => x.claimed === true).length, 1);
    assert.equal(receiptClaims.filter((x) => x.duplicate === true).length, 9);
    const finalized = await finalizeCriticalTelegramUpdate(winner, 'outcome_unknown', {
      client: redis,
      ttlSec: 120,
      errorCode: 'spine_ambiguous',
    });
    assert.equal(finalized.ok, true);
    assert.equal(finalized.status, 'outcome_unknown');
    const replayClaim = await claimCriticalTelegramUpdate(update, { client: redis, ttlSec: 120 });
    assert.equal(replayClaim.duplicate, true);
    assert.equal(replayClaim.existingStatus, 'outcome_unknown');

    // Execute the production admin rate-limit Lua script against real Redis.
    const rateSubject = `spine:${unique}`;
    const rateKey = k(['admin_web', 'auth_rl', 'login', sha256(rateSubject).slice(0, 32)]);
    keys.add(rateKey);
    const rateResults = [];
    for (let i = 0; i < 5; i++) {
      rateResults.push(await consumeAdminAuthRateLimit({
        scope: 'login',
        subject: rateSubject,
        limit: 3,
        windowSec: 120,
      }));
    }
    assert.deepEqual(rateResults.map((x) => x.allowed), [true, true, true, false, false]);
    assert.ok(rateResults.every((x) => Number(x.retryAfterSec) > 0));

    // Execute the production pending -> approved -> consumed Lua state machine.
    const challengeId = `spine_${crypto.randomBytes(8).toString('hex')}`;
    const verifier = crypto.randomBytes(24).toString('hex');
    const challengeKey = k(['admin_web', 'challenge', challengeId]);
    const auditKey = k(['admin_web', 'audit_recent']);
    keys.add(challengeKey);
    keys.add(auditKey);
    const browserVerifierHash = hmacSha256(
      process.env.ADMIN_WEB_SESSION_SECRET,
      `browser:${challengeId}:${verifier}`,
    );
    await redis.set(challengeKey, {
      id: challengeId,
      status: 'pending',
      browserVerifierHash,
      expiresAt: Date.now() + 120_000,
      approvedByTgId: 0,
      approvedAt: 0,
      fallbackCodeEnabled: false,
    }, { ex: 120 });

    const approvals = await Promise.all(
      Array.from({ length: 8 }, () => approveChallengeFromTelegram({
        challengeId,
        decision: 'approve',
        actorTgId: 77,
      }))
    );
    assert.equal(approvals.filter((x) => x.ok === true).length, 1);
    assert.equal(approvals.filter((x) => x.error === 'challenge_not_pending').length, 7);

    const req = { headers: { cookie: `collabka_admin_login_verifier=${encodeURIComponent(verifier)}` } };
    const exchanges = await Promise.all(
      Array.from({ length: 8 }, () => issueSession(req, buildRes(), challengeId))
    );
    assert.ok(exchanges.every((x) => x.ok === true));
    const sessionIds = new Set(exchanges.map((x) => String(x.sessionId)));
    assert.equal(sessionIds.size, 1);
    assert.equal(exchanges.filter((x) => x.reused === false).length, 1);
    assert.equal(exchanges.filter((x) => x.reused === true).length, 7);
    for (const sessionId of sessionIds) keys.add(k(['admin_web', 'session', sessionId]));

    return {
      ok: true,
      capability: 'redis',
      rawSetNxExactlyOnce: true,
      productionCriticalReceiptExactlyOnce: true,
      productionUnknownReceiptSuppressesReplay: true,
      productionAdminRateLimitAtomic: true,
      productionAdminApproveExactlyOnce: true,
      productionAdminSessionConsumeExactlyOnce: true,
    };
  } finally {
    if (keys.size) await redis.del(...keys).catch(() => {});
  }
}
