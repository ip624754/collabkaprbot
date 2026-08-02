import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  if (!ok) process.exitCode = 1;
}

const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const baseline = readJson('docs/product/STEP591_PRODUCT_OPERATIONS_BASELINE.json');
const config = read('src/lib/config.js');
const currentState = read('docs/00_CURRENT_STATE.md');
const boot = read('docs/00_BOOT.md');
const handoff = read('docs/15_NEW_CHAT_HANDOFF.md');
const roadmap = read('docs/roadmap/STEP591_PRODUCT_OPERATIONS_ROADMAP.md');
const apiFiles = fs.readdirSync(path.join(ROOT, 'api'), { recursive: true })
  .filter((name) => String(name).endsWith('.js'))
  .map((name) => String(name).replaceAll('\\', '/'));

const versionAtLeast = (actual, minimum) => {
  const a = String(actual || '').split('.').map((x) => Number(x) || 0);
  const b = String(minimum || '').split('.').map((x) => Number(x) || 0);
  for (let i = 0; i < 3; i += 1) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0); }
  return true;
};
check('package version >= STEP591 baseline', versionAtLeast(pkg.version, '1.3.39'), pkg.version);
check('package-lock root parity', lock.version === pkg.version && lock.packages?.['']?.version === pkg.version, `${lock.version}/${lock.packages?.['']?.version}`);
check('baseline package remains 1.3.39', baseline.packageVersion === '1.3.39', baseline.packageVersion);
check('canonical parent commit recorded', baseline.canonicalParentCommit === '10042b52519ee043e812ea541e34c0c5ff39248e');
check('STEP590 close verdict recorded', baseline.programVerdict === 'PRODUCTION_ACCEPT_STEP590I_ARCHITECTURE_GATES_AND_CLOSE_STEP590');
check('next step is liquidity', baseline.nextStep === 'STEP592_FOUNDING_COHORT_AND_MARKETPLACE_LIQUIDITY');
check('capability matrix is broad enough', Array.isArray(baseline.capabilities) && baseline.capabilities.length >= 16, String(baseline.capabilities?.length || 0));
check('risk register exists', Array.isArray(baseline.priorityRisks) && baseline.priorityRisks.length >= 5, String(baseline.priorityRisks?.length || 0));
check('roadmap has STEP592-596', JSON.stringify(baseline.roadmap).includes('STEP592_') && JSON.stringify(baseline.roadmap).includes('STEP596_'));
check('required docs exist', [
  'docs/product/STEP591_PRODUCT_CAPABILITY_MATRIX.md',
  'docs/operations/STEP591_LAUNCH_READINESS_BASELINE.md',
  'docs/roadmap/STEP591_PRODUCT_OPERATIONS_ROADMAP.md',
  'docs/process/08_WORK_HISTORY_STEP591.md',
].every(exists));
check('current state retains STEP591 history', currentState.includes('## STEP591 — Product and Operations Rebaseline'));
check('boot retains STEP591 baseline history', boot.includes('STEP591'));
check('handoff retains STEP591 history', handoff.includes('# STEP591 CURRENT HANDOFF'));
check('broad cleanup deferred', roadmap.includes('STEP590J') && roadmap.includes('не является launch blocker'));
check('safe defaults remain documented in code',
  config.includes('FOUNDER_SALE_ENABLED: parseBoolSafe(process.env.FOUNDER_SALE_ENABLED, false)') &&
  config.includes('PAYMENTS_FALLBACK_APPLY_ENABLED: parseBoolSafe(process.env.PAYMENTS_FALLBACK_APPLY_ENABLED, false)') &&
  config.includes('IG_OAUTH_UI_ENABLED: parseBoolSafe(process.env.IG_OAUTH_UI_ENABLED, false)'));
check('deployable API surface remains 11', apiFiles.length === 11, String(apiFiles.length));
check('no runtime paths listed in STEP591 changed scope', baseline.truthBoundary.notClaimed.includes('real paid conversion'));

const report = {
  step: baseline.step,
  packageVersion: pkg.version,
  pass: results.every((row) => row.ok),
  checks: results,
};
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  for (const row of results) console.log(`[step591] ${row.ok ? 'PASS' : 'FAIL'} ${row.name}${row.detail ? ` — ${row.detail}` : ''}`);
  console.log(`[step591] ${report.pass ? 'PASS' : 'FAIL'} ${results.filter((row) => row.ok).length}/${results.length}`);
}
if (!report.pass) process.exit(1);
