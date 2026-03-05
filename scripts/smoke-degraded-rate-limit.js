import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Smoke: verify that rateLimit() falls back to in-memory mode when Redis is degraded,
// and that the fallback uses a stricter limit (÷ RATE_LIMIT_FALLBACK_LIMIT_DIV).
// This test does NOT require real Upstash credentials.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Ensure Redis client construction does not fail due to missing env.
process.env.APP_ENV = process.env.APP_ENV || 'test';
process.env.UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || 'https://example.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || 'smoke-token';
process.env.RATE_LIMIT_FALLBACK_LIMIT_DIV = process.env.RATE_LIMIT_FALLBACK_LIMIT_DIV || '5';

// Force all Redis HTTP calls to fail instantly (no network dependency).
// @upstash/redis uses global fetch in Node >=18.
globalThis.fetch = async () => {
  throw new Error('smoke: simulated redis fetch failure');
};

const redisModUrl = pathToFileURL(path.join(ROOT, 'src', 'lib', 'redis.js')).href;
const { rateLimit } = await import(redisModUrl);

assert.equal(typeof rateLimit, 'function', 'rateLimit must be a function');

const originalLimit = 10;
const windowSec = 60;

const divRaw = Number(process.env.RATE_LIMIT_FALLBACK_LIMIT_DIV || 5);
const div = Number.isFinite(divRaw) && divRaw > 0 ? Math.floor(divRaw) : 5;
const clampedDiv = Math.max(2, Math.min(20, div));
const expectedFallbackLimit = Math.max(1, Math.floor(originalLimit / clampedDiv));

assert.ok(
  expectedFallbackLimit < originalLimit,
  `expected fallback limit to be stricter than original (${expectedFallbackLimit} < ${originalLimit})`
);

const key = `smoke:rl:degraded:${Date.now()}`;

let last = null;
for (let i = 0; i < expectedFallbackLimit + 1; i++) {
  // eslint-disable-next-line no-await-in-loop
  last = await rateLimit(key, { limit: originalLimit, windowSec });
  assert.equal(last.fallback, 'memory', 'expected in-memory fallback when Redis is degraded');
  assert.equal(last.limit, expectedFallbackLimit, 'expected stricter fallback limit');
}

assert.ok(last, 'expected a result');
assert.equal(last.allowed, false, 'expected limiter to block after exceeding fallback limit');
assert.equal(last.ok, false, 'expected ok=false when blocked');

// eslint-disable-next-line no-console
console.log('✅ smoke degraded rate-limit OK');
