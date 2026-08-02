import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getStep590G3WorkerPaths,
  readMonetizationRetryWorkerSource,
  readOfficialPublishDeliverWorkerSource,
  readOfficialPublishVerifyWorkerSource,
  readQStashPingWorkerSource,
} from './lib/step590g3-source-reader.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const manifest = JSON.parse(read('docs/architecture/STEP590G3_MONETIZATION_OFFICIAL_PUBLISH_WORKER_MANIFEST.json'));
let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions += 1; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions += 1; };

check(manifest.step === 'STEP590G3', 'manifest step mismatch');
check(manifest.baseline.operatorCommit === 'e88ad931bf49c5bb9ebd55d134411d8aaf3a2e9a', 'baseline commit mismatch');
check(manifest.baseline.packageVersion === '1.3.35', 'baseline package mismatch');
check(manifest.targetPackageVersion === '1.3.36', 'target package mismatch');

const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
check(/^1\.3\.(?:3[6-9]|[4-9]\d|\d{3,})$/.test(pkg.version), 'package.json version must be >= 1.3.36');
equal(lock.version, pkg.version, 'package-lock version mismatch');
equal(lock.packages?.['']?.version, pkg.version, 'package-lock root version mismatch');

const expectedFacades = new Map([
  ['api/qstash/monetization-retry.js', "export { config, default } from '../../src/jobs/monetizationRetry/worker.js';"],
  ['api/qstash/official-publish-deliver.js', "export { config, default } from '../../src/jobs/officialPublish/deliverWorker.js';"],
  ['api/qstash/official-publish-verify.js', "export { config, default } from '../../src/jobs/officialPublish/verifyWorker.js';"],
]);
for (const [rel, expected] of expectedFacades) {
  const src = read(rel).trim();
  equal(src, expected, `compatibility façade drift: ${rel}`);
  check(src.split(/\r?\n/).length <= 2, `façade not thin: ${rel}`);
}
const pingFacade = read('api/qstash/ping.js');
check(pingFacade.split(/\r?\n/).length <= 8, 'ping façade not thin');
for (const token of ['__resetQStashPingDepsForTests', '__setQStashPingDepsForTests', 'config', 'default', "../../src/jobs/qstashPing/worker.js"]) {
  check(pingFacade.includes(token), `ping façade export missing: ${token}`);
}
for (const rel of manifest.facades.map((x) => x.path)) {
  const src = read(rel);
  for (const forbidden of ['qstashVerifySignature', 'redis.', 'deliverOfficialPublishReserved', 'processOrphanedAutohealBatch', 'async function handler']) {
    check(!src.includes(forbidden), `runtime leaked into façade ${rel}: ${forbidden}`);
  }
}

const paths = getStep590G3WorkerPaths();
equal(paths, {
  monetizationRetry: 'src/jobs/monetizationRetry/worker.js',
  officialPublishDeliver: 'src/jobs/officialPublish/deliverWorker.js',
  officialPublishVerify: 'src/jobs/officialPublish/verifyWorker.js',
  qstashPing: 'src/jobs/qstashPing/worker.js',
}, 'worker path registry drift');

for (const worker of manifest.workers) {
  const src = read(worker.path);
  check(src.split(/\r?\n/).length - 1 === worker.lines, `worker line count drift: ${worker.path}`);
  check(sha256(src) === worker.sha256, `worker hash drift: ${worker.path}`);
  check(src.includes('bodyParser: false'), `raw-body config missing: ${worker.path}`);
  check(src.includes('export default async function handler'), `default handler missing: ${worker.path}`);
}

const monetization = readMonetizationRetryWorkerSource(ROOT);
for (const token of [
  "getQStashDeliveryUrl('/api/qstash/monetization-retry')",
  'qstashVerifySignature({ signature, body: rawBody, url })',
  "if (action === 'brand_app_accept')",
  "if (action === 'wsp_contact_unlock')",
  "if (action === 'intro_open')",
  "if (action === 'orphaned_autoheal')",
  'acceptBrandApplicationWithCharge',
  'unlockWorkspaceContactsWithCredits',
  'getOrCreateBarterThreadWithCredits',
  'claimOrphanedMissingSessionPaymentsForAutoheal',
  '_validateStarsPaymentStrict',
  'applyPaymentFallbackNoSession',
  'await safeReleaseMonLock(lockKey, lockToken);',
  'deduplicationId: `mon:autoheal:${chain}:${nextDepth}`',
  "error: 'signature_missing'",
  "error: 'invalid_signature'",
]) check(monetization.includes(token), `monetization invariant missing: ${token}`);

const deliver = readOfficialPublishDeliverWorkerSource(ROOT);
for (const token of [
  "getQStashDeliveryUrl('/api/qstash/official-publish-deliver')",
  'qstashVerifySignature({ signature, body: rawBody, url })',
  'deliverOfficialPublishReserved(bot.api, offerId, { prevStatus })',
  'const reserveEpoch = parseReserveEpoch(payload);',
  'if (out && out.locked && attempt < maxAttempts)',
  'deduplicationId: dedupId',
  "reason: 'qstash_reschedule_failed'",
  "error: 'signature_missing'",
]) check(deliver.includes(token), `official deliver invariant missing: ${token}`);

const verify = readOfficialPublishVerifyWorkerSource(ROOT);
for (const token of [
  "getQStashDeliveryUrl('/api/qstash/official-publish-verify')",
  'qstashVerifySignature({ signature, body: rawBody, url })',
  "verifyOfficialPublishState({ ...payload, mode: 'worker' })",
  "result?.reason === 'too_fresh' && result?.should_reschedule",
  'deduplicationId: dedupId',
  "reason: 'qstash_reschedule_failed'",
  "error: 'signature_missing'",
]) check(verify.includes(token), `official verify invariant missing: ${token}`);

const ping = readQStashPingWorkerSource(ROOT);
for (const token of [
  '__setQStashPingDepsForTests',
  '__resetQStashPingDepsForTests',
  "getQStashDeliveryUrl('/api/qstash/ping')",
  'await verifySignature({ signature, body: rawBody, url })',
  "k(['qstash', 'ping', 'last_at'])",
  "error: 'signature_missing'",
]) check(ping.includes(token), `QStash ping invariant missing: ${token}`);

for (const [key, value] of Object.entries(manifest.invariants)) equal(value, 0, `invariant drift: ${key}`);
console.log(`✅ STEP590G3 monetization/official-publish worker decomposition OK (${assertions} assertions)`);
