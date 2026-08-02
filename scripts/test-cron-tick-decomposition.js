import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/architecture/STEP590G1_CRON_EXPORT_MANIFEST.json'), 'utf8'));
let assertions = 0;

function assert(condition, message) {
  assertions += 1;
  if (!condition) throw new Error(message);
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function extractMovedBody(source, name) {
  const begin = `// BEGIN MOVED CRON BODY: ${name}\n`;
  const end = `\n// END MOVED CRON BODY: ${name}`;
  const start = source.indexOf(begin);
  const finish = source.indexOf(end, start + begin.length);
  assert(start >= 0, `${name}: moved-body begin marker missing`);
  assert(finish > start, `${name}: moved-body end marker missing`);
  return source.slice(start + begin.length, finish);
}
function namedReExports(source) {
  const out = [];
  for (const match of source.matchAll(/export\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]+['"]/g)) {
    for (const item of match[1].split(',')) {
      const clean = item.trim();
      if (!clean) continue;
      out.push(clean.split(/\s+as\s+/).at(-1).trim());
    }
  }
  return out;
}

assert(manifest.step === 'STEP590G1', 'manifest step mismatch');
assert(manifest.baseline.operatorCommit === '2226269', 'baseline commit mismatch');
assert(manifest.baseline.packageVersion === '1.3.33', 'baseline package mismatch');
assert(manifest.targetPackageVersion === '1.3.34', 'target package mismatch');
assert(manifest.publicExportCount === 12, 'cron public export count must remain 12');
assert(manifest.routerJobCount === 4, 'cron router job count must remain 4');
assert(manifest.modules.length === 5, 'expected five bounded job modules');
assert(new Set(manifest.publicExports).size === 12, 'public cron exports must be unique');

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
assert(pkg.version === lock.version, 'package.json/package-lock version mismatch');
assert(pkg.version === lock.packages?.['']?.version, 'package-lock packages root version mismatch');
assert(versionAtLeast(pkg.version, manifest.targetPackageVersion), 'current package version predates STEP590G1 target');

const facade = read(manifest.facadePath);
assert(facade.split(/\r?\n/).length <= 24, 'cron compatibility façade is not thin');
assert(!facade.includes('acquireLock('), 'lock runtime leaked into façade');
assert(!facade.includes('pool.query'), 'DB execution leaked into façade');
assert(!facade.includes('sendMessage('), 'Telegram execution leaked into façade');
assert(JSON.stringify(namedReExports(facade)) === JSON.stringify(manifest.publicExports), 'facade 12/12 export parity drift');

const index = read(manifest.indexPath);
const indexExports = namedReExports(index);
assert(indexExports.length === 12, `jobs index must expose 12 names, got ${indexExports.length}`);
assert(new Set(indexExports).size === 12, 'jobs index exports must be unique');
assert(JSON.stringify([...indexExports].sort()) === JSON.stringify([...manifest.publicExports].sort()), 'jobs index export set drift');

const allDeclared = [];
for (const mod of manifest.modules) {
  const source = read(mod.file);
  const body = extractMovedBody(source, mod.name);
  assert(sha256(body) === mod.generatedBodySha256, `${mod.name}: generated moved-body hash drift`);
  const normalized = mod.name === 'runtime'
    ? body.replace(/^export\s+(?=(?:async\s+)?function\b|const\b|let\b|class\b)/gm, '')
    : body;
  assert(sha256(normalized) === mod.originalBodySha256, `${mod.name}: original body parity failed`);
  for (const name of mod.declaredNames) {
    assert(new RegExp(`\\b${name.replace(/[$]/g, '\\$&')}\\b`).test(body), `${mod.name}: declaration missing ${name}`);
    allDeclared.push(name);
  }
  for (const name of mod.publicExports) {
    assert(new RegExp(`^export\\s+(?:async\\s+)?function\\s+${name}\\b`, 'm').test(body), `${mod.name}: public export missing ${name}`);
  }
}
assert(new Set(allDeclared).size === allDeclared.length, 'moved declarations duplicated across modules');

const router = read(manifest.baseline.routerPath);
assert(sha256(router) === manifest.baseline.routerSha256, 'api/cron_router.js changed inside G1');
const routerJobs = [...router.matchAll(/case\s+['"]([^'"]+-tick)['"]/g)].map((m) => m[1]);
assert(JSON.stringify(routerJobs) === JSON.stringify(manifest.routerJobs), '4/4 cron router job parity drift');
assert(router.includes("from '../src/bot/cron.js'"), 'router must continue importing compatibility façade');

const runtime = read('src/bot/jobs/cronRuntime.js');
const giveaway = read('src/bot/jobs/giveawayJob.js');
const broadcast = read('src/bot/jobs/broadcastJob.js');
const instagram = read('src/bot/jobs/instagramVerificationJob.js');
const audit = read('src/bot/jobs/auditFlushJob.js');

assert(runtime.includes('export const CRON_LOCK_TTL_SEC = 55;'), 'global cron lock TTL drift');
assert(giveaway.includes('const GIVEAWAY_LOCK_TTL_SEC = 120;'), 'giveaway lock TTL drift');
assert(giveaway.includes("k(['lock', 'giveaways_tick'])"), 'giveaways tick lock key drift');
assert(giveaway.includes("k(['lock', 'gw', String(giveawayId)])"), 'per-giveaway lock key drift');
assert(giveaway.includes('drawAndFinalizeGiveawayWinnersAtomic'), 'atomic winner draw path missing');
assert(giveaway.includes('atomicClaimGiveawayResultsPublishing'), 'reserve-before-send result claim missing');
assert(giveaway.includes('atomicFinalizeGiveawayResultsPublish'), 'giveaway result finalize path missing');
assert(broadcast.includes("k(['broadcast', 'cooldown_until'])"), 'broadcast global cooldown key drift');
assert(broadcast.includes("k(['broadcast', 'hard_skip', 'tg', String(tgId)])"), 'broadcast hard-skip key drift');
assert(broadcast.includes("recordCronTickFailure('broadcast_tick', 'broadcast-tick', e)"), 'broadcast failure ownership drift');
assert(giveaway.includes("recordCronTickFailure('giveaways_tick', 'giveaways-tick', e)"), 'giveaway failure ownership drift');
assert(instagram.includes("k(['lock', 'ig_verify_tick'])"), 'Instagram verification lock key drift');
assert(audit.includes("k(['lock', 'cron', 'audit_flush_tick'])"), 'audit flush lock key drift');

assert(manifest.invariants.newApiRoutes === 0, 'new API route invariant drift');
assert(manifest.invariants.newEnv === 0, 'new ENV invariant drift');
assert(manifest.invariants.newMigrations === 0, 'new migration invariant drift');
assert(manifest.invariants.functionBudgetChange === 0, 'function budget invariant drift');

console.log(`✅ STEP590G1 cron tick decomposition tests OK (${assertions} assertions)`);
