import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CRITICAL_SPINE_VERSION, INTEGRATION_CAPABILITIES, P1_ROOTS, PORTABLE_SUITES } from './manifest.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = String(arg).replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : '1'];
}));
const profile = String(args.get('profile') || 'portable').toLowerCase();
const reportPath = args.get('report') ? path.resolve(ROOT, String(args.get('report'))) : '';
const requirePostgres = args.has('require-postgres') || profile === 'integration';
const requireRedis = args.has('require-redis') || profile === 'integration';
const runPortable = true;
const runIntegration = profile !== 'portable';

if (!['portable', 'auto', 'integration'].includes(profile)) {
  console.error(`[critical-spine] unknown profile: ${profile}`);
  process.exit(2);
}

function nowIso() { return new Date().toISOString(); }
function durationMs(start) { return Date.now() - start; }
function hasEnv(names) { return names.every((name) => String(process.env[name] || '').trim()); }
function safeWriteReport(report) {
  if (!reportPath) return;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

const report = {
  version: CRITICAL_SPINE_VERSION,
  step: 'STEP588X7',
  profile,
  startedAt: nowIso(),
  truthBoundary: 'PASS means executed. Missing external capability is NOT_RUN unless explicitly required, then BLOCKED.',
  suites: [],
  p1Coverage: {},
};

let exitCode = 0;

if (runPortable) {
  for (const suite of PORTABLE_SUITES) {
    const start = Date.now();
    const res = spawnSync(process.execPath, [suite.script], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'test', APP_ENV: process.env.APP_ENV || 'test' },
      timeout: 120000,
    });
    const status = res.status === 0 ? 'PASS' : 'FAIL';
    report.suites.push({
      id: `portable:${suite.id}`,
      layer: 'portable_runtime',
      status,
      roots: suite.roots,
      durationMs: durationMs(start),
      exitCode: res.status,
      stdoutTail: String(res.stdout || '').trim().split(/\r?\n/).slice(-3),
      stderrTail: String(res.stderr || '').trim().split(/\r?\n/).slice(-5),
    });
    console.log(`[critical-spine] ${status} portable:${suite.id}`);
    if (status === 'FAIL') exitCode = 1;
  }
}

async function runCapability(name, required, envNames, runner) {
  const missingEnv = envNames.filter((key) => !String(process.env[key] || '').trim());
  if (String(process.env.CRITICAL_TEST_CONFIRM_ISOLATED || '') !== '1' && !missingEnv.includes('CRITICAL_TEST_CONFIRM_ISOLATED')) {
    missingEnv.push('CRITICAL_TEST_CONFIRM_ISOLATED=1');
  }
  const sharedInfra = name === 'postgres'
    ? String(process.env.CRITICAL_TEST_DATABASE_URL || '') === String(process.env.DATABASE_URL || '') && !!process.env.DATABASE_URL
    : String(process.env.CRITICAL_TEST_REDIS_REST_URL || '') === String(process.env.UPSTASH_REDIS_REST_URL || '') && !!process.env.UPSTASH_REDIS_REST_URL;
  if (sharedInfra && String(process.env.CRITICAL_TEST_ALLOW_SHARED_INFRA || '') !== '1') {
    missingEnv.push('CRITICAL_TEST_ALLOW_SHARED_INFRA=1 (required when test URL equals application URL)');
  }
  const available = missingEnv.length === 0;
  if (!available) {
    const status = required ? 'BLOCKED' : 'NOT_RUN';
    report.suites.push({
      id: `integration:${name}`,
      layer: 'external_integration',
      status,
      required,
      missingEnv,
      purpose: INTEGRATION_CAPABILITIES[name].purpose,
    });
    console.log(`[critical-spine] ${status} integration:${name}`);
    if (required) exitCode = 2;
    return;
  }

  const start = Date.now();
  try {
    const details = await runner();
    report.suites.push({ id: `integration:${name}`, layer: 'external_integration', status: 'PASS', required, durationMs: durationMs(start), details });
    console.log(`[critical-spine] PASS integration:${name}`);
  } catch (error) {
    report.suites.push({
      id: `integration:${name}`,
      layer: 'external_integration',
      status: 'FAIL',
      required,
      durationMs: durationMs(start),
      error: { name: String(error?.name || 'Error'), message: String(error?.message || error).slice(0, 500), stackTail: String(error?.stack || '').split(/\r?\n/).slice(-8) },
    });
    console.error(`[critical-spine] FAIL integration:${name}: ${error?.message || error}`);
    exitCode = 1;
  }
}

if (runIntegration) {
  await runCapability('postgres', requirePostgres, INTEGRATION_CAPABILITIES.postgres.env, async () => {
    const { runPostgresSpine } = await import('./postgres.js');
    return runPostgresSpine(process.env.CRITICAL_TEST_DATABASE_URL);
  });
  await runCapability('redis', requireRedis, INTEGRATION_CAPABILITIES.redis.env, async () => {
    const { runRedisSpine } = await import('./redis.js');
    return runRedisSpine({ url: process.env.CRITICAL_TEST_REDIS_REST_URL, token: process.env.CRITICAL_TEST_REDIS_REST_TOKEN });
  });
}

for (const root of P1_ROOTS) {
  const relevant = report.suites.filter((suite) => Array.isArray(suite.roots) && suite.roots.includes(root));
  report.p1Coverage[root] = {
    executablePortable: relevant.some((suite) => suite.layer === 'portable_runtime' && suite.status === 'PASS'),
    suites: relevant.map((suite) => suite.id),
  };
}
report.summary = {
  pass: report.suites.filter((suite) => suite.status === 'PASS').length,
  fail: report.suites.filter((suite) => suite.status === 'FAIL').length,
  blocked: report.suites.filter((suite) => suite.status === 'BLOCKED').length,
  notRun: report.suites.filter((suite) => suite.status === 'NOT_RUN').length,
  allP1PortableCovered: P1_ROOTS.every((root) => report.p1Coverage[root]?.executablePortable === true),
  exitCode,
};
report.finishedAt = nowIso();

if (!report.summary.allP1PortableCovered && runPortable) {
  report.summary.exitCode = exitCode = 1;
}
safeWriteReport(report);
console.log(JSON.stringify(report, null, 2));
if (exitCode === 0) console.log('STEP588X7 Critical-Path Test Spine: PASS');
else if (exitCode === 2) console.error('STEP588X7 Critical-Path Test Spine: BLOCKED');
else console.error('STEP588X7 Critical-Path Test Spine: FAIL');
process.exit(exitCode);
