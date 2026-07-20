import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Staging/dev runtime smoke: public readiness must be minimal and fail with 503
// when a required dependency is unavailable. Liveness remains 200.
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
if (env === 'prod' || env === 'production') throw new Error('Refusing to run health smoke in production');

const { default: handler } = await import(pathToFileURL(path.join(ROOT, 'api', 'health.js')).href);

function makeResStub() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    send(obj) { this.body = obj; return this; },
    end(obj) { this.body = obj; return this; },
  };
}

const readiness = makeResStub();
await handler({ url: '/api/health' }, readiness);
assert.equal(readiness.statusCode, 503, 'NO_GO readiness must return HTTP 503');
assert.equal(readiness.headers['x-health-view'], 'readiness', 'readiness header');
assert.equal(readiness.body.ok, false, 'NO_GO must expose ok=false');
assert.equal(readiness.body.status, 'not_ready', 'readiness status');
assert.equal(readiness.body.system_status, 'NO_GO', 'system status');
assert.ok(Array.isArray(readiness.body.reason_codes), 'reason_codes required');
assert.ok(readiness.body.reason_codes.includes('redis_read_not_ok'), 'Redis reason required');
assert.ok(readiness.body.checks && typeof readiness.body.checks === 'object', 'minimal checks required');
for (const forbidden of ['database', 'redis', 'ops', 'payments', 'qstash', 'broadcast', 'cron', 'audit', 'ref', 'mon', 'no_go_reasons', 'env']) {
  assert.equal(Object.prototype.hasOwnProperty.call(readiness.body, forbidden), false, `public readiness must omit ${forbidden}`);
}

const liveness = makeResStub();
await handler({ url: '/api/health?mode=liveness' }, liveness);
assert.equal(liveness.statusCode, 200, 'liveness must return 200');
assert.equal(liveness.headers['x-health-view'], 'liveness', 'liveness header');
assert.equal(liveness.body.ok, true, 'liveness ok');
assert.equal(liveness.body.status, 'alive', 'liveness status');
assert.equal(Object.prototype.hasOwnProperty.call(liveness.body, 'checks'), false, 'liveness must not probe dependencies');

console.log('✅ health public readiness/liveness runtime shape PASS');
