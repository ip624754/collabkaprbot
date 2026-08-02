import { pool } from '../../db/pool.js';
import { getUserCardById, getUsersDirectoryByIds, listUsersDirectory } from '../../db/queries.js';
import { acquireLock, k, redis, releaseLock } from '../redis.js';
import {
  FOUNDING_COHORT_MAX_MEMBERS,
  cleanFoundingCohortIsoDate,
  cleanFoundingCohortText,
  computeFoundingCohortProgress,
  foundingCohortMemberReadiness,
  normalizeFoundingCohortCanaryStatus,
  normalizeFoundingCohortMember,
  normalizeFoundingCohortState,
} from './foundingCohortModel.js';

export { normalizeFoundingCohortMember, normalizeFoundingCohortState } from './foundingCohortModel.js';

const COHORT_KEY = k(['admin', 'founding_cohort', 'v1']);
const COHORT_LOCK_KEY = k(['admin', 'founding_cohort', 'v1', 'lock']);
const COHORT_LOCK_TTL_SEC = 8;

async function readStateStrict() {
  return normalizeFoundingCohortState(await redis.get(COHORT_KEY));
}

async function readStateWithEvidence() {
  try {
    return { state: await readStateStrict(), available: true };
  } catch {
    return { state: normalizeFoundingCohortState({}), available: false };
  }
}

async function writeState(next) {
  const normalized = normalizeFoundingCohortState(next);
  // TTL-LINT: allow-persistent — founding cohort is an explicit operator-owned launch workspace.
  await redis.set(COHORT_KEY, normalized);
  return normalized;
}

async function mutateState(mutator) {
  const lock = await acquireLock(COHORT_LOCK_KEY, COHORT_LOCK_TTL_SEC);
  if (!lock?.token) return { ok: false, error: 'cohort_busy' };
  try {
    const previous = await readStateStrict();
    const draft = normalizeFoundingCohortState(previous);
    const result = await mutator(draft, previous);
    if (result?.ok === false) return result;
    const next = await writeState(result?.state || draft);
    return { ok: true, previous, state: next, result: result?.result || null };
  } catch (error) {
    return { ok: false, error: 'cohort_write_failed', detail: String(error?.message || error).slice(0, 160) };
  } finally {
    await releaseLock(COHORT_LOCK_KEY, lock.token).catch(() => {});
  }
}

export async function configureFoundingCohort({ actorTgId, launchWedge, ownerLabel, ownerTgId, followUpCadenceDays, nextReviewAt }) {
  return mutateState(async (state) => {
    state.launchWedge = cleanFoundingCohortText(launchWedge, 160) || state.launchWedge;
    state.ownerLabel = cleanFoundingCohortText(ownerLabel, 120);
    state.ownerTgId = Number(ownerTgId || 0) || 0;
    state.followUpCadenceDays = Math.max(1, Math.min(30, Number(followUpCadenceDays || state.followUpCadenceDays || 7) || 7));
    state.nextReviewAt = cleanFoundingCohortIsoDate(nextReviewAt);
    state.updatedAt = new Date().toISOString();
    state.updatedByTgId = Number(actorTgId || 0) || 0;
    return { state };
  });
}

export async function setFoundingCohortMember({ actorTgId, userId, status, profileReviewed, contactReviewed, termsReviewed, onboardingCanary, blocker, note }) {
  const uid = Number(userId || 0) || 0;
  if (!uid) return { ok: false, error: 'user_id_required' };
  const user = await getUserCardById(uid);
  if (!user) return { ok: false, error: 'user_not_found' };
  if (!user.is_creator) return { ok: false, error: 'creator_required' };

  return mutateState(async (state) => {
    const current = state.members[String(uid)] || {};
    if (!current.userId && Object.keys(state.members).length >= FOUNDING_COHORT_MAX_MEMBERS) {
      return { ok: false, error: 'cohort_member_limit' };
    }
    const now = new Date().toISOString();
    const nextCanary = normalizeFoundingCohortCanaryStatus(onboardingCanary);
    const onboardingCanaryAt = nextCanary === 'pass'
      ? (normalizeFoundingCohortCanaryStatus(current.onboardingCanary) === 'pass' && current.onboardingCanaryAt
        ? current.onboardingCanaryAt
        : now)
      : '';
    const next = normalizeFoundingCohortMember({
      ...current,
      userId: uid,
      status,
      profileReviewed,
      contactReviewed,
      termsReviewed,
      onboardingCanary: nextCanary,
      onboardingCanaryAt,
      blocker,
      note,
      addedAt: current.addedAt || now,
      updatedAt: now,
      updatedByTgId: Number(actorTgId || 0) || 0,
    }, uid);
    state.members[String(uid)] = next;
    state.updatedAt = new Date().toISOString();
    state.updatedByTgId = Number(actorTgId || 0) || 0;
    return { state, result: { member: next } };
  });
}

export async function removeFoundingCohortMember({ actorTgId, userId }) {
  const uid = Number(userId || 0) || 0;
  if (!uid) return { ok: false, error: 'user_id_required' };
  return mutateState(async (state) => {
    const current = state.members[String(uid)] || null;
    if (!current) return { ok: false, error: 'cohort_member_not_found' };
    delete state.members[String(uid)];
    state.updatedAt = new Date().toISOString();
    state.updatedByTgId = Number(actorTgId || 0) || 0;
    return { state, result: { removed: current } };
  });
}

async function activeOfferCountsForUsers(userIds = []) {
  const ids = Array.from(new Set(userIds.map((value) => Number(value || 0) || 0).filter((value) => value > 0))).slice(0, FOUNDING_COHORT_MAX_MEMBERS);
  const out = new Map();
  if (!ids.length) return { counts: out, available: true };
  try {
    const result = await pool.query(
      `select coalesce(o.creator_user_id, w.owner_user_id)::bigint as user_id,
              count(*) filter (where upper(o.status)='ACTIVE')::int as active_count
       from barter_offers o
       join workspaces w on w.id=o.workspace_id
       where coalesce(o.creator_user_id, w.owner_user_id)=any($1::bigint[])
       group by coalesce(o.creator_user_id, w.owner_user_id)`,
      [ids]
    );
    for (const row of result.rows || []) out.set(Number(row.user_id || 0), Number(row.active_count || 0));
    return { counts: out, available: true };
  } catch {
    // Fail closed: do not report zero offers as verified when the aggregate is unavailable.
    return { counts: out, available: false };
  }
}

function displayName(row = {}) {
  const username = cleanFoundingCohortText(row.tg_username, 80);
  return username ? `@${username.replace(/^@/, '')}` : `user #${Number(row.user_id || 0) || '—'}`;
}

function buildCandidate(row = {}) {
  return {
    userId: Number(row.user_id || 0),
    tgId: Number(row.tg_id || 0),
    username: cleanFoundingCohortText(row.tg_username, 80),
    displayName: displayName(row),
    hasChannel: row.has_channel === true,
    lastKnownActivityAt: row.last_known_activity_at || row.updated_at || row.created_at || null,
  };
}

export async function getFoundingCohortSummary({ candidateLimit = 12 } = {}) {
  const stateEvidence = await readStateWithEvidence();
  const state = stateEvidence.state;
  const memberIds = Object.values(state.members).map((member) => Number(member.userId || 0)).filter(Boolean);
  const safeCandidateLimit = Math.max(5, Math.min(25, Number(candidateLimit || 12) || 12));
  const [memberRows, offerAggregate, candidateResult] = await Promise.all([
    getUsersDirectoryByIds(memberIds).catch(() => []),
    activeOfferCountsForUsers(memberIds),
    listUsersDirectory('creators', safeCandidateLimit, 0, '', {
      channelState: 'with_channel',
      sortBy: 'activity_desc',
    }).catch(() => ({ rows: [] })),
  ]);
  const rowMap = new Map((memberRows || []).map((row) => [Number(row.user_id || 0), row]));
  const members = Object.values(state.members).map((member) => {
    const row = rowMap.get(Number(member.userId || 0)) || {};
    const activeOffers = offerAggregate.counts.get(Number(member.userId || 0)) || 0;
    const readiness = foundingCohortMemberReadiness(member, row, activeOffers);
    return {
      ...member,
      tgId: Number(row.tg_id || 0) || 0,
      username: cleanFoundingCohortText(row.tg_username, 80),
      displayName: displayName({ ...row, user_id: member.userId }),
      hasChannel: readiness.hasChannel,
      lastKnownActivityAt: row.last_known_activity_at || row.updated_at || row.created_at || null,
      activeOffers: readiness.activeOffers,
      readiness,
    };
  }).sort((a, b) => {
    const rank = { blocked: 5, reviewing: 4, candidate: 3, launch_ready: 2, onboarded: 1 };
    const delta = (rank[a.status] || 9) - (rank[b.status] || 9);
    if (delta !== 0) return delta;
    return String(a.displayName).localeCompare(String(b.displayName), 'ru');
  });
  const memberSet = new Set(memberIds);
  const candidates = (candidateResult?.rows || [])
    .filter((row) => !memberSet.has(Number(row.user_id || 0)))
    .map(buildCandidate)
    .slice(0, safeCandidateLimit);

  const targets = {
    launchReadyCreators: 10,
    activeOffers: 5,
    blockerDefects: 0,
    onboardingCanaryPass: true,
    canaryFreshnessDays: 14,
    ownerConfigured: true,
    cadenceConfigured: true,
  };
  const progress = computeFoundingCohortProgress(members, state, {
    ...targets,
    now: new Date().toISOString(),
    activeOffersEvidenceAvailable: offerAggregate.available,
    cohortPersistenceAvailable: stateEvidence.available,
  });

  return {
    config: {
      launchWedge: state.launchWedge,
      ownerLabel: state.ownerLabel,
      ownerTgId: state.ownerTgId,
      followUpCadenceDays: state.followUpCadenceDays,
      nextReviewAt: state.nextReviewAt,
      updatedAt: state.updatedAt,
      updatedByTgId: state.updatedByTgId,
    },
    targets,
    progress,
    members,
    candidates,
    evidence: {
      cohortPersistence: stateEvidence.available ? 'available' : 'unavailable',
      activeOffersAggregate: offerAggregate.available ? 'available' : 'unavailable',
    },
    limits: { maxMembers: FOUNDING_COHORT_MAX_MEMBERS },
    truthBoundary: {
      launchReady: 'creator + connected channel + profile/contact/terms review + no blocker + manual launch_ready/onboarded state',
      activeOffers: "barter_offers with status='ACTIVE' owned by cohort creators",
      exitReady: '10 launch-ready creators, 5 active offers, zero blocker defects, one onboarding canary PASS no older than 14 days, named owner and future next review date',
    },
  };
}
