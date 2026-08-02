export const FOUNDING_COHORT_MAX_MEMBERS = 50;
export const FOUNDING_COHORT_MAX_TEXT = 500;
export const FOUNDING_COHORT_MEMBER_STATUSES = Object.freeze(['candidate', 'reviewing', 'launch_ready', 'onboarded', 'blocked']);
export const FOUNDING_COHORT_CANARY_STATUSES = Object.freeze(['not_run', 'pass', 'blocked']);

const MEMBER_STATUS_SET = new Set(FOUNDING_COHORT_MEMBER_STATUSES);
const CANARY_STATUS_SET = new Set(FOUNDING_COHORT_CANARY_STATUSES);

export function cleanFoundingCohortText(value, max = FOUNDING_COHORT_MAX_TEXT) {
  return String(value || '').replace(/\r/g, '').trim().slice(0, Math.max(1, Number(max || FOUNDING_COHORT_MAX_TEXT)));
}

export function cleanFoundingCohortIsoDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? new Date(ts).toISOString() : '';
}

export function normalizeFoundingCohortStatus(value) {
  const key = String(value || 'candidate').trim().toLowerCase();
  return MEMBER_STATUS_SET.has(key) ? key : 'candidate';
}

export function normalizeFoundingCohortCanaryStatus(value) {
  const key = String(value || 'not_run').trim().toLowerCase();
  return CANARY_STATUS_SET.has(key) ? key : 'not_run';
}

export function normalizeFoundingCohortMember(raw = {}, fallbackUserId = 0, now = new Date().toISOString()) {
  const userId = Number(raw.userId || raw.user_id || fallbackUserId || 0) || 0;
  if (!userId) return null;
  return {
    userId,
    status: normalizeFoundingCohortStatus(raw.status),
    profileReviewed: raw.profileReviewed === true,
    contactReviewed: raw.contactReviewed === true,
    termsReviewed: raw.termsReviewed === true,
    onboardingCanary: normalizeFoundingCohortCanaryStatus(raw.onboardingCanary),
    onboardingCanaryAt: cleanFoundingCohortIsoDate(raw.onboardingCanaryAt),
    blocker: cleanFoundingCohortText(raw.blocker),
    note: cleanFoundingCohortText(raw.note),
    addedAt: cleanFoundingCohortIsoDate(raw.addedAt) || now,
    updatedAt: cleanFoundingCohortIsoDate(raw.updatedAt) || now,
    updatedByTgId: Number(raw.updatedByTgId || 0) || 0,
  };
}

export function normalizeFoundingCohortState(raw = {}, now = new Date().toISOString()) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const membersRaw = source.members && typeof source.members === 'object' && !Array.isArray(source.members)
    ? source.members
    : {};
  const members = {};
  for (const [key, value] of Object.entries(membersRaw)) {
    if (Object.keys(members).length >= FOUNDING_COHORT_MAX_MEMBERS) break;
    const member = normalizeFoundingCohortMember(value, Number(key || 0), now);
    if (member) members[String(member.userId)] = member;
  }
  const cadenceDays = Math.max(1, Math.min(30, Number(source.followUpCadenceDays || 7) || 7));
  return {
    version: 1,
    launchWedge: cleanFoundingCohortText(source.launchWedge, 160) || 'creator offers → qualified brand request → accepted deal',
    ownerLabel: cleanFoundingCohortText(source.ownerLabel, 120),
    ownerTgId: Number(source.ownerTgId || 0) || 0,
    followUpCadenceDays: cadenceDays,
    nextReviewAt: cleanFoundingCohortIsoDate(source.nextReviewAt),
    updatedAt: cleanFoundingCohortIsoDate(source.updatedAt),
    updatedByTgId: Number(source.updatedByTgId || 0) || 0,
    members,
  };
}

export function foundingCohortMemberReadiness(member = {}, row = {}, activeOffers = 0) {
  const isCreator = row.is_creator === true || row.isCreator === true;
  const hasChannel = row.has_channel === true || row.hasChannel === true;
  const reviewsComplete = member.profileReviewed === true && member.contactReviewed === true && member.termsReviewed === true;
  const noBlocker = !cleanFoundingCohortText(member.blocker);
  const manualReady = ['launch_ready', 'onboarded'].includes(normalizeFoundingCohortStatus(member.status));
  const launchReady = isCreator && hasChannel && reviewsComplete && noBlocker && manualReady;
  return {
    isCreator,
    hasChannel,
    reviewsComplete,
    noBlocker,
    manualReady,
    launchReady,
    activeOffers: Math.max(0, Number(activeOffers || 0)),
  };
}

export function computeFoundingCohortProgress(members = [], config = {}, targets = {}) {
  const safeMembers = Array.isArray(members) ? members : [];
  const launchReadyTarget = Math.max(1, Number(targets.launchReadyCreators || 10) || 10);
  const activeOffersTarget = Math.max(1, Number(targets.activeOffers || 5) || 5);
  const activeOffersEvidenceAvailable = targets.activeOffersEvidenceAvailable !== false;
  const cohortPersistenceAvailable = targets.cohortPersistenceAvailable !== false;
  const canaryFreshnessDays = Math.max(1, Math.min(30, Number(targets.canaryFreshnessDays || 14) || 14));
  const nowTs = new Date(targets.now || new Date().toISOString()).getTime();
  const canaryCutoffTs = nowTs - canaryFreshnessDays * 24 * 60 * 60 * 1000;
  const launchReadyCreators = safeMembers.filter((member) => member?.readiness?.launchReady === true).length;
  const activeOffers = safeMembers.reduce((sum, member) => sum + Math.max(0, Number(member?.activeOffers || 0)), 0);
  const blockerDefects = safeMembers.filter((member) => normalizeFoundingCohortStatus(member?.status) === 'blocked'
    || normalizeFoundingCohortCanaryStatus(member?.onboardingCanary) === 'blocked'
    || !!cleanFoundingCohortText(member?.blocker)).length;
  const onboardingCanaryPass = safeMembers.some((member) => {
    if (normalizeFoundingCohortCanaryStatus(member?.onboardingCanary) !== 'pass') return false;
    const canaryTs = new Date(cleanFoundingCohortIsoDate(member?.onboardingCanaryAt)).getTime();
    return Number.isFinite(canaryTs) && canaryTs >= canaryCutoffTs && canaryTs <= nowTs + 5 * 60 * 1000;
  });
  const ownerConfigured = !!(cleanFoundingCohortText(config.ownerLabel, 120) || Number(config.ownerTgId || 0));
  const nextReviewTs = new Date(cleanFoundingCohortIsoDate(config.nextReviewAt)).getTime();
  const cadenceConfigured = !!(Number(config.followUpCadenceDays || 0)
    && Number.isFinite(nextReviewTs)
    && nextReviewTs >= nowTs);
  const exitReady = cohortPersistenceAvailable
    && launchReadyCreators >= launchReadyTarget
    && activeOffersEvidenceAvailable
    && activeOffers >= activeOffersTarget
    && blockerDefects === 0
    && onboardingCanaryPass
    && ownerConfigured
    && cadenceConfigured;
  return {
    cohortMembers: safeMembers.length,
    cohortPersistenceAvailable,
    launchReadyCreators,
    activeOffers,
    activeOffersEvidenceAvailable,
    blockerDefects,
    onboardingCanaryPass,
    canaryFreshnessDays,
    ownerConfigured,
    cadenceConfigured,
    exitReady,
  };
}
