import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readCronImplementationSource } from './lib/cron-source-reader.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const runtime = read('src/lib/adminWeb/runtime.js');
const health = read('api/health.js');
const cron = readCronImplementationSource(ROOT);

for (const token of [
  "k(['ops', 'reasons', 'qstash_reschedule_failed', 'd', day])",
  "k(['ops', 'reasons', 'qstash_reschedule_failed', 'last_at'])",
  "k(['ops', 'reasons', 'qstash_reschedule_failed', 'last_where'])",
  "k(['ops', 'reasons', 'qstash_reschedule_failed', 'last_payload'])",
]) {
  assert.ok(runtime.includes(token), `runtime parity must include ${token}`);
  assert.ok(health.includes(token), `health parity must include ${token}`);
}

const config = read('src/lib/config.js');
for (const token of [
  "QSTASH_URL: process.env.QSTASH_URL || ''",
  "QSTASH_TOKEN: process.env.QSTASH_TOKEN || ''",
  "QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY || ''",
  "QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY || ''",
]) {
  assert.ok(config.includes(token), `config parity must expose ${token}`);
}

console.log('✅ smoke admin-web runtime/health parity contract OK');


for (const token of [
  'publish_configured',
  'verify_configured',
  'fully_configured',
  'partially_configured',
  'status',
]) {
  assert.ok(health.includes(token), `health parity must expose qstash config ${token}`);
}

for (const token of [
  "reason: 'qstash_publish_missing'",
  "reason: 'qstash_verify_missing'",
  'getQStashConfigSnapshot()',
]) {
  assert.ok(cron.includes(token), `fanout parity must include ${token}`);
}
