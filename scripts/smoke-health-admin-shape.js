import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Smoke (staging/dev only): verify that /api/health keeps the operator-facing JSON contract
// even when Redis is degraded. This catches accidental field removals/renames used by
// dashboards, admin ops triage, and release checks.
//
// Usage (staging):
//   APP_ENV=staging SIMULATE_REDIS_DOWN=1 node scripts/smoke-health-admin-shape.js
//
// Safety: this script refuses to run in prod/production APP_ENV.

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
  throw new Error('Refusing to run smoke-health-admin-shape in prod/production APP_ENV');
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
await handler({}, res);

assert.equal(res.statusCode, 200, 'Expected /api/health to return HTTP 200');
assert.ok(res.body && typeof res.body === 'object', 'Expected JSON body from /api/health');
assert.equal(res.body.ok, true, 'Expected /api/health ok=true');
assert.equal(res.body.system_status, 'NO_GO', 'Expected system_status=NO_GO under degraded Redis smoke');
assert.ok(Array.isArray(res.body.no_go_reasons), 'Expected no_go_reasons[] array');
assert.ok(res.body.no_go_reasons.length > 0, 'Expected at least one NO_GO reason');

const redisReadReason = res.body.no_go_reasons.find((r) => r && r.code === 'redis_read_not_ok');
assert.ok(redisReadReason, 'Expected redis_read_not_ok reason');
assert.equal(redisReadReason.severity, 'P0', 'Expected redis_read_not_ok severity=P0');
assert.equal(typeof redisReadReason.hint, 'string', 'Expected redis_read_not_ok hint string');
assert.ok(redisReadReason.hint.length > 0, 'Expected redis_read_not_ok hint to be non-empty');

assert.ok(res.body.database && typeof res.body.database === 'object', 'Expected database config block');
assert.equal(Object.prototype.hasOwnProperty.call(res.body.database, 'pooled_url'), true, 'Expected database.pooled_url');
assert.equal(Object.prototype.hasOwnProperty.call(res.body.database, 'connect_retry'), true, 'Expected database.connect_retry');
assert.ok(Array.isArray(res.body.database.warnings), 'Expected database.warnings[]');
assert.ok(Array.isArray(res.body.system_warnings), 'Expected system_warnings[]');
assert.equal(Object.prototype.hasOwnProperty.call(res.body.database, 'hostname'), false, 'Health must not expose DB host');

assert.ok(res.body.ops && typeof res.body.ops === 'object', 'Expected ops object');
assert.ok(Object.prototype.hasOwnProperty.call(res.body.ops, 'digest_preview'), 'Expected ops.digest_preview key');
assert.ok(Object.prototype.hasOwnProperty.call(res.body.ops, 'pending'), 'Expected ops.pending key');

assert.ok(res.body.broadcast && typeof res.body.broadcast === 'object', 'Expected broadcast object');
assert.ok(Object.prototype.hasOwnProperty.call(res.body.broadcast, 'pending_deliveries'), 'Expected broadcast.pending_deliveries key');
assert.ok(Object.prototype.hasOwnProperty.call(res.body.broadcast, 'hard_skip'), 'Expected broadcast.hard_skip key');
assert.ok(Object.prototype.hasOwnProperty.call(res.body.broadcast, 'db_overload'), 'Expected broadcast.db_overload key');
assert.ok(Object.prototype.hasOwnProperty.call(res.body.broadcast, 'tick_deferred_redis'), 'Expected broadcast.tick_deferred_redis key');

assert.ok(res.body.qstash && typeof res.body.qstash === 'object', 'Expected qstash object');
assert.ok(Object.prototype.hasOwnProperty.call(res.body.qstash, 'reschedule_failed'), 'Expected qstash.reschedule_failed key');
assert.ok(Object.prototype.hasOwnProperty.call(res.body.qstash, 'official_publish_stuck'), 'Expected qstash.official_publish_stuck key');

assert.ok(res.body.payments && typeof res.body.payments === 'object', 'Expected payments object');
assert.ok(Object.prototype.hasOwnProperty.call(res.body.payments, 'fallback_apply_effective'), 'Expected payments.fallback_apply_effective key');
assert.ok(Object.prototype.hasOwnProperty.call(res.body.payments, 'payload_hmac_minlen_ok'), 'Expected payments.payload_hmac_minlen_ok key');

console.log('✅ smoke health/admin JSON shape OK');
