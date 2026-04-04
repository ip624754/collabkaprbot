import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const cron = read('src/bot/cron.js');
assert.ok(cron.includes('const qstashConfig = getQStashConfigSnapshot();'), 'fanout gate must use shared QStash config snapshot');
assert.ok(cron.includes("if (!qstashConfig.publishConfigured) return { enabled: false, redis_ok: true, forced_off: true, reason: 'qstash_publish_missing'"), 'fanout gate must fail closed when publish config is missing');
assert.ok(cron.includes("if (!qstashConfig.verifyConfigured) return { enabled: false, redis_ok: true, forced_off: true, reason: 'qstash_verify_missing'"), 'fanout gate must fail closed when verify config is missing');

const qstash = read('src/lib/qstash.js');
for (const token of [
  'export function getQStashConfigSnapshot()',
  'publishConfigured',
  'verifyConfigured',
  'nextSigningKeyConfigured',
  'fullyConfigured',
  'partiallyConfigured',
]) {
  assert.ok(qstash.includes(token), `QStash helper contract must include ${token}`);
}

console.log('✅ smoke QStash fanout gate contract OK');
