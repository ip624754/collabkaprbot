import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Compatibility smoke: tier=fast now resolves to the public readiness contract.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

process.env.APP_ENV = process.env.APP_ENV || 'staging';
process.env.SIMULATE_REDIS_DOWN = process.env.SIMULATE_REDIS_DOWN || '1';
process.env.UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || 'https://example.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || 'smoke-token';
process.env.PAYMENTS_PAYLOAD_HMAC_KEY = process.env.PAYMENTS_PAYLOAD_HMAC_KEY || 'x'.repeat(40);

const { CFG } = await import(pathToFileURL(path.join(ROOT, 'src', 'lib', 'config.js')).href);
if (['prod', 'production'].includes(String(CFG.APP_ENV || '').trim().toLowerCase())) {
  throw new Error('Refusing to run smoke-health-fast-contract in production');
}
const { default: handler } = await import(pathToFileURL(path.join(ROOT, 'api', 'health.js')).href);

const res = {
  headers: {}, statusCode: 200, body: null,
  setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
  status(code) { this.statusCode = code; return this; },
  json(obj) { this.body = obj; return this; },
  send(obj) { this.body = obj; return this; },
  end(obj) { this.body = obj; return this; },
};

await handler({ query: { tier: 'fast' }, url: '/api/health?tier=fast' }, res);
assert.equal(res.statusCode, 503, 'degraded readiness must return 503');
assert.equal(res.headers['x-health-view'], 'readiness', 'tier=fast maps to readiness');
assert.equal(res.headers['x-health-tier'], 'fast', 'compatibility header retained');
assert.equal(res.body.check, 'readiness', 'readiness check marker');
assert.equal(res.body.ok, false, 'NO_GO means ok=false');
assert.ok(Array.isArray(res.body.reason_codes), 'reason codes required');
assert.equal(Object.prototype.hasOwnProperty.call(res.body, 'operator_fast_path'), false, 'internal operator contract must not be public');
assert.equal(Object.prototype.hasOwnProperty.call(res.body, 'database'), false, 'DB config must not be public');
assert.equal(Object.prototype.hasOwnProperty.call(res.body, 'ops'), false, 'OPS details must not be public');

console.log('✅ health fast/readiness compatibility contract PASS');
