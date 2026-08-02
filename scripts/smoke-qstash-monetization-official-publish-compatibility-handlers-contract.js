import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const facades = [
  ['api/qstash/monetization-retry.js', '../../src/jobs/monetizationRetry/worker.js'],
  ['api/qstash/official-publish-deliver.js', '../../src/jobs/officialPublish/deliverWorker.js'],
  ['api/qstash/official-publish-verify.js', '../../src/jobs/officialPublish/verifyWorker.js'],
  ['api/qstash/ping.js', '../../src/jobs/qstashPing/worker.js'],
];
for (const [rel, target] of facades) {
  const src = read(rel);
  assert.ok(src.includes(target), `${rel}: worker linkage missing`);
  assert.ok(!src.includes('qstashVerifySignature'), `${rel}: signature runtime leaked into façade`);
  assert.ok(!src.includes('readRawBody'), `${rel}: raw-body implementation leaked into façade`);
  assert.ok(!src.includes('redis.'), `${rel}: Redis runtime leaked into façade`);
}
for (const rel of [
  'src/jobs/monetizationRetry/worker.js',
  'src/jobs/officialPublish/deliverWorker.js',
  'src/jobs/officialPublish/verifyWorker.js',
  'src/jobs/qstashPing/worker.js',
]) assert.ok(fs.existsSync(path.join(ROOT, rel)), `worker missing: ${rel}`);
console.log('✅ STEP590G3 QStash compatibility handlers contract OK');
