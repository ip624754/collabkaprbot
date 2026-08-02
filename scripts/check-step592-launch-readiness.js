import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));
const checks = [];
const pass = (id, ok, detail = '') => checks.push({ id, ok: !!ok, detail });

const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const baseline = readJson('docs/product/STEP592_FOUNDING_COHORT_BASELINE.json');
const cohort = read('src/lib/adminWeb/foundingCohort.js');
const model = read('src/lib/adminWeb/foundingCohortModel.js');
const apiRead = read('api/admin-web-read.js');
const apiWrite = read('api/admin-web-write.js');
const web = read('scripts/admin-web.js');
const users = read('scripts/admin-web/users.js');
const roadmap = read('docs/roadmap/STEP592_FOUNDING_COHORT_EXECUTION_PLAN.md');

pass('step', baseline.step === 'STEP592_FOUNDING_COHORT_AND_MARKETPLACE_LIQUIDITY', baseline.step);
pass('parent', baseline.canonicalParentCommit === 'd0c2f10e328d3e1464649831bcbf67840e875703', baseline.canonicalParentCommit);
pass('package', pkg.version === '1.3.40' && baseline.packageVersion === pkg.version, pkg.version);
pass('lock', lock.version === pkg.version && lock.packages?.['']?.version === pkg.version, lock.version);
pass('exit_creator_target', baseline.exitCriteria?.launchReadyCreators === 10);
pass('exit_offer_target', baseline.exitCriteria?.activeOffers === 5);
pass('exit_blockers', baseline.exitCriteria?.blockerDefects === 0);
pass('exit_canary', baseline.exitCriteria?.onboardingCanaryPass === true && baseline.exitCriteria?.onboardingCanaryFreshnessDays === 14);
pass('future_review', baseline.exitCriteria?.nextReviewMustBeFuture === true && model.includes('nextReviewTs >= nowTs'));
pass('bounded_members', cohort.includes('FOUNDING_COHORT_MAX_MEMBERS') && model.includes('FOUNDING_COHORT_MAX_MEMBERS = 50'));
pass('locked_persistence', cohort.includes('readStateStrict()') && cohort.includes('acquireLock(COHORT_LOCK_KEY') && cohort.includes('releaseLock(COHORT_LOCK_KEY'));
pass('persistence_fail_closed', cohort.includes('readStateWithEvidence()') && model.includes('cohortPersistenceAvailable'));
pass('read_owner', apiRead.includes("section === 'founding_cohort'") && apiRead.includes('getFoundingCohortSummary'));
pass('write_owner', apiWrite.includes("action === 'set_founding_cohort_member'") && apiWrite.includes("action === 'configure_founding_cohort'"));
pass('founder_only', apiWrite.includes("if (!isFounderSession(session)) return json(res, 403, { ok: false, error: 'founder_only' });"));
pass('audit', apiWrite.includes("reason: 'bounded_launch_operations'"));
pass('active_offers_only', cohort.includes("upper(o.status)='ACTIVE'"));
pass('offer_evidence_fail_closed', cohort.includes('available: false') && model.includes('activeOffersEvidenceAvailable'));
pass('creator_candidates', cohort.includes("listUsersDirectory('creators'") && cohort.includes("channelState: 'with_channel'"));
pass('ui_workspace', users.includes('Founding cohort · marketplace liquidity') && users.includes('data-cohort-save'));
pass('orchestration_boundary', !/\bfetch\s*\(/.test(users) && web.includes('section=founding_cohort'));
pass('no_runtime_claim', Array.isArray(baseline.truthBoundary?.notClaimed) && baseline.truthBoundary.notClaimed.includes('marketplace liquidity has been achieved'));
pass('next_step', baseline.nextStepAfterExit === 'STEP593_BRAND_DEMAND_AND_FIRST_DEAL_FUNNEL' && roadmap.includes('STEP593'));

const apiCount = fs.readdirSync(path.join(ROOT, 'api')).filter((name) => name.endsWith('.js')).length
  + fs.readdirSync(path.join(ROOT, 'api', 'qstash')).filter((name) => name.endsWith('.js')).length;
pass('function_budget_surface', apiCount === 11, String(apiCount));

const failed = checks.filter((item) => !item.ok);
const report = {
  step: baseline.step,
  packageVersion: pkg.version,
  ok: failed.length === 0,
  summary: { checks: checks.length, passed: checks.length - failed.length, failed: failed.length },
  checks,
};

if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  for (const item of checks) console.log(`[step592] ${item.ok ? 'PASS' : 'FAIL'} ${item.id}${item.detail ? ` — ${item.detail}` : ''}`);
  console.log(`[step592] ${report.ok ? 'OK' : 'FAILED'} ${report.summary.passed}/${report.summary.checks}`);
}
process.exit(report.ok ? 0 : 1);
