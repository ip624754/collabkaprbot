#!/usr/bin/env node
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { normalizeTarget, assertTargetAck, evaluateHealth, runAcceptance } from './staging-runtime-acceptance.js';

assert.equal(normalizeTarget('https://preview.example.test/path?q=1'), 'https://preview.example.test');
assert.throws(() => normalizeTarget('http://preview.example.test'), /target_must_use_https/);
assert.doesNotThrow(() => assertTargetAck('https://x.test', 'https://x.test'));
assert.throws(() => assertTargetAck('https://x.test', 'https://y.test'), /target_ack_mismatch/);

const goodHealth = {
  ok: true,
  system_status: 'GO',
  no_go_reasons: [],
  redis: { read_ok: true, write_ok: true },
  payments: { payload_hmac_minlen_ok: true, fallback_apply_effective: false },
  qstash: { config: { fully_configured: true }, reschedule_failed: { today_count: 0 }, official_publish_stuck: { today_count: 0 }, ping: { last_at: null, last_nonce: null } },
};
assert.equal(evaluateHealth(goodHealth).pass, true);
assert.equal(evaluateHealth({ ...goodHealth, system_status: 'NO_GO' }).pass, false);

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.url === '/api/health') return res.end(JSON.stringify(goodHealth));
  if (req.url === '/api/webhook' && req.method === 'GET') { res.statusCode = 405; return res.end(JSON.stringify({})); }
  if (req.url === '/api/webhook' && req.method === 'POST') { res.statusCode = 401; return res.end(JSON.stringify({ ok: false, error: 'unauthorized' })); }
  if (req.url === '/api/qstash/ping' && req.method === 'POST') { res.statusCode = 401; return res.end(JSON.stringify({ ok: false, error: 'signature_missing' })); }
  res.statusCode = 404; res.end(JSON.stringify({ error: 'not_found' }));
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const { port } = server.address();
const origin = `http://127.0.0.1:${port}`;
try {
  const report = await runAcceptance({ STAGING_BASE_URL: origin, ACCEPTANCE_TARGET_ACK: origin });
  assert.equal(report.status, 'PASS');
  assert.equal(report.checks.length, 5);
  assert.ok(report.checks.every((x) => x.pass));
} finally {
  server.close();
  await once(server, 'close');
}
console.log('[STEP584] staging runtime acceptance contract PASS');
