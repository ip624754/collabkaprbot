import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';

function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
    ended: false,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.ended = true; return this; },
    end(body) { this.body = body; this.ended = true; return this; },
  };
}

function makeStreamReq({ method = 'POST', headers = {}, body = '' } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.headers = headers;
  queueMicrotask(() => {
    if (body) req.emit('data', Buffer.from(body));
    req.emit('end');
  });
  return req;
}

async function proofWebhook() {
  process.env.NODE_ENV = 'test';
  process.env.APP_ENV = 'dev';
  process.env.BOT_TOKEN = 'test:token';
  process.env.BOT_USERNAME = 'collabka_test_bot';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
  process.env.UPSTASH_REDIS_REST_URL = 'https://example.invalid';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  process.env.WEBHOOK_SECRET_TOKEN = 'proof-secret';
  process.env.PUBLIC_BASE_URL = 'https://collabka.example';

  const mod = await import('../api/webhook.js?runtime-proof=583');
  const seen = [];
  let initCount = 0;
  mod.__setWebhookBotFactoryForTests(() => ({
    async init() { initCount += 1; },
    async handleUpdate(update) { seen.push(update); },
  }));

  const unauthorized = makeRes();
  await mod.default({ method: 'POST', headers: {}, body: { update_id: 1 } }, unauthorized);
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(unauthorized.body?.error, 'unauthorized');

  const callbackUpdate = {
    update_id: 583001,
    callback_query: {
      id: 'proof-callback',
      data: 'a:home',
      from: { id: 583, username: 'runtime_proof' },
      message: { chat: { id: 583 } },
    },
  };
  const ok = makeRes();
  await mod.default({
    method: 'POST',
    headers: { 'x-telegram-bot-api-secret-token': 'proof-secret' },
    body: callbackUpdate,
  }, ok);
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.body, { ok: true });
  assert.equal(initCount, 1);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].callback_query.data, 'a:home');
  mod.__resetWebhookTestHooks();
  return { unauthorized: true, callbackDelivered: true, botInitOnce: true };
}

async function proofRedisDegradation() {
  const code = `
    process.env.APP_ENV='dev';
    process.env.SIMULATE_REDIS_DOWN='1';
    process.env.UPSTASH_REDIS_REST_URL='https://example.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN='test';
    const { rateLimit } = await import('./src/lib/redis.js');
    const a = await rateLimit('proof:583', { limit: 2, windowSec: 60 });
    const b = await rateLimit('proof:583', { limit: 2, windowSec: 60 });
    const c = await rateLimit('proof:583', { limit: 2, windowSec: 60 });
    console.log(JSON.stringify({a,b,c}));
  `;
  const { spawnSync } = await import('node:child_process');
  const out = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 15000,
  });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  const line = out.stdout.trim().split(/\n/).at(-1);
  const parsed = JSON.parse(line);
  assert.equal(parsed.a.fallback, 'memory');
  assert.equal(parsed.b.fallback, 'memory');
  assert.equal(parsed.c.fallback, 'memory');
  assert.equal(parsed.a.allowed, true);
  assert.equal(parsed.c.allowed, false);
  return { fallback: 'memory', bounded: true, thirdRequestBlocked: true };
}

async function proofQStashConvergence() {
  process.env.PUBLIC_BASE_URL = 'https://collabka.example';
  const mod = await import('../api/qstash/ping.js?runtime-proof=583');
  const writes = [];
  let failWrites = true;
  const fakeRedis = {
    async set(key, value, options) {
      if (failWrites) throw new Error('simulated_redis_down');
      writes.push({ key, value, options });
      return 'OK';
    },
  };
  let verifies = 0;
  mod.__setQStashPingDepsForTests({
    redis: fakeRedis,
    verify: async ({ signature, body, url }) => {
      verifies += 1;
      assert.equal(signature, 'proof-signature');
      assert.ok(body.includes('nonce-583'));
      assert.equal(url, 'https://collabka.example/api/qstash/ping');
    },
  });

  const payload = JSON.stringify({ nonce: 'nonce-583', by_tg_id: 583 });
  const firstRes = makeRes();
  await mod.default(makeStreamReq({ headers: { 'upstash-signature': 'proof-signature' }, body: payload }), firstRes);
  assert.equal(firstRes.statusCode, 200);
  assert.equal(firstRes.body?.ok, true);
  assert.equal(writes.length, 0);

  failWrites = false;
  const secondRes = makeRes();
  await mod.default(makeStreamReq({ headers: { 'upstash-signature': 'proof-signature' }, body: payload }), secondRes);
  assert.equal(secondRes.statusCode, 200);
  assert.equal(secondRes.body?.nonce, 'nonce-583');
  assert.equal(verifies, 2);
  assert.equal(writes.length, 3);
  assert.ok(writes.some((x) => String(x.key).includes('last_nonce') && x.value === 'nonce-583'));
  mod.__resetQStashPingDepsForTests();
  return { firstAckDuringRedisFailure: true, secondAttemptConverged: true, breadcrumbs: writes.length };
}

const report = {
  step: 'STEP583',
  kind: 'bounded_local_runtime_proof',
  webhook: await proofWebhook(),
  redisDegradation: await proofRedisDegradation(),
  qstashDeliveryConvergence: await proofQStashConvergence(),
};
console.log(JSON.stringify(report, null, 2));
console.log('STEP583 Runtime Proof Spine: PASS');
