import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { P1_ROOTS, PORTABLE_SUITES } from './critical-spine/manifest.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const runner = fs.readFileSync(path.join(ROOT, 'scripts/critical-spine/run.js'), 'utf8');
const pg = fs.readFileSync(path.join(ROOT, 'scripts/critical-spine/postgres.js'), 'utf8');
const redis = fs.readFileSync(path.join(ROOT, 'scripts/critical-spine/redis.js'), 'utf8');
let assertions = 0;
const check = (value, message) => { assert.ok(value, message); assertions += 1; };

check(pkg.scripts['test:critical-spine'] === 'node scripts/critical-spine/run.js --profile=portable', 'portable spine command must be explicit');
check(pkg.scripts['test:critical-spine:auto']?.includes('--profile=auto'), 'auto spine command must exist');
check(pkg.scripts['test:critical-spine:integration']?.includes('--profile=integration'), 'strict integration command must exist');
check(pkg.scripts['test:critical-spine:integration']?.includes('--require-postgres'), 'strict integration must require PostgreSQL');
check(pkg.scripts['test:critical-spine:integration']?.includes('--require-redis'), 'strict integration must require Redis');
check(runner.includes("status = required ? 'BLOCKED' : 'NOT_RUN'"), 'runner must not call missing integration PASS');
check(runner.includes('CRITICAL_TEST_DATABASE_URL'), 'PostgreSQL capability must be explicit');
check(runner.includes('CRITICAL_TEST_REDIS_REST_URL'), 'Redis capability must be explicit');
check(runner.includes('CRITICAL_TEST_CONFIRM_ISOLATED=1'), 'integration must require explicit isolated-infrastructure confirmation');
check(runner.includes('CRITICAL_TEST_ALLOW_SHARED_INFRA=1'), 'shared application infrastructure must require a second explicit acknowledgement');
check(pg.includes('BEGIN ISOLATION LEVEL REPEATABLE READ') || pg.includes('drawAndFinalizeGiveawayWinnersAtomicCore'), 'real giveaway transaction path must execute');
check(pg.includes('applyPaymentFulfillmentAtomic'), 'real payment fulfillment service must execute');
check(pg.includes('spine receipt failure'), 'payment rollback failure injection must exist');
check(pg.includes('spine audit failure'), 'giveaway rollback failure injection must exist');
check(pg.includes('persistBroadcastSentOrUnknown'), 'broadcast ambiguous receipt helper must execute');
check(redis.includes("{ nx: true"), 'Redis SET NX exactly-once proof must exist');
check(redis.includes('approveChallengeFromTelegram') && redis.includes('issueSession'), 'production admin approval/session consume proof must execute');
check(redis.includes('consumeAdminAuthRateLimit'), 'production Redis auth throttle proof must execute');
check(redis.includes('claimCriticalTelegramUpdate') && redis.includes('finalizeCriticalTelegramUpdate'), 'production critical update receipt proof must execute');
check(PORTABLE_SUITES.length >= 6, 'X1-X6 portable suites must be registered');
for (const root of P1_ROOTS) {
  check(PORTABLE_SUITES.some((suite) => suite.roots.includes(root)), `${root} must map to an executable portable suite`);
}

console.log(`PASS critical-path spine contract (${assertions} assertions)`);
