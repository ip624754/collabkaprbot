import assert from 'node:assert/strict';

const readRoute = await import('../api/admin-web-read.js');
const writeRoute = await import('../api/admin-web-write.js');
const cohort = await import('../src/lib/adminWeb/foundingCohort.js');
const model = await import('../src/lib/adminWeb/foundingCohortModel.js');

let assertions = 0;
const ok = (value, message) => { assertions += 1; assert.ok(value, message); };

ok(typeof readRoute.default === 'function', 'admin read route must expose a default handler');
ok(typeof writeRoute.default === 'function', 'admin write route must expose a default handler');
ok(typeof cohort.getFoundingCohortSummary === 'function', 'cohort read owner must link');
ok(typeof cohort.configureFoundingCohort === 'function', 'cohort config mutation must link');
ok(typeof cohort.setFoundingCohortMember === 'function', 'cohort member mutation must link');
ok(typeof cohort.removeFoundingCohortMember === 'function', 'cohort removal mutation must link');
ok(typeof model.computeFoundingCohortProgress === 'function', 'pure readiness model must link');
ok(model.FOUNDING_COHORT_MAX_MEMBERS === 50, 'bounded member constant must link');

console.log(`[step592-esm] PASS — ${assertions} assertions`);
