import assert from 'node:assert/strict';
import {
  FOUNDING_COHORT_MAX_MEMBERS,
  cleanFoundingCohortIsoDate,
  cleanFoundingCohortText,
  computeFoundingCohortProgress,
  foundingCohortMemberReadiness,
  normalizeFoundingCohortCanaryStatus,
  normalizeFoundingCohortMember,
  normalizeFoundingCohortState,
  normalizeFoundingCohortStatus,
} from '../src/lib/adminWeb/foundingCohortModel.js';

let assertions = 0;
const check = (condition, message) => { assertions += 1; assert.ok(condition, message); };
const equal = (actual, expected, message) => { assertions += 1; assert.equal(actual, expected, message); };

const now = '2026-08-02T18:00:00.000Z';
equal(normalizeFoundingCohortStatus('launch_ready'), 'launch_ready', 'launch_ready must remain valid');
equal(normalizeFoundingCohortStatus('INVALID'), 'candidate', 'invalid status must fail closed');
equal(normalizeFoundingCohortCanaryStatus('pass'), 'pass', 'pass canary must remain valid');
equal(normalizeFoundingCohortCanaryStatus('oops'), 'not_run', 'invalid canary must fail closed');
equal(cleanFoundingCohortText('  hello\r\nworld  ', 50), 'hello\nworld', 'text must normalize CR and trim');
equal(cleanFoundingCohortText('x'.repeat(700)).length, 500, 'text must be bounded');
equal(cleanFoundingCohortIsoDate('bad'), '', 'invalid date must be rejected');
check(cleanFoundingCohortIsoDate('2026-08-03T12:00:00Z').startsWith('2026-08-03T12:00:00'), 'valid date must normalize');

const member = normalizeFoundingCohortMember({
  userId: 42,
  status: 'launch_ready',
  profileReviewed: true,
  contactReviewed: true,
  termsReviewed: true,
  onboardingCanary: 'pass',
  onboardingCanaryAt: '2026-08-02T17:00:00.000Z',
  blocker: '',
  note: 'Ready for canary',
}, 0, now);
equal(member.userId, 42, 'member user id must normalize');
equal(member.status, 'launch_ready', 'member status must normalize');
equal(member.onboardingCanary, 'pass', 'member canary must normalize');
equal(member.onboardingCanaryAt, '2026-08-02T17:00:00.000Z', 'member canary timestamp must normalize');
equal(member.addedAt, now, 'member addedAt must default to deterministic now');
equal(member.updatedAt, now, 'member updatedAt must default to deterministic now');

const ready = foundingCohortMemberReadiness(member, { is_creator: true, has_channel: true }, 2);
check(ready.isCreator, 'creator signal required');
check(ready.hasChannel, 'channel signal required');
check(ready.reviewsComplete, 'all reviews required');
check(ready.noBlocker, 'no blocker required');
check(ready.manualReady, 'manual ready state required');
check(ready.launchReady, 'complete creator must be launch-ready');
equal(ready.activeOffers, 2, 'active offers must be preserved');

check(!foundingCohortMemberReadiness(member, { is_creator: true, has_channel: false }, 2).launchReady, 'missing channel must block readiness');
check(!foundingCohortMemberReadiness({ ...member, contactReviewed: false }, { is_creator: true, has_channel: true }, 2).launchReady, 'missing contact review must block readiness');
check(!foundingCohortMemberReadiness({ ...member, blocker: 'profile mismatch' }, { is_creator: true, has_channel: true }, 2).launchReady, 'blocker text must block readiness');
check(!foundingCohortMemberReadiness({ ...member, status: 'reviewing' }, { is_creator: true, has_channel: true }, 2).launchReady, 'reviewing status must not count as ready');

const state = normalizeFoundingCohortState({
  launchWedge: '  creator offers  ',
  ownerLabel: '  Rustam  ',
  ownerTgId: '123',
  followUpCadenceDays: 99,
  nextReviewAt: '2026-08-04T10:00:00Z',
  members: { 42: member },
}, now);
equal(state.version, 1, 'state version must be fixed');
equal(state.launchWedge, 'creator offers', 'launch wedge must trim');
equal(state.ownerLabel, 'Rustam', 'owner label must trim');
equal(state.ownerTgId, 123, 'owner tg id must normalize');
equal(state.followUpCadenceDays, 30, 'cadence must clamp to 30 days');
equal(Object.keys(state.members).length, 1, 'member map must preserve valid member');

const oversizedMembers = {};
for (let i = 1; i <= FOUNDING_COHORT_MAX_MEMBERS + 7; i += 1) oversizedMembers[i] = { userId: i };
const bounded = normalizeFoundingCohortState({ members: oversizedMembers }, now);
equal(Object.keys(bounded.members).length, FOUNDING_COHORT_MAX_MEMBERS, 'cohort must enforce member limit');

const completeMembers = Array.from({ length: 10 }, (_, index) => ({
  userId: index + 1,
  status: index === 0 ? 'onboarded' : 'launch_ready',
  onboardingCanary: index === 0 ? 'pass' : 'not_run',
  onboardingCanaryAt: index === 0 ? '2026-08-02T17:00:00.000Z' : '',
  blocker: '',
  activeOffers: index < 5 ? 1 : 0,
  readiness: { launchReady: true },
}));
const completeProgress = computeFoundingCohortProgress(completeMembers, {
  ownerLabel: 'Rustam',
  ownerTgId: 123,
  followUpCadenceDays: 7,
  nextReviewAt: '2026-08-04T10:00:00Z',
}, { now, canaryFreshnessDays: 14 });
equal(completeProgress.cohortMembers, 10, 'progress must count cohort members');
equal(completeProgress.launchReadyCreators, 10, 'progress must count ready creators');
equal(completeProgress.activeOffers, 5, 'progress must sum active offers');
equal(completeProgress.blockerDefects, 0, 'complete progress must have zero blockers');
check(completeProgress.onboardingCanaryPass, 'complete progress must include canary pass');
check(completeProgress.ownerConfigured, 'complete progress must include owner');
check(completeProgress.cadenceConfigured, 'complete progress must include cadence');
check(completeProgress.cohortPersistenceAvailable, 'cohort persistence must default to available');
check(completeProgress.activeOffersEvidenceAvailable, 'offer evidence must default to available');
check(completeProgress.exitReady, 'all STEP592 exit criteria must converge');


const unavailablePersistence = computeFoundingCohortProgress(completeMembers, {
  ownerLabel: 'Rustam',
  followUpCadenceDays: 7,
  nextReviewAt: '2026-08-04T10:00:00Z',
}, { cohortPersistenceAvailable: false, now });
check(!unavailablePersistence.cohortPersistenceAvailable, 'unavailable cohort storage must remain explicit');
check(!unavailablePersistence.exitReady, 'unavailable cohort storage must fail closed');

const unavailableOfferEvidence = computeFoundingCohortProgress(completeMembers, {
  ownerLabel: 'Rustam',
  followUpCadenceDays: 7,
  nextReviewAt: '2026-08-04T10:00:00Z',
}, { activeOffersEvidenceAvailable: false, now });
check(!unavailableOfferEvidence.activeOffersEvidenceAvailable, 'unavailable offer aggregate must remain explicit');
check(!unavailableOfferEvidence.exitReady, 'unavailable offer aggregate must fail closed');

const blockedProgress = computeFoundingCohortProgress([
  ...completeMembers.slice(0, 9),
  { ...completeMembers[9], status: 'blocked', blocker: 'missing contact' },
], {
  ownerLabel: 'Rustam',
  followUpCadenceDays: 7,
  nextReviewAt: '2026-08-04T10:00:00Z',
}, { now });
check(blockedProgress.blockerDefects > 0, 'blocked member must count as blocker defect');
check(!blockedProgress.exitReady, 'blocker defect must block exit readiness');

const noOwnerProgress = computeFoundingCohortProgress(completeMembers, {
  followUpCadenceDays: 7,
  nextReviewAt: '2026-08-04T10:00:00Z',
}, { now });
check(!noOwnerProgress.ownerConfigured, 'missing owner must remain visible');
check(!noOwnerProgress.exitReady, 'missing owner must block exit readiness');

const noCadenceProgress = computeFoundingCohortProgress(completeMembers, { ownerLabel: 'Rustam' }, { now });
check(!noCadenceProgress.cadenceConfigured, 'missing next review must remain visible');
check(!noCadenceProgress.exitReady, 'missing cadence must block exit readiness');


const staleCanaryMembers = completeMembers.map((item, index) => index === 0
  ? { ...item, onboardingCanaryAt: '2026-07-01T12:00:00.000Z' }
  : item);
const staleCanaryProgress = computeFoundingCohortProgress(staleCanaryMembers, {
  ownerLabel: 'Rustam',
  followUpCadenceDays: 7,
  nextReviewAt: '2026-08-04T10:00:00Z',
}, { now, canaryFreshnessDays: 14 });
check(!staleCanaryProgress.onboardingCanaryPass, 'stale onboarding canary must not satisfy exit readiness');
check(!staleCanaryProgress.exitReady, 'stale onboarding canary must block exit readiness');

const staleReviewProgress = computeFoundingCohortProgress(completeMembers, {
  ownerLabel: 'Rustam',
  followUpCadenceDays: 7,
  nextReviewAt: '2026-08-01T10:00:00Z',
}, { now });
check(!staleReviewProgress.cadenceConfigured, 'past next-review date must not satisfy cadence');
check(!staleReviewProgress.exitReady, 'past next-review date must block exit readiness');

console.log(`[STEP592] PASS — ${assertions} assertions`);
