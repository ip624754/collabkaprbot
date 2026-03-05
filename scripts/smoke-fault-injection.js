import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Smoke (staging/dev only): verify that SIMULATE_REDIS_DOWN forces Redis calls to fail,
// while /api/health remains fail-open (never throws) and reports NO_GO reasons.
//
// Usage (staging):
//   APP_ENV=staging SIMULATE_REDIS_DOWN=1 node scripts/smoke-fault-injection.js
//
// Safety: this script refuses to run in prod/prodution APP_ENV.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Ensure config loads with sane defaults (no real secrets required).
process.env.APP_ENV = process.env.APP_ENV || 'staging';
process.env.SIMULATE_REDIS_DOWN = process.env.SIMULATE_REDIS_DOWN || '1';
process.env.UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || 'https://example.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || 'smoke-token';

const { CFG } = await import(pathToFileURL(path.join(ROOT, 'src', 'lib', 'config.js')).href);

const env = String(CFG.APP_ENV || '').trim().toLowerCase();
if (env === 'prod' || env === 'production') {
  throw new Error('Refusing to run smoke-fault-injection in prod/prodution APP_ENV');
}

const { redis, k } = await import(pathToFileURL(path.join(ROOT, 'src', 'lib', 'redis.js')).href);

assert.equal(redis.__simulated_down, true, 'Expected redis fault injection to be enabled (__simulated_down=true)');

await assert.rejects(
  () => redis.get(k(['smoke', 'redis_down'])),
  (e) => String(e?.code || '') === 'SIMULATED_REDIS_DOWN',
  'Expected Redis call to fail with code=SIMULATED_REDIS_DOWN'
);

// Verify /api/health remains fail-open and surfaces NO_GO.
const healthMod = await import(pathToFileURL(path.join(ROOT, 'api', 'health.js')).href);
const handler = healthMod.default;

function makeResStub() {
  const out = {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    send(obj) { this.body = obj; return this; }
  };
  return out;
}

const res = makeResStub();
await handler({}, res);

assert.ok(res.body && res.body.ok === true, 'Expected /api/health ok=true');
assert.equal(res.body.system_status, 'NO_GO', 'Expected system_status=NO_GO under simulated Redis down');
assert.ok(Array.isArray(res.body.no_go_reasons) && res.body.no_go_reasons.length > 0, 'Expected non-empty no_go_reasons');
assert.equal(res.body.redis.read_ok, false, 'Expected redis.read_ok=false');
assert.equal(res.body.redis.write_ok, false, 'Expected redis.write_ok=false');

console.log('OK: fault injection is active, Redis calls fail, and /api/health stays fail-open with NO_GO reasons.');
