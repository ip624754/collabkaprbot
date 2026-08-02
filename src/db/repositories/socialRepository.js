import { pool } from '../pool.js';
import { CFG } from '../../lib/config.js';
import { buildAllowedPatch, requireExactlyOneAffectedRow } from '../safePatch.js';
import * as R from '../../lib/redis.js';
import {
  drawAndFinalizeGiveawayWinnersAtomicCore,
  replaceGiveawaySponsorsAtomicCore,
} from '../giveawayAtomicCore.js';

// Build-compat: avoid hard ESM named-import crashes if a partial cherry-pick updates
// call-sites but not `src/lib/redis.js`. Fallbacks are atomic-only / no-op.
const redis = R.redis;
const rk = R.k;
const rateLimit = R.rateLimit;
const acquireLock = R.acquireLock;
const releaseLock = R.releaseLock;
const incrWithExpireOnFirst =
  typeof R.incrWithExpireOnFirst === 'function' ? R.incrWithExpireOnFirst : async () => 0;

// ---------------------------------------------------------
// Heavy TX hardening: local statement_timeout (defense-in-depth)
// ---------------------------------------------------------

function getHeavyTxStatementTimeoutMs(opts = {}) {
  const raw = Number(
    opts?.statementTimeoutMs ||
    process.env.PG_HEAVY_TX_STATEMENT_TIMEOUT_MS ||
    process.env.PG_STATEMENT_TIMEOUT_MS ||
    15000
  );
  const ms = Math.floor(raw);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return ms;
}

function sanitizeStatementTimeoutMs(raw) {
  const v = Math.floor(Number(raw));
  if (!Number.isFinite(v) || v <= 0) return null;
  const MIN = 1000;      // 1s
  const MAX = 600000;    // 10m
  if (v < MIN) return MIN;
  if (v > MAX) return MAX;
  return v;
}

async function txSetLocalStatementTimeout(client, ms) {
  const v = sanitizeStatementTimeoutMs(ms);
  if (!v) return;

  // Prefer parameterized set_config to avoid interpolation in utility SET.
  // IMPORTANT: is_local=true makes it transaction-scoped (like SET LOCAL) and also affects lock waits.
  try {
    await client.query("select set_config('statement_timeout', $1, true)", [String(v)]);
  } catch (e) {
    // Fallback (sanitized integer).
    await client.query(`set local statement_timeout to ${v}`);
  }
}

import { listWorkspaces } from './workspacesRepository.js';
import { getBrandProfile } from './brandsRepository.js';

// BEGIN MOVED QUERY BODY: socialRepository
// -----------------------------
// Instagram OAuth (Level A)
// -----------------------------
export async function getIgOAuthAccount(wsId) {
  const r = await pool.query(
    `select ws_id, ig_user_id, ig_username, account_type, status, token_expires_at, scope, connected_at, updated_at
     from ig_oauth_accounts where ws_id=$1`,
    [Number(wsId)]
  );
  return r.rows[0] || null;
}

export async function upsertIgOAuthAccount(wsId, {
  igUserId,
  igUsername,
  accountType = null,
  status = 'CONNECTED',
  accessTokenEnc,
  tokenExpiresAt = null,
  scope = null
} = {}) {
  const r = await pool.query(
    `insert into ig_oauth_accounts
       (ws_id, ig_user_id, ig_username, account_type, status, access_token_enc, token_expires_at, scope, connected_at, updated_at)
     values
       ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
     on conflict (ws_id)
     do update set
       ig_user_id=excluded.ig_user_id,
       ig_username=excluded.ig_username,
       account_type=excluded.account_type,
       status=excluded.status,
       access_token_enc=excluded.access_token_enc,
       token_expires_at=excluded.token_expires_at,
       scope=excluded.scope,
       updated_at=now()
     returning ws_id`,
    [
      Number(wsId),
      String(igUserId),
      String(igUsername),
      accountType ? String(accountType) : null,
      String(status || 'CONNECTED'),
      String(accessTokenEnc || ''),
      tokenExpiresAt ? new Date(tokenExpiresAt) : null,
      scope ? String(scope) : null
    ]
  );
  return r.rows[0] || null;
}

export async function deleteIgOAuthAccount(wsId) {
  await pool.query(`delete from ig_oauth_accounts where ws_id=$1`, [Number(wsId)]);
}

// -----------------------------
// Invite / referral layer (STEP548)
// -----------------------------

const INVITE_SOURCE_BY_PREFIX = {
  ii: 'inline_share',
  il: 'raw_link',
  ic: 'invite_card',
};

const INVITE_PREFIX_BY_SOURCE = {
  inline_share: 'ii',
  raw_link: 'il',
  invite_card: 'ic',
};

function normalizeInviteCode(rawCode) {
  const value = String(rawCode || '').trim().toUpperCase();
  return /^[A-Z0-9]+$/.test(value) ? value : null;
}

function inviteMissingSchemaError(error) {
  const code = String(error?.code || '');
  return code === '42P01' || code === '42703';
}

function inviteRewardsMissingSchemaError(error) {
  const code = String(error?.code || '');
  return code === '42P01' || code === '42703';
}

function safeInviteJsonObject(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function hasInviteValue(v) {
  return v !== null && v !== undefined && String(v).trim().length > 0 && String(v).trim() !== '—';
}

function inviteStructuredContactsCount(obj) {
  const o = obj && typeof obj === 'object' ? obj : {};
  return ['tg', 'email', 'phone', 'site']
    .map((key) => o[key])
    .filter((value) => {
      if (value == null) return false;
      if (typeof value === 'string') return value.trim().length > 0;
      if (Array.isArray(value)) return value.map((x) => String(x || '').trim()).filter(Boolean).length > 0;
      if (typeof value === 'object') {
        return Object.values(value).map((x) => String(x || '').trim()).filter(Boolean).length > 0;
      }
      return String(value).trim().length > 0;
    }).length;
}

function inviteArrayCount(v) {
  if (!Array.isArray(v)) return 0;
  return v.map((x) => String(x || '').trim()).filter(Boolean).length;
}

function isBrandProfileActivationComplete(profile) {
  if (!profile) return false;
  const meta = safeInviteJsonObject(profile.meta);
  const nicheDone = !!String(meta?.niche_key || '').trim() || !!String(profile.niche || '').trim();
  return !!(
    String(profile.brand_name || '').trim() &&
    nicheDone &&
    String(profile.contact || '').trim() &&
    String(profile.brand_link || '').trim()
  );
}

function isWorkspaceProfileActivationComplete(ws) {
  if (!ws) return false;
  const contactsObj = safeInviteJsonObject(ws.profile_contacts);
  const contactOk = inviteStructuredContactsCount(contactsObj) > 0 || hasInviteValue(ws.profile_contact);
  return !!(
    hasInviteValue(ws.profile_title) &&
    contactOk &&
    inviteArrayCount(ws.profile_verticals) > 0 &&
    inviteArrayCount(ws.profile_formats) > 0 &&
    inviteArrayCount(ws.profile_portfolio_urls) > 0 &&
    hasInviteValue(ws.profile_about)
  );
}

export const INVITE_REWARD_PUBLIC_RULES = Object.freeze({
  join: Object.freeze({ rewardType: 'invite_join', points: 2, confirmationHours: 24 }),
  activation: Object.freeze({ rewardType: 'invite_activation', points: 10, confirmationHours: 48 }),
});

export const INVITE_REWARD_CATALOG = Object.freeze({
  pro7: Object.freeze({ key: 'pro7', rewardType: 'pro_7d', costPoints: 100, days: 7, label: '7 дней PRO' }),
  pro30: Object.freeze({ key: 'pro30', rewardType: 'pro_30d', costPoints: 250, days: 30, label: '30 дней PRO' }),
});

function inviteRewardCatalogEntry(rewardKey) {
  return INVITE_REWARD_CATALOG[String(rewardKey || '').trim().toLowerCase()] || null;
}

function inviteRewardsBaseSummary() {
  return {
    enabled: false,
    availablePoints: 0,
    pendingPoints: 0,
    redeemedPoints: 0,
    earnedConfirmedPoints: 0,
    canRedeemPro7: false,
    canRedeemPro30: false,
    nextRewardKey: 'pro7',
    nextRewardCost: INVITE_REWARD_CATALOG.pro7.costPoints,
    nextRewardLabel: INVITE_REWARD_CATALOG.pro7.label,
    pointsToNextReward: INVITE_REWARD_CATALOG.pro7.costPoints,
  };
}

async function insertInviteEarnRewardIfMissing(client, row, rewardType, points, confirmAfter) {
  if (!row?.referrer_user_id || !row?.invited_user_id) return null;
  try {
    const result = await client.query(
      `insert into invite_reward_ledger (
         referrer_user_id,
         invited_user_id,
         invite_id,
         invite_code,
         entry_kind,
         reward_type,
         points,
         status,
         confirm_after,
         meta,
         updated_at
       )
       values ($1, $2, $3, $4, 'earn', $5, $6, 'pending', $7, '{}'::jsonb, now())
       on conflict do nothing
       returning id`,
      [
        Number(row.referrer_user_id),
        Number(row.invited_user_id),
        row.id ? Number(row.id) : null,
        row.invite_code ? String(row.invite_code) : null,
        String(rewardType),
        Number(points),
        confirmAfter ? new Date(confirmAfter) : null,
      ]
    );
    return result.rows[0] || null;
  } catch (error) {
    if (inviteRewardsMissingSchemaError(error)) return null;
    throw error;
  }
}

async function backfillInviteJoinRewards(client, referrerUserId, limit = 200) {
  const uid = Number(referrerUserId || 0);
  if (!uid) return 0;
  const rule = INVITE_REWARD_PUBLIC_RULES.join;
  const rowsResult = await client.query(
    `select inv.id, inv.referrer_user_id, inv.invited_user_id, inv.invite_code, inv.joined_at
       from member_invites inv
       left join invite_reward_ledger l
         on l.referrer_user_id = inv.referrer_user_id
        and l.invited_user_id = inv.invited_user_id
        and l.entry_kind = 'earn'
        and l.reward_type = $3
      where inv.referrer_user_id = $1
        and l.id is null
      order by inv.joined_at asc
      limit $2`,
    [uid, Number(limit || 200), rule.rewardType]
  );
  let created = 0;
  for (const row of rowsResult.rows || []) {
    const joinedAt = row.joined_at ? new Date(row.joined_at) : new Date();
    const confirmAfter = new Date(joinedAt.getTime() + rule.confirmationHours * 60 * 60 * 1000);
    const inserted = await insertInviteEarnRewardIfMissing(client, row, rule.rewardType, rule.points, confirmAfter);
    if (inserted?.id) created += 1;
  }
  return created;
}

async function backfillInviteActivationRewards(client, referrerUserId, limit = 200) {
  const uid = Number(referrerUserId || 0);
  if (!uid) return 0;
  const rule = INVITE_REWARD_PUBLIC_RULES.activation;
  const rowsResult = await client.query(
    `select inv.id, inv.referrer_user_id, inv.invited_user_id, inv.invite_code, inv.activated_at
       from member_invites inv
       left join invite_reward_ledger l
         on l.referrer_user_id = inv.referrer_user_id
        and l.invited_user_id = inv.invited_user_id
        and l.entry_kind = 'earn'
        and l.reward_type = $3
      where inv.referrer_user_id = $1
        and inv.activated_at is not null
        and l.id is null
      order by inv.activated_at asc
      limit $2`,
    [uid, Number(limit || 200), rule.rewardType]
  );
  let created = 0;
  for (const row of rowsResult.rows || []) {
    const activatedAt = row.activated_at ? new Date(row.activated_at) : new Date();
    const confirmAfter = new Date(activatedAt.getTime() + rule.confirmationHours * 60 * 60 * 1000);
    const inserted = await insertInviteEarnRewardIfMissing(client, row, rule.rewardType, rule.points, confirmAfter);
    if (inserted?.id) created += 1;
  }
  return created;
}

async function markInviteActivatedIfEligible(invitedUserId) {
  const uid = Number(invitedUserId || 0);
  if (!uid) return { activated: false, invite: null };
  const attribution = await getInviteAttributionByInvitedUserId(uid);
  if (!attribution?.inviteId) return { activated: false, invite: null };

  let activationComplete = false;
  try {
    const brandProfile = await getBrandProfile(uid);
    if (isBrandProfileActivationComplete(brandProfile)) activationComplete = true;
  } catch (error) {
    if (!inviteMissingSchemaError(error)) throw error;
  }
  if (!activationComplete) {
    const workspaces = await listWorkspaces(uid).catch(() => []);
    activationComplete = Array.isArray(workspaces) && workspaces.some((ws) => isWorkspaceProfileActivationComplete(ws));
  }
  if (!activationComplete) return { activated: false, invite: attribution };

  const updateResult = await pool.query(
    `update member_invites
        set activated_at = coalesce(activated_at, now()),
            updated_at = now()
      where invited_user_id = $1
      returning id, referrer_user_id, invited_user_id, invite_code, joined_at, activated_at`,
    [uid]
  );
  const row = updateResult.rows[0] || null;
  return {
    activated: !!row?.activated_at,
    invite: row || {
      id: attribution.inviteId,
      referrer_user_id: attribution.referrerUserId,
      invited_user_id: attribution.invitedUserId,
      invite_code: attribution.inviteCode,
      activated_at: attribution.activatedAt,
      joined_at: attribution.joinedAt,
    },
  };
}

export async function processInviteRewardsForInvitee(invitedUserId) {
  const uid = Number(invitedUserId || 0);
  if (!uid) return { ok: false, enabled: false, processed: 0 };
  try {
    const activation = await markInviteActivatedIfEligible(uid);
    if (activation?.invite?.referrer_user_id) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await backfillInviteJoinRewards(client, activation.invite.referrer_user_id, 50);
        await backfillInviteActivationRewards(client, activation.invite.referrer_user_id, 50);
        await client.query('commit');
      } catch (error) {
        try { await client.query('rollback'); } catch {}
        if (!inviteRewardsMissingSchemaError(error)) throw error;
      } finally {
        client.release();
      }
    }
    return { ok: true, enabled: true, processed: activation?.activated ? 1 : 0 };
  } catch (error) {
    if (inviteRewardsMissingSchemaError(error)) return { ok: false, enabled: false, processed: 0 };
    throw error;
  }
}

export async function processInviteRewardsForReferrer(referrerUserId, options = {}) {
  const uid = Number(referrerUserId || 0);
  const scanLimit = Math.max(1, Math.min(500, Number(options.limit || 200) || 200));
  if (!uid) return { ok: false, enabled: false, processed: 0 };

  try {
    const pendingActivationResult = await pool.query(
      `select invited_user_id
         from member_invites
        where referrer_user_id = $1
          and activated_at is null
        order by joined_at asc
        limit $2`,
      [uid, scanLimit]
    );
    for (const row of pendingActivationResult.rows || []) {
      try { await markInviteActivatedIfEligible(row.invited_user_id); } catch {}
    }

    const client = await pool.connect();
    try {
      await client.query('begin');
      const createdJoin = await backfillInviteJoinRewards(client, uid, scanLimit);
      const createdActivation = await backfillInviteActivationRewards(client, uid, scanLimit);
      const confirmResult = await client.query(
        `update invite_reward_ledger
            set status = 'confirmed',
                confirmed_at = now(),
                updated_at = now()
          where referrer_user_id = $1
            and entry_kind = 'earn'
            and status = 'pending'
            and confirm_after is not null
            and confirm_after <= now()
          returning id`,
        [uid]
      );
      await client.query('commit');
      return {
        ok: true,
        enabled: true,
        processed: createdJoin + createdActivation + Number(confirmResult.rowCount || 0),
      };
    } catch (error) {
      try { await client.query('rollback'); } catch {}
      if (inviteRewardsMissingSchemaError(error)) return { ok: false, enabled: false, processed: 0 };
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (inviteRewardsMissingSchemaError(error)) return { ok: false, enabled: false, processed: 0 };
    throw error;
  }
}

export async function getInviteRewardsSummary(referrerUserId) {
  const uid = Number(referrerUserId || 0);
  const base = inviteRewardsBaseSummary();
  if (!uid) return base;
  try {
    const result = await pool.query(
      `select
         coalesce(sum(points) filter (where entry_kind = 'earn' and status = 'confirmed'), 0)::int as earned_confirmed_points,
         coalesce(sum(points) filter (where entry_kind = 'earn' and status = 'pending'), 0)::int as pending_points,
         coalesce(sum(points) filter (where entry_kind = 'redeem' and status = 'redeemed'), 0)::int as redeemed_points
       from invite_reward_ledger
      where referrer_user_id = $1`,
      [uid]
    );
    const row = result.rows[0] || {};
    const earnedConfirmedPoints = Number(row.earned_confirmed_points || 0);
    const pendingPoints = Number(row.pending_points || 0);
    const redeemedPoints = Number(row.redeemed_points || 0);
    const availablePoints = Math.max(0, earnedConfirmedPoints - redeemedPoints);

    let nextReward = INVITE_REWARD_CATALOG.pro7;
    let pointsToNextReward = Math.max(0, nextReward.costPoints - availablePoints);
    if (availablePoints >= INVITE_REWARD_CATALOG.pro7.costPoints) {
      nextReward = INVITE_REWARD_CATALOG.pro30;
      pointsToNextReward = Math.max(0, nextReward.costPoints - availablePoints);
    }

    return {
      enabled: true,
      availablePoints,
      pendingPoints,
      redeemedPoints,
      earnedConfirmedPoints,
      canRedeemPro7: availablePoints >= INVITE_REWARD_CATALOG.pro7.costPoints,
      canRedeemPro30: availablePoints >= INVITE_REWARD_CATALOG.pro30.costPoints,
      nextRewardKey: nextReward.key,
      nextRewardCost: nextReward.costPoints,
      nextRewardLabel: nextReward.label,
      pointsToNextReward,
    };
  } catch (error) {
    if (inviteRewardsMissingSchemaError(error)) return base;
    throw error;
  }
}

export async function getInviteRewardsRecentHistory(referrerUserId, limit = 8) {
  const uid = Number(referrerUserId || 0);
  const lim = Math.max(1, Math.min(20, Number(limit || 8)));
  if (!uid) return [];
  try {
    const result = await pool.query(
      `select
         l.id,
         l.entry_kind,
         l.reward_type,
         l.points,
         l.status,
         l.created_at,
         l.confirmed_at,
         l.redeemed_at,
         l.confirm_after,
         l.invited_user_id,
         u.tg_id,
         u.tg_username
       from invite_reward_ledger l
       left join users u on u.id = l.invited_user_id
      where l.referrer_user_id = $1
      order by l.created_at desc
      limit $2`,
      [uid, lim]
    );
    return (result.rows || []).map((row) => ({
      id: Number(row.id || 0),
      entryKind: String(row.entry_kind || ''),
      rewardType: String(row.reward_type || ''),
      points: Number(row.points || 0),
      status: String(row.status || ''),
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
      redeemedAt: row.redeemed_at,
      confirmAfter: row.confirm_after,
      invitedUserId: row.invited_user_id ? Number(row.invited_user_id) : null,
      displayName: row.invited_user_id ? buildInviteMemberLabel(row) : null,
    }));
  } catch (error) {
    if (inviteRewardsMissingSchemaError(error)) return [];
    throw error;
  }
}

async function resolveInviteRewardRedeemTarget(client, userId) {
  const uid = Number(userId || 0);
  if (!uid) return { kind: 'brand_plan' };
  const userResult = await client.query(
    `select exists (select 1 from brand_profiles bp where bp.user_id = $1) as has_brand_profile`,
    [uid]
  );
  if (userResult.rows[0]?.has_brand_profile) return { kind: 'brand_plan' };

  const workspaceResult = await client.query(
    `select id
       from workspaces
      where owner_user_id = $1
      order by created_at desc
      limit 1`,
    [uid]
  );
  if (workspaceResult.rows[0]?.id) return { kind: 'workspace_pro', workspaceId: Number(workspaceResult.rows[0].id) };
  return { kind: 'brand_plan' };
}

export async function redeemInviteReward(referrerUserId, rewardKey) {
  const uid = Number(referrerUserId || 0);
  const reward = inviteRewardCatalogEntry(rewardKey);
  if (!uid || !reward) return { ok: false, reason: 'invalid_reward' };
  const client = await pool.connect();
  try {
    await client.query('begin');
    const lockResult = await client.query(`select pg_try_advisory_xact_lock(hashtext($1)) as ok`, [`invite_reward_redeem:${uid}`]);
    if (!lockResult.rows[0]?.ok) {
      await client.query('rollback');
      return { ok: false, reason: 'redeem_busy' };
    }

    await client.query(
      `update invite_reward_ledger
          set status = 'confirmed',
              confirmed_at = now(),
              updated_at = now()
        where referrer_user_id = $1
          and entry_kind = 'earn'
          and status = 'pending'
          and confirm_after is not null
          and confirm_after <= now()`,
      [uid]
    );

    const balanceResult = await client.query(
      `select
         coalesce(sum(points) filter (where entry_kind = 'earn' and status = 'confirmed'), 0)::int as earned_confirmed_points,
         coalesce(sum(points) filter (where entry_kind = 'redeem' and status = 'redeemed'), 0)::int as redeemed_points
       from invite_reward_ledger
      where referrer_user_id = $1`,
      [uid]
    );
    const row = balanceResult.rows[0] || {};
    const availablePoints = Math.max(0, Number(row.earned_confirmed_points || 0) - Number(row.redeemed_points || 0));
    if (availablePoints < reward.costPoints) {
      await client.query('rollback');
      return { ok: false, reason: 'insufficient_points', availablePoints, requiredPoints: reward.costPoints };
    }

    const target = await resolveInviteRewardRedeemTarget(client, uid);
    let activatedUntil = null;
    if (target.kind === 'workspace_pro' && Number(target.workspaceId || 0)) {
      const wsResult = await client.query(
        `insert into workspace_settings (workspace_id, plan, pro_until, updated_at)
         values ($1, 'pro', now() + ($2::int || ' days')::interval, now())
         on conflict (workspace_id) do update
           set plan = 'pro',
               pro_until = (
                 case
                   when workspace_settings.pro_until is null or workspace_settings.pro_until < now() then now()
                   else workspace_settings.pro_until
                 end
               ) + ($2::int || ' days')::interval,
               updated_at = now()
         returning pro_until`,
        [Number(target.workspaceId), reward.days]
      );
      activatedUntil = wsResult.rows[0]?.pro_until || null;
    } else {
      const planResult = await client.query(
        `update users
            set brand_plan = 'pro',
                brand_plan_until = (
                  case
                    when brand_plan_until is null or brand_plan_until < now() then now()
                    else brand_plan_until
                  end
                ) + ($2::int || ' days')::interval,
                brand_plan_updated_at = now(),
                updated_at = now()
          where id = $1
          returning brand_plan_until`,
        [uid, reward.days]
      );
      activatedUntil = planResult.rows[0]?.brand_plan_until || null;
    }

    await client.query(
      `insert into invite_reward_ledger (
         referrer_user_id,
         entry_kind,
         reward_type,
         points,
         status,
         redeemed_at,
         confirmed_at,
         meta,
         updated_at
       )
       values ($1, 'redeem', $2, $3, 'redeemed', now(), now(), $4::jsonb, now())`,
      [uid, reward.rewardType, reward.costPoints, JSON.stringify({ target: target.kind, workspaceId: target.workspaceId || null, days: reward.days })]
    );

    await client.query('commit');
    return { ok: true, rewardKey: reward.key, label: reward.label, costPoints: reward.costPoints, days: reward.days, target: target.kind, workspaceId: target.workspaceId || null, activatedUntil };
  } catch (error) {
    try { await client.query('rollback'); } catch {}
    if (inviteRewardsMissingSchemaError(error)) return { ok: false, reason: 'invite_rewards_schema_missing' };
    throw error;
  } finally {
    client.release();
  }
}

function inviteSourceLabelPrefix(source) {
  return INVITE_PREFIX_BY_SOURCE[String(source || '').trim().toLowerCase()] || INVITE_PREFIX_BY_SOURCE.raw_link;
}

function buildInviteMemberLabel(row = {}) {
  const username = String(row?.tg_username || '').trim().replace(/^@+/, '');
  if (username) return `@${username}`;
  const tgId = Number(row?.tg_id || 0);
  if (tgId) return `User ${tgId}`;
  return 'User';
}

function supportThreadsMissingSchemaError(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  if (code === '42P01' && msg.includes('support_threads')) return true;
  if (code === '42703' && (msg.includes('support_threads') || msg.includes('support_'))) return true;
  return false;
}

function normalizeSupportThreadStatus(raw, fallback = 'open') {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'open' || v === 'waiting_operator' || v === 'waiting_user' || v === 'closed') return v;
  return fallback;
}

function buildSupportThreadSummary(raw, fallback = '') {
  const base = String(raw || fallback || '').replace(/\s+/g, ' ').trim();
  if (!base) return fallback ? String(fallback) : '';
  return base.length > 240 ? base.slice(0, 237) + '…' : base;
}

export async function getLatestSupportThreadForUser(userId, userTgId) {
  const uid = Number(userId || 0);
  const tgId = Number(userTgId || 0);
  if (!uid && !tgId) return null;
  try {
    const r = await pool.query(
      `select *
         from support_threads
        where ($1::bigint > 0 and user_id = $1)
           or ($2::bigint > 0 and user_tg_id = $2)
        order by (closed_at is null) desc, updated_at desc, id desc
        limit 1`,
      [uid, tgId]
    );
    return r.rows[0] || null;
  } catch (error) {
    if (supportThreadsMissingSchemaError(error)) return null;
    throw error;
  }
}

export async function openOrTouchSupportThreadForUser(userId, userTgId, opts = {}) {
  const uid = Number(userId || 0);
  const tgId = Number(userTgId || 0);
  if (!uid && !tgId) return { persistenceEnabled: false, reason: 'support_thread_missing_user' };

  const source = String(opts?.source || 'telegram_bot').trim() || 'telegram_bot';
  const category = String(opts?.category || '').trim() || null;
  const summary = buildSupportThreadSummary(opts?.summary || '', opts?.fallbackSummary || '');
  const status = normalizeSupportThreadStatus(opts?.status, 'waiting_operator');

  const client = await pool.connect();
  try {
    await client.query('begin');
    const existing = await client.query(
      `select *
         from support_threads
        where (($1::bigint > 0 and user_id = $1) or ($2::bigint > 0 and user_tg_id = $2))
          and closed_at is null
        order by updated_at desc, id desc
        limit 1
        for update`,
      [uid, tgId]
    );
    let row = existing.rows[0] || null;
    let created = false;
    if (row) {
      const updated = await client.query(
        `update support_threads
            set status = $2,
                category = coalesce($3, category),
                source = coalesce(nullif($4, ''), source),
                last_user_message_at = now(),
                last_summary = coalesce(nullif($5, ''), last_summary),
                updated_at = now()
          where id = $1
          returning *`,
        [Number(row.id), status, category, source, summary || null]
      );
      row = updated.rows[0] || row;
    } else {
      const inserted = await client.query(
        `insert into support_threads (
           user_id, user_tg_id, status, category, source,
           opened_at, last_user_message_at, last_summary, updated_at
         )
         values ($1, $2, $3, $4, $5, now(), now(), $6, now())
         returning *`,
        [uid || null, tgId || null, status, category, source, summary || null]
      );
      row = inserted.rows[0] || null;
      created = true;
    }
    await client.query('commit');
    return { persistenceEnabled: true, created, thread: row };
  } catch (error) {
    try { await client.query('rollback'); } catch {}
    if (supportThreadsMissingSchemaError(error)) return { persistenceEnabled: false, reason: 'support_threads_schema_missing' };
    throw error;
  } finally {
    client.release();
  }
}

export async function bindSupportThreadToSupportMessage(threadId, supportChatId, supportMessageId, opts = {}) {
  const tid = Number(threadId || 0);
  if (!tid) return { ok: false, reason: 'thread_id_required' };
  try {
    const r = await pool.query(
      `update support_threads
          set support_chat_id = $2,
              support_message_id = $3,
              support_topic_id = $4,
              updated_at = now()
        where id = $1
        returning id`,
      [tid, Number(supportChatId || 0) || null, Number(supportMessageId || 0) || null, Number(opts?.supportTopicId || 0) || null]
    );
    return { ok: !!r.rows[0], persistenceEnabled: true };
  } catch (error) {
    if (supportThreadsMissingSchemaError(error)) return { ok: false, persistenceEnabled: false, reason: 'support_threads_schema_missing' };
    throw error;
  }
}

export async function setSupportThreadStatusForAdmin(opts = {}) {
  const threadId = Number(opts?.threadId || 0);
  const operatorTgId = Number(opts?.operatorTgId || 0);
  const status = normalizeSupportThreadStatus(opts?.status, 'open');
  const summary = buildSupportThreadSummary(opts?.summary || '');
  if (!threadId) return { ok: false, reason: 'support_thread_target_missing' };
  try {
    const close = status === 'closed';
    const r = await pool.query(
      `update support_threads
          set status = $2,
              closed_at = case when $3 then coalesce(closed_at, now()) else null end,
              last_operator_tg_id = coalesce($4, last_operator_tg_id),
              last_summary = coalesce(nullif($5, ''), last_summary),
              updated_at = now()
        where id = $1
        returning *`,
      [threadId, status, close, operatorTgId || null, summary || null]
    );
    return { ok: !!r.rows[0], persistenceEnabled: true, thread: r.rows[0] || null };
  } catch (error) {
    if (supportThreadsMissingSchemaError(error)) return { ok: false, persistenceEnabled: false, reason: 'support_threads_schema_missing' };
    throw error;
  }
}


export async function markSupportThreadOperatorReply(opts = {}) {
  const threadId = Number(opts?.threadId || 0);
  const userId = Number(opts?.userId || 0);
  const userTgId = Number(opts?.userTgId || 0);
  const operatorTgId = Number(opts?.operatorTgId || 0);
  const close = !!opts?.close;
  const status = close ? 'closed' : normalizeSupportThreadStatus(opts?.status, 'waiting_user');
  const summary = buildSupportThreadSummary(opts?.summary || '');
  if (!threadId && !userId && !userTgId) return { ok: false, reason: 'support_thread_target_missing' };
  const client = await pool.connect();
  try {
    await client.query('begin');
    let row = null;
    if (threadId) {
      const byId = await client.query('select * from support_threads where id = $1 limit 1 for update', [threadId]);
      row = byId.rows[0] || null;
    }
    if (!row) {
      const byUser = await client.query(
        `select *
           from support_threads
          where (($1::bigint > 0 and user_id = $1) or ($2::bigint > 0 and user_tg_id = $2))
          order by (closed_at is null) desc, updated_at desc, id desc
          limit 1
          for update`,
        [userId, userTgId]
      );
      row = byUser.rows[0] || null;
    }
    if (!row) {
      await client.query('commit');
      return { ok: false, persistenceEnabled: true, reason: 'support_thread_not_found' };
    }
    const updated = await client.query(
      `update support_threads
          set status = $2,
              closed_at = case when $3 then coalesce(closed_at, now()) else null end,
              last_operator_reply_at = now(),
              last_operator_tg_id = $4,
              last_summary = coalesce(nullif($5, ''), last_summary),
              updated_at = now()
        where id = $1
        returning *`,
      [Number(row.id), status, close, operatorTgId || null, summary || null]
    );
    await client.query('commit');
    return { ok: true, persistenceEnabled: true, thread: updated.rows[0] || row };
  } catch (error) {
    try { await client.query('rollback'); } catch {}
    if (supportThreadsMissingSchemaError(error)) return { ok: false, persistenceEnabled: false, reason: 'support_threads_schema_missing' };
    throw error;
  } finally {
    client.release();
  }
}



export async function markSupportThreadUserFollowup(opts = {}) {
  const threadId = Number(opts?.threadId || 0);
  const userId = Number(opts?.userId || 0);
  const userTgId = Number(opts?.userTgId || 0);
  const summary = buildSupportThreadSummary(opts?.summary || '', opts?.fallbackSummary || '');
  if (!threadId && !userId && !userTgId) return { ok: false, reason: 'support_thread_target_missing' };
  const client = await pool.connect();
  try {
    await client.query('begin');
    let row = null;
    if (threadId) {
      const byId = await client.query('select * from support_threads where id = $1 limit 1 for update', [threadId]);
      row = byId.rows[0] || null;
    }
    if (!row) {
      const byUser = await client.query(
        `select *
           from support_threads
          where (($1::bigint > 0 and user_id = $1) or ($2::bigint > 0 and user_tg_id = $2))
          order by (closed_at is null) desc, updated_at desc, id desc
          limit 1
          for update`,
        [userId, userTgId]
      );
      row = byUser.rows[0] || null;
    }
    if (!row) {
      await client.query('commit');
      return { ok: false, persistenceEnabled: true, reason: 'support_thread_not_found' };
    }
    const updated = await client.query(
      `update support_threads
          set status = 'waiting_operator',
              closed_at = null,
              last_user_message_at = now(),
              last_summary = coalesce(nullif($2, ''), last_summary),
              updated_at = now()
        where id = $1
        returning *`,
      [Number(row.id), summary || null]
    );
    await client.query('commit');
    return { ok: true, persistenceEnabled: true, thread: updated.rows[0] || row };
  } catch (error) {
    try { await client.query('rollback'); } catch {}
    if (supportThreadsMissingSchemaError(error)) return { ok: false, persistenceEnabled: false, reason: 'support_threads_schema_missing' };
    throw error;
  } finally {
    client.release();
  }
}

export async function getSupportThreadBuckets(daysClosedRecent = 7) {
  const days = Math.max(1, Number(daysClosedRecent || 7) || 7);
  try {
    const countsRes = await pool.query(
      `select
         count(*) filter (where status = 'open')::int as open_cnt,
         count(*) filter (where status = 'waiting_operator')::int as waiting_operator_cnt,
         count(*) filter (where status = 'waiting_user')::int as waiting_user_cnt,
         count(*) filter (where status = 'closed' and updated_at >= (now() - ($1::int * interval '1 day')))::int as closed_recent_cnt,
         count(*) filter (where closed_at is null)::int as active_cnt
       from support_threads`,
      [days]
    );
    const row = countsRes.rows[0] || {};
    return {
      persistenceEnabled: true,
      counts: {
        open: Number(row.open_cnt || 0),
        waiting_operator: Number(row.waiting_operator_cnt || 0),
        waiting_user: Number(row.waiting_user_cnt || 0),
        closed_recent: Number(row.closed_recent_cnt || 0),
        active: Number(row.active_cnt || 0),
      },
    };
  } catch (error) {
    if (supportThreadsMissingSchemaError(error)) return { persistenceEnabled: false, reason: 'support_threads_schema_missing', counts: null };
    throw error;
  }
}

function normalizeSupportThreadListStatus(raw) {
  const v = String(raw || 'all').trim().toLowerCase();
  if (['all', 'open', 'waiting_operator', 'waiting_user', 'closed', 'closed_recent'].includes(v)) return v;
  return 'all';
}

export async function listSupportThreadsForAdmin(opts = {}) {
  const status = normalizeSupportThreadListStatus(opts?.status);
  const page = Math.max(0, Number(opts?.page || 0) || 0);
  const limit = Math.min(20, Math.max(1, Number(opts?.limit || 8) || 8));
  const offset = page * limit;
  const daysClosedRecent = Math.max(1, Number(opts?.daysClosedRecent || 7) || 7);
  const selectSql = `select
         st.id,
         st.user_id,
         st.user_tg_id,
         st.status,
         st.category,
         st.source,
         st.support_chat_id,
         st.support_message_id,
         st.support_topic_id,
         st.opened_at,
         st.last_user_message_at,
         st.last_operator_reply_at,
         st.closed_at,
         st.last_operator_tg_id,
         st.last_summary,
         st.updated_at,
         u.username as username
       from support_threads st
       left join users u on u.id = st.user_id`;
  try {
    let totalRes;
    let rowsRes;
    if (status === 'all') {
      totalRes = await pool.query(`select count(*)::int as total from support_threads`);
      rowsRes = await pool.query(
        `${selectSql}
         order by (st.closed_at is null) desc, st.updated_at desc, st.id desc
         limit $1 offset $2`,
        [limit, offset]
      );
    } else if (status === 'closed_recent') {
      totalRes = await pool.query(
        `select count(*)::int as total
           from support_threads st
          where st.status = 'closed'
            and st.updated_at >= (now() - ($1::int * interval '1 day'))`,
        [daysClosedRecent]
      );
      rowsRes = await pool.query(
        `${selectSql}
          where st.status = 'closed'
            and st.updated_at >= (now() - ($1::int * interval '1 day'))
         order by st.updated_at desc, st.id desc
         limit $2 offset $3`,
        [daysClosedRecent, limit, offset]
      );
    } else {
      totalRes = await pool.query(
        `select count(*)::int as total
           from support_threads st
          where st.status = $1`,
        [status]
      );
      rowsRes = await pool.query(
        `${selectSql}
          where st.status = $1
         order by (st.closed_at is null) desc, st.updated_at desc, st.id desc
         limit $2 offset $3`,
        [status, limit, offset]
      );
    }
    return {
      persistenceEnabled: true,
      status,
      page,
      limit,
      total: Number(totalRes.rows?.[0]?.total || 0),
      items: rowsRes.rows || [],
    };
  } catch (error) {
    if (supportThreadsMissingSchemaError(error)) return { persistenceEnabled: false, reason: 'support_threads_schema_missing', status, page, limit, total: 0, items: [] };
    throw error;
  }
}

export async function getSupportThreadByIdForAdmin(threadId) {
  const tid = Number(threadId || 0);
  if (!tid) return null;
  try {
    const r = await pool.query(
      `select
         st.id,
         st.user_id,
         st.user_tg_id,
         st.status,
         st.category,
         st.source,
         st.support_chat_id,
         st.support_message_id,
         st.support_topic_id,
         st.opened_at,
         st.last_user_message_at,
         st.last_operator_reply_at,
         st.closed_at,
         st.last_operator_tg_id,
         st.last_summary,
         st.updated_at,
         u.username as username
       from support_threads st
       left join users u on u.id = st.user_id
      where st.id = $1
      limit 1`,
      [tid]
    );
    return r.rows[0] || null;
  } catch (error) {
    if (supportThreadsMissingSchemaError(error)) return null;
    throw error;
  }
}
export function buildInviteCodeFromTelegramUserId(telegramUserId) {
  const numeric = Number.parseInt(String(telegramUserId || ''), 10);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric.toString(36).toUpperCase();
}

export function parseInviteCodeToTelegramUserId(inviteCode) {
  const normalized = normalizeInviteCode(inviteCode);
  if (!normalized) return null;
  const numeric = Number.parseInt(normalized, 36);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function buildInviteStartParam({ inviteCode, source = 'raw_link' } = {}) {
  const normalized = normalizeInviteCode(inviteCode);
  if (!normalized) return null;
  return `${inviteSourceLabelPrefix(source)}_${normalized}`;
}

export function parseInviteStartParam(startParam) {
  const raw = String(startParam || '').trim();
  const match = raw.match(/^(ii|il|ic)_([A-Za-z0-9]+)$/i);
  if (!match) return null;
  const inviteCode = normalizeInviteCode(match[2]);
  if (!inviteCode) return null;
  const referrerTelegramUserId = parseInviteCodeToTelegramUserId(inviteCode);
  if (!referrerTelegramUserId) return null;
  const prefix = String(match[1] || '').toLowerCase();
  return {
    raw,
    inviteCode,
    prefix,
    source: INVITE_SOURCE_BY_PREFIX[prefix] || 'raw_link',
    referrerTelegramUserId,
  };
}

export function buildInviteLink({ botUsername, inviteCode, source = 'raw_link' } = {}) {
  const username = String(botUsername || '').trim().replace(/^@+/, '');
  const startParam = buildInviteStartParam({ inviteCode, source });
  if (!username || !startParam) return null;
  return `https://t.me/${username}?start=${encodeURIComponent(startParam)}`;
}

export async function findUserByTelegramId(tgId) {
  const n = Number(tgId || 0);
  if (!n) return null;
  const r = await pool.query(
    `select id, tg_id, tg_username, created_at, updated_at
       from users
      where tg_id=$1
      limit 1`,
    [n]
  );
  return r.rows[0] || null;
}

export async function getInviteAttributionByInvitedUserId(invitedUserId) {
  const uid = Number(invitedUserId || 0);
  if (!uid) return null;
  try {
    const r = await pool.query(
      `select inv.id as invite_id,
              inv.referrer_user_id,
              inv.invited_user_id,
              inv.invite_code,
              inv.source,
              inv.start_param,
              inv.joined_at,
              inv.activated_at,
              ref.tg_id as referrer_tg_id,
              ref.tg_username as referrer_tg_username
         from member_invites inv
         join users ref on ref.id = inv.referrer_user_id
        where inv.invited_user_id = $1
        limit 1`,
      [uid]
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      inviteId: row.invite_id,
      referrerUserId: row.referrer_user_id,
      invitedUserId: row.invited_user_id,
      inviteCode: row.invite_code,
      source: row.source,
      startParam: row.start_param,
      joinedAt: row.joined_at,
      activatedAt: row.activated_at,
      invitedBy: {
        tgId: row.referrer_tg_id,
        tgUsername: row.referrer_tg_username || null,
        displayName: buildInviteMemberLabel({ tg_id: row.referrer_tg_id, tg_username: row.referrer_tg_username })
      }
    };
  } catch (error) {
    if (inviteMissingSchemaError(error)) return null;
    throw error;
  }
}

export async function loadInviteSnapshotByUserId({ userId, telegramUserId, botUsername } = {}) {
  const uid = Number(userId || 0);
  const tgId = Number(telegramUserId || 0);
  const inviteCode = buildInviteCodeFromTelegramUserId(tgId);
  const inviteLink = buildInviteLink({ botUsername, inviteCode, source: 'raw_link' });
  const inlineInviteLink = buildInviteLink({ botUsername, inviteCode, source: 'inline_share' });
  const inviteCardLink = buildInviteLink({ botUsername, inviteCode, source: 'invite_card' });

  const base = {
    persistenceEnabled: false,
    inviteCode,
    inviteLink,
    inlineInviteLink,
    inviteCardLink,
    shareInlineQuery: 'invite',
    invitedCount: 0,
    activatedCount: 0,
    invitedBy: null,
    invited: [],
    reason: 'invite_tracking_unavailable'
  };

  if (!uid) return base;

  try {
    const countsResult = await pool.query(
      `select
         count(*)::int as invited_count,
         count(*) filter (where inv.activated_at is not null)::int as activated_count
       from member_invites inv
      where inv.referrer_user_id = $1`,
      [uid]
    );

    const recentResult = await pool.query(
      `select
         inv.id as invite_id,
         inv.source,
         inv.joined_at,
         inv.activated_at,
         invited.tg_id,
         invited.tg_username
       from member_invites inv
       join users invited on invited.id = inv.invited_user_id
      where inv.referrer_user_id = $1
      order by inv.joined_at desc
      limit 5`,
      [uid]
    );

    const invitedBy = await getInviteAttributionByInvitedUserId(uid);

    return {
      ...base,
      persistenceEnabled: true,
      invitedCount: Number(countsResult.rows[0]?.invited_count || 0),
      activatedCount: Number(countsResult.rows[0]?.activated_count || 0),
      invitedBy: invitedBy?.invitedBy || null,
      invited: (recentResult.rows || []).map((row) => ({
        inviteId: row.invite_id,
        source: row.source,
        joinedAt: row.joined_at,
        activatedAt: row.activated_at,
        displayName: buildInviteMemberLabel(row),
        status: row.activated_at ? 'activated' : 'joined'
      })),
      reason: 'invite_snapshot_loaded'
    };
  } catch (error) {
    if (inviteMissingSchemaError(error)) return base;
    throw error;
  }
}



export async function getInviteAdminVisibilityOverview({ staleHours = 6, topLimit = 5 } = {}) {
  const lim = Math.max(1, Math.min(20, Number(topLimit || 5)));
  const stale = Math.max(1, Math.min(240, Number(staleHours || 6)));
  const base = {
    enabled: false,
    summary: {
      inviters: 0,
      invited: 0,
      activated: 0,
      pendingRewards: 0,
      stalePendingRewards: 0,
      staleJoinPendingRewards: 0,
      staleActivationPendingRewards: 0,
      redeemedOps: 0,
      redeemedPoints: 0,
    },
    topInviters: [],
    stalePending: [],
    topRedeemers: [],
  };
  try {
    const [summaryRes, invitersRes, staleRes, redeemersRes] = await Promise.all([
      pool.query(
        `select
           count(distinct inv.referrer_user_id)::int as inviters,
           count(*)::int as invited,
           count(*) filter (where inv.activated_at is not null)::int as activated,
           coalesce((select count(*)::int from invite_reward_ledger l where l.entry_kind='earn' and l.status='pending'), 0)::int as pending_rewards,
           coalesce((select count(*)::int from invite_reward_ledger l where l.entry_kind='earn' and l.status='pending' and l.confirm_after is not null and l.confirm_after <= now() - ($1::text || ' hours')::interval), 0)::int as stale_pending_rewards,
           coalesce((select count(*)::int from invite_reward_ledger l where l.entry_kind='earn' and l.status='pending' and l.reward_type='invite_join' and l.confirm_after is not null and l.confirm_after <= now() - ($1::text || ' hours')::interval), 0)::int as stale_join_pending_rewards,
           coalesce((select count(*)::int from invite_reward_ledger l where l.entry_kind='earn' and l.status='pending' and l.reward_type='invite_activation' and l.confirm_after is not null and l.confirm_after <= now() - ($1::text || ' hours')::interval), 0)::int as stale_activation_pending_rewards,
           coalesce((select count(*)::int from invite_reward_ledger l where l.entry_kind='redeem' and l.status='redeemed'), 0)::int as redeemed_ops,
           coalesce((select sum(points)::int from invite_reward_ledger l where l.entry_kind='redeem' and l.status='redeemed'), 0)::int as redeemed_points
         from member_invites inv`,
        [String(stale)]
      ),
      pool.query(
        `with reward_rollup as (
           select
             l.referrer_user_id,
             coalesce(sum(l.points) filter (where l.entry_kind='earn' and l.status='confirmed'), 0)::int as earned_confirmed,
             coalesce(sum(l.points) filter (where l.entry_kind='earn' and l.status='pending'), 0)::int as pending_points,
             coalesce(sum(l.points) filter (where l.entry_kind='redeem' and l.status='redeemed'), 0)::int as redeemed_points
           from invite_reward_ledger l
           group by l.referrer_user_id
         )
         select
           inv.referrer_user_id,
           u.tg_id,
           u.tg_username,
           count(*)::int as invited_count,
           count(*) filter (where inv.activated_at is not null)::int as activated_count,
           coalesce(rr.earned_confirmed, 0)::int as earned_confirmed,
           coalesce(rr.pending_points, 0)::int as pending_points,
           coalesce(rr.redeemed_points, 0)::int as redeemed_points
         from member_invites inv
         join users u on u.id = inv.referrer_user_id
         left join reward_rollup rr on rr.referrer_user_id = inv.referrer_user_id
         group by inv.referrer_user_id, u.tg_id, u.tg_username, rr.earned_confirmed, rr.pending_points, rr.redeemed_points
         order by activated_count desc, invited_count desc, inv.referrer_user_id desc
         limit $1`,
        [lim]
      ),
      pool.query(
        `select
           l.referrer_user_id,
           u.tg_id,
           u.tg_username,
           l.reward_type,
           count(*)::int as pending_count,
           min(l.confirm_after) as oldest_confirm_after,
           coalesce(sum(l.points), 0)::int as pending_points,
           floor(extract(epoch from (now() - min(l.confirm_after))) / 3600)::int as overdue_hours
         from invite_reward_ledger l
         join users u on u.id = l.referrer_user_id
         where l.entry_kind='earn'
           and l.status='pending'
           and l.confirm_after is not null
           and l.confirm_after <= now() - ($1::text || ' hours')::interval
         group by l.referrer_user_id, u.tg_id, u.tg_username, l.reward_type
         order by overdue_hours desc, pending_count desc, oldest_confirm_after asc nulls last
         limit $2`,
        [String(stale), lim]
      ),
      pool.query(
        `select
           l.referrer_user_id,
           u.tg_id,
           u.tg_username,
           count(*)::int as redeem_count,
           coalesce(sum(l.points), 0)::int as redeemed_points,
           max(l.redeemed_at) as last_redeemed_at
         from invite_reward_ledger l
         join users u on u.id = l.referrer_user_id
         where l.entry_kind='redeem'
           and l.status='redeemed'
         group by l.referrer_user_id, u.tg_id, u.tg_username
         order by redeemed_points desc, redeem_count desc, max(l.redeemed_at) desc nulls last
         limit $1`,
        [lim]
      ),
    ]);
    const srow = summaryRes.rows[0] || {};
    return {
      enabled: true,
      summary: {
        inviters: Number(srow.inviters || 0),
        invited: Number(srow.invited || 0),
        activated: Number(srow.activated || 0),
        pendingRewards: Number(srow.pending_rewards || 0),
        stalePendingRewards: Number(srow.stale_pending_rewards || 0),
        staleJoinPendingRewards: Number(srow.stale_join_pending_rewards || 0),
        staleActivationPendingRewards: Number(srow.stale_activation_pending_rewards || 0),
        redeemedOps: Number(srow.redeemed_ops || 0),
        redeemedPoints: Number(srow.redeemed_points || 0),
      },
      topInviters: (invitersRes.rows || []).map((row) => ({
        referrerUserId: Number(row.referrer_user_id || 0),
        displayName: buildInviteMemberLabel(row),
        invitedCount: Number(row.invited_count || 0),
        activatedCount: Number(row.activated_count || 0),
        earnedConfirmedPoints: Number(row.earned_confirmed || 0),
        pendingPoints: Number(row.pending_points || 0),
        redeemedPoints: Number(row.redeemed_points || 0),
      })),
      stalePending: (staleRes.rows || []).map((row) => ({
        referrerUserId: Number(row.referrer_user_id || 0),
        displayName: buildInviteMemberLabel(row),
        rewardType: String(row.reward_type || ''),
        pendingCount: Number(row.pending_count || 0),
        pendingPoints: Number(row.pending_points || 0),
        oldestConfirmAfter: row.oldest_confirm_after || null,
        overdueHours: Number(row.overdue_hours || 0),
      })),
      topRedeemers: (redeemersRes.rows || []).map((row) => ({
        referrerUserId: Number(row.referrer_user_id || 0),
        displayName: buildInviteMemberLabel(row),
        redeemCount: Number(row.redeem_count || 0),
        redeemedPoints: Number(row.redeemed_points || 0),
        lastRedeemedAt: row.last_redeemed_at || null,
      })),
    };
  } catch (error) {
    if (inviteMissingSchemaError(error) || inviteRewardsMissingSchemaError(error)) return base;
    throw error;
  }
}

export async function attemptInviteAttribution({ telegramUserId, telegramUsername = null, startParam = null } = {}) {
  const parsed = parseInviteStartParam(startParam);
  if (!parsed) {
    return {
      persistenceEnabled: false,
      created: false,
      ignored: true,
      reason: 'start_param_not_invite'
    };
  }

  const tgId = Number(telegramUserId || 0);
  if (!tgId) {
    return {
      persistenceEnabled: true,
      created: false,
      invalid: true,
      reason: 'invalid_telegram_user'
    };
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    const existingUserResult = await client.query(
      `select id, tg_id, tg_username
         from users
        where tg_id = $1
        limit 1`,
      [tgId]
    );
    const existingUser = existingUserResult.rows[0] || null;

    const upsertedResult = await client.query(
      `insert into users (tg_id, tg_username)
       values ($1, $2)
       on conflict (tg_id)
       do update set tg_username = coalesce(excluded.tg_username, users.tg_username), updated_at = now()
       returning id, tg_id, tg_username`,
      [tgId, telegramUsername || null]
    );
    const invitedUser = upsertedResult.rows[0] || existingUser;

    if (String(invitedUser?.tg_id || '') === String(parsed.referrerTelegramUserId)) {
      await client.query('commit');
      return {
        persistenceEnabled: true,
        created: false,
        invalid: true,
        reason: 'self_referral'
      };
    }

    const existingAttributionResult = await client.query(
      `select id from member_invites where invited_user_id = $1 limit 1`,
      [Number(invitedUser?.id || 0)]
    );
    if (existingAttributionResult.rows[0]) {
      await client.query('commit');
      const existing = await getInviteAttributionByInvitedUserId(invitedUser.id);
      return {
        persistenceEnabled: true,
        created: false,
        alreadyLinked: true,
        reason: 'already_linked',
        invitedBy: existing?.invitedBy || null
      };
    }

    if (existingUser) {
      await client.query('commit');
      return {
        persistenceEnabled: true,
        created: false,
        existingUser: true,
        reason: 'existing_user_not_eligible'
      };
    }

    const referrerResult = await client.query(
      `select id, tg_id, tg_username
         from users
        where tg_id = $1
        limit 1`,
      [parsed.referrerTelegramUserId]
    );
    const referrerUser = referrerResult.rows[0] || null;
    if (!referrerUser) {
      await client.query('commit');
      return {
        persistenceEnabled: true,
        created: false,
        invalid: true,
        reason: 'unknown_referrer'
      };
    }

    const insertResult = await client.query(
      `insert into member_invites (
         referrer_user_id,
         invited_user_id,
         invite_code,
         source,
         status,
         start_param,
         joined_at,
         updated_at
       )
       values ($1, $2, $3, $4, 'created', $5, now(), now())
       on conflict (invited_user_id) do nothing
       returning id, referrer_user_id, invited_user_id, invite_code, joined_at, activated_at`,
      [referrerUser.id, invitedUser.id, parsed.inviteCode, parsed.source, parsed.raw]
    );

    if (insertResult.rows[0]) {
      try {
        const joinedAt = insertResult.rows[0]?.joined_at ? new Date(insertResult.rows[0].joined_at) : new Date();
        const confirmAfter = new Date(joinedAt.getTime() + 24 * 60 * 60 * 1000);
        await insertInviteEarnRewardIfMissing(client, insertResult.rows[0], 'invite_join', 2, confirmAfter);
      } catch (error) {
        if (!inviteRewardsMissingSchemaError(error)) throw error;
      }
    }

    await client.query('commit');

    if (!insertResult.rows[0]) {
      const existing = await getInviteAttributionByInvitedUserId(invitedUser.id);
      return {
        persistenceEnabled: true,
        created: false,
        alreadyLinked: true,
        reason: 'already_linked',
        invitedBy: existing?.invitedBy || null
      };
    }

    return {
      persistenceEnabled: true,
      created: true,
      reason: 'invite_linked',
      inviteId: insertResult.rows[0]?.id || null,
      source: parsed.source,
      invitedBy: {
        tgId: referrerUser.tg_id,
        tgUsername: referrerUser.tg_username || null,
        displayName: buildInviteMemberLabel(referrerUser)
      }
    };
  } catch (error) {
    try { await client.query('rollback'); } catch {}
    if (inviteMissingSchemaError(error)) {
      return {
        persistenceEnabled: false,
        created: false,
        reason: 'invite_schema_missing'
      };
    }
    throw error;
  } finally {
    client.release();
  }
}
// END MOVED QUERY BODY: socialRepository
