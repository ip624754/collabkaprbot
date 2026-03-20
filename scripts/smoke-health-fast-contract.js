import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Smoke (staging/dev only): verify that /api/health?tier=fast keeps
// the narrow operator summary contract and skips the heavy drill-down sections.
// Usage:
//   APP_ENV=staging SIMULATE_REDIS_DOWN=1 node scripts/smoke-health-fast-contract.js

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

process.env.APP_ENV = process.env.APP_ENV || 'staging';
process.env.SIMULATE_REDIS_DOWN = process.env.SIMULATE_REDIS_DOWN || '1';
process.env.UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || 'https://example.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || 'smoke-token';
process.env.PAYMENTS_PAYLOAD_HMAC_KEY = process.env.PAYMENTS_PAYLOAD_HMAC_KEY || 'x'.repeat(40);

const { CFG } = await import(pathToFileURL(path.join(ROOT, 'src', 'lib', 'config.js')).href);
const env = String(CFG.APP_ENV || '').trim().toLowerCase();
if (env === 'prod' || env === 'production') {
  throw new Error('Refusing to run smoke-health-fast-contract in prod/production APP_ENV');
}

const healthMod = await import(pathToFileURL(path.join(ROOT, 'api', 'health.js')).href);
const handler = healthMod.default;

function makeResStub() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    send(obj) { this.body = obj; return this; },
  };
}

const res = makeResStub();
await handler({ query: { tier: 'fast' }, url: '/api/health?tier=fast' }, res);

assert.equal(res.statusCode, 200, 'Expected /api/health?tier=fast to return HTTP 200');
assert.equal(res.headers['x-health-tier'], 'fast', 'Expected X-Health-Tier=fast');
assert.ok(res.body && typeof res.body === 'object', 'Expected JSON body');
assert.equal(res.body.ok, true, 'Expected ok=true');
assert.equal(res.body.health_tier, 'fast', 'Expected health_tier=fast');
assert.equal(res.body.system_status, 'NO_GO', 'Expected NO_GO under degraded Redis smoke');
assert.ok(Array.isArray(res.body.no_go_reasons), 'Expected no_go_reasons[]');
assert.ok(res.body.operator_fast_path && typeof res.body.operator_fast_path === 'object', 'Expected operator_fast_path block');
assert.equal(res.body.operator_fast_path.full_tier_available, true, 'Expected full_tier_available=true');
assert.ok(Array.isArray(res.body.operator_fast_path.omitted_sections), 'Expected omitted_sections[]');
assert.ok(res.body.operator_fast_path.omitted_sections.includes('broadcast'), 'Expected broadcast to be omitted in fast tier');
assert.ok(res.body.operator_fast_path.omitted_sections.includes('qstash'), 'Expected qstash to be omitted in fast tier');

assert.ok(res.body.redis && typeof res.body.redis === 'object', 'Expected redis block');
assert.ok(res.body.ops && typeof res.body.ops === 'object', 'Expected ops block');
assert.ok(res.body.payments && typeof res.body.payments === 'object', 'Expected payments block');
assert.ok(Object.prototype.hasOwnProperty.call(res.body.ops, 'digest_preview'), 'Expected ops.digest_preview key in fast tier');
assert.ok(Object.prototype.hasOwnProperty.call(res.body.payments, 'fallback_apply_effective'), 'Expected payments.fallback_apply_effective key');

assert.equal(Object.prototype.hasOwnProperty.call(res.body, 'broadcast'), false, 'Fast tier must omit broadcast block');
assert.equal(Object.prototype.hasOwnProperty.call(res.body, 'qstash'), false, 'Fast tier must omit qstash block');
assert.equal(Object.prototype.hasOwnProperty.call(res.body, 'cron'), false, 'Fast tier must omit cron block');
assert.equal(Object.prototype.hasOwnProperty.call(res.body, 'audit'), false, 'Fast tier must omit audit block');
assert.equal(Object.prototype.hasOwnProperty.call(res.body, 'ref'), false, 'Fast tier must omit ref block');
assert.equal(Object.prototype.hasOwnProperty.call(res.body, 'mon'), false, 'Fast tier must omit mon block');

console.log('✅ smoke health fast-tier contract OK');
