import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getBroadcastDeliveryImplementationFiles,
  readBroadcastDeliveryImplementationSource,
  readBroadcastDeliveryOrchestrationSource,
} from './lib/broadcast-delivery-source-reader.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const manifest = JSON.parse(read('docs/architecture/STEP590G2_BROADCAST_DELIVERY_MODULE_MANIFEST.json'));
let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions += 1; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions += 1; };

check(manifest.step === 'STEP590G2', 'manifest step mismatch');
check(manifest.baseline.operatorCommit === '2fb27008e7f70ed194923df687dd68e6845f2521', 'baseline commit mismatch');
check(manifest.baseline.packageVersion === '1.3.34', 'baseline package mismatch');
check(manifest.targetPackageVersion === '1.3.35', 'target package mismatch');
check(manifest.baseline.routeLineCount === 923, 'baseline route line count drift');
check(manifest.baseline.routeSha256 === 'c084ef7af005e7058d4618fa01b51bf4515d17055dd063b6dd0e9ae29478033d', 'baseline route hash drift');

const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const versionParts = (value) => String(value || '').split('.').map((part) => Number(part) || 0);
const versionAtLeast = (actual, minimum) => {
  const a = versionParts(actual);
  const b = versionParts(minimum);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return true;
};
equal(pkg.version, lock.version, 'package.json/package-lock version mismatch');
equal(pkg.version, lock.packages?.['']?.version, 'package-lock root package mismatch');
check(versionAtLeast(pkg.version, manifest.targetPackageVersion), 'current package version predates STEP590G2 target');

const facade = read(manifest.facadePath);
check(facade.split(/\r?\n/).length <= 12, 'QStash broadcast route façade is not thin');
check(facade.includes('bodyParser: false'), 'raw-body route config missing');
check(facade.includes("export { default } from '../../src/jobs/broadcastDelivery/index.js';"), 'compatibility handler linkage missing');
for (const forbidden of ['qstashVerifySignature', 'claimBroadcastDelivery', 'sendBroadcastMessage', 'redis.', 'db.']) {
  check(!facade.includes(forbidden), `runtime leaked into route façade: ${forbidden}`);
}

const index = read(manifest.indexPath);
check(index.trim() === "export { default } from './delivery.js';", 'bounded worker index contract drift');

const expectedFiles = manifest.modules.map((m) => m.file);
equal(getBroadcastDeliveryImplementationFiles(), expectedFiles, 'source-reader module order drift');
check(manifest.modules.length === 7, 'expected seven bounded implementation modules');
for (const mod of manifest.modules) {
  const source = read(mod.file);
  check(source.length > 0, `bounded module empty: ${mod.file}`);
  check(sha256(source) === mod.sha256, `bounded module hash drift: ${mod.file}`);
}

const allOwnedSymbols = manifest.modules.flatMap((mod) => mod.ownedSymbols || []);
check(new Set(allOwnedSymbols).size === allOwnedSymbols.length, 'bounded symbol ownership must be unique');
for (const mod of manifest.modules) {
  const source = read(mod.file);
  for (const symbol of mod.ownedSymbols || []) {
    check(new RegExp(String.raw`\b${symbol}\b`).test(source), `owned symbol missing from ${mod.file}: ${symbol}`);
  }
}

const implementation = readBroadcastDeliveryImplementationSource(ROOT);
const delivery = readBroadcastDeliveryOrchestrationSource(ROOT);
for (const token of [
  "getQStashDeliveryUrl('/api/qstash/broadcast-deliver')",
  'qstashVerifySignature({ signature, body: rawBody, url })',
  "error: 'signature_missing'",
  "error: 'invalid_signature'",
  "error: 'qstash_disabled'",
  "error: 'bad_json'",
  "error: 'bad_payload'",
  'claimBroadcastDelivery(broadcastId, userId, 60)',
  'persistBroadcastSentOrUnknown',
  'persistBroadcastRejectedOrUnknown',
  'persistBroadcastUnknown',
  'automatic_resend: false',
  'messageIds: outcome.messageIds || []',
  "dedupId = `b:${broadcastId}:u:${userId}:a:${attempt + 1}`",
  "timeout: '20s'",
  "reason: 'broadcast_delivery_unknown'",
  "reason: 'qstash_bc_deliver_failed'",
]) check(implementation.includes(token), `critical delivery token missing: ${token}`);

const idxLocalFuse = delivery.indexOf('const localFuseUntilMs = getLocalDbOverloadFuseUntilMs();');
const idxRedisFuse = delivery.indexOf('const v = await redis.get(dbOverloadFuseKey());');
const idxCooldown = delivery.indexOf('const cdMs0 = await getCooldownUntilFast(broadcastId);');
const idxDbRead = delivery.indexOf('bcRow = await db.getBroadcast(broadcastId);');
check(idxLocalFuse >= 0, 'local DB fuse precheck missing');
check(idxRedisFuse > idxLocalFuse, 'Redis fuse must follow local fuse');
check(idxCooldown > idxRedisFuse, 'cooldown check must follow DB overload fuses');
check(idxDbRead > idxCooldown, 'DB read must remain after fuse/cooldown prechecks');

const dbOverload = read('src/jobs/broadcastDelivery/dbOverload.js');
for (const token of [
  "setHeader('Retry-After'",
  "setHeader('Upstash-Retry-After'",
  'res.status(429).json({',
  'retry_after_sec: sec',
  'base_backoff_sec: baseSec',
  'jitter_sec: jitterSec',
  'armLocalDbOverloadFuse();',
  "local_fuse: Boolean(localFuse)",
]) check(dbOverload.includes(token), `DB overload invariant missing: ${token}`);

const quarantine = read('src/jobs/broadcastDelivery/quarantine.js');
for (const token of [
  'incrWithExpireOnFirst(key, 24 * 60 * 60)',
  "redis.call('SADD'",
  "redis.call('EXPIRE'",
  "return redis.call('SCARD'",
]) check(quarantine.includes(token), `quarantine invariant missing: ${token}`);
check(!/await redis\.sadd\([\s\S]*?await redis\.expire\(/.test(quarantine), 'split SADD/EXPIRE regression');

const hardSkip = read('src/jobs/broadcastDelivery/hardSkip.js');
for (const token of [
  'getBroadcastHardSkipReason(tgId)',
  'db.logBroadcastBlocked',
  'resetBroadcastQuarantineCount',
  "via: 'qstash'",
  "reason: 'hard_skip'",
]) check(hardSkip.includes(token), `hard-skip invariant missing: ${token}`);

check(manifest.invariants.newApiRoutes === 0, 'new API route invariant drift');
check(manifest.invariants.newEnv === 0, 'new ENV invariant drift');
check(manifest.invariants.newMigrations === 0, 'new migration invariant drift');
check(manifest.invariants.functionBudgetChange === 0, 'function budget invariant drift');

console.log(`✅ STEP590G2 QStash broadcast delivery decomposition tests OK (${assertions} assertions)`);
