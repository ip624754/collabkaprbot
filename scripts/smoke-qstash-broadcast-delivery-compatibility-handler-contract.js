import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const facade = read('api/qstash/broadcast-deliver.js');
const index = read('src/jobs/broadcastDelivery/index.js');

assert.ok(facade.includes('bodyParser: false'), 'route must preserve raw-body parser contract');
assert.ok(facade.includes("export { default } from '../../src/jobs/broadcastDelivery/index.js';"), 'route must re-export bounded worker');
assert.ok(!facade.includes('async function handler'), 'delivery implementation leaked into API façade');
assert.ok(!facade.includes('qstashVerifySignature'), 'signature runtime leaked into API façade');
assert.ok(!facade.includes('redis.'), 'Redis runtime leaked into API façade');
assert.equal(index.trim(), "export { default } from './delivery.js';", 'bounded worker index drift');

for (const file of [
  'cooldown.js',
  'dbOverload.js',
  'delivery.js',
  'hardSkip.js',
  'payload.js',
  'quarantine.js',
  'receipt.js',
]) assert.ok(fs.existsSync(path.join(ROOT, 'src/jobs/broadcastDelivery', file)), `bounded module missing: ${file}`);

console.log('✅ STEP590G2 QStash broadcast compatibility handler contract OK');
