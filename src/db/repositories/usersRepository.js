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


// BEGIN MOVED QUERY BODY: usersRepository
// Users
export async function upsertUser(tgId, username) {
  // Rolling-upgrade safety: some deployments may not yet have soft-delete columns.
  // In that case, fall back to the minimal query.
  try {
    const r = await pool.query(
      `insert into users (tg_id, tg_username)
       values ($1, $2)
       on conflict (tg_id)
       do update set
         -- When user is tombstoned, do not re-introduce tg_username from Telegram updates.
         tg_username = case
           when coalesce(users.is_deleted, false) then users.tg_username
           else coalesce(excluded.tg_username, users.tg_username)
         end,
         updated_at = now()
       returning id, tg_id, tg_username, banned_at, is_deleted, deleted_at`,
      [tgId, username || null]
    );
    return r.rows[0];
  } catch (e) {
    // 42703 = undefined_column
    if (e && e.code === '42703') {
      const r = await pool.query(
        `insert into users (tg_id, tg_username)
         values ($1, $2)
         on conflict (tg_id)
         do update set tg_username = coalesce(excluded.tg_username, users.tg_username), updated_at = now()
         returning id, tg_id, tg_username`,
        [tgId, username || null]
      );
      return r.rows[0];
    }
    throw e;
  }
}

// Soft delete / tombstone (PII wipe) for the user's own account.
// Properties:
// - DB-truth only (works even if Redis is degraded).
// - Idempotent: repeated calls keep the account deleted.
// - Does not delete payments/history, only wipes PII and disables discovery.
export async function tombstoneUser(userId, opts = {}) {
  const uid = Number(userId || 0);
  if (!uid) throw new Error('userId required');

  const client = await pool.connect();
  try {
    await client.query('begin');

    const stm = Math.floor(Number(opts?.statementTimeoutMs || 8000));
    if (Number.isFinite(stm) && stm > 0) {
      await txSetLocalStatementTimeout(client, stm);
    }

    const r = await client.query(
      `update users
         set is_deleted = true,
             deleted_at = coalesce(deleted_at, now()),
             tg_username = null,
             updated_at = now()
       where id = $1
       returning id, tg_id, is_deleted, deleted_at`,
      [uid]
    );

    // Brand profile is optional (brand users only) — wipe if exists.
    try {
      await client.query(
        `update brand_profiles
            set brand_name=null,
                brand_link=null,
                contact=null,
                niche=null,
                geo=null,
                collab_types=null,
                budget=null,
                goals=null,
                requirements=null,
                meta=null,
                updated_at=now()
          where user_id=$1`,
        [uid]
      );
    } catch (e) {
      // 42P01 = undefined_table (rolling upgrade safety)
      if (!(e && e.code === '42P01')) throw e;
    }

    // Revoke team access edges where this user participates.
    try {
      await client.query(
        `delete from brand_managers where brand_user_id=$1 or manager_user_id=$1`,
        [uid]
      );
    } catch (e) {
      if (!(e && e.code === '42P01')) throw e;
    }

    // Workspace editors/curators edges.
    try {
      await client.query(`delete from workspace_curators where user_id=$1`, [uid]);
    } catch (e) {
      if (!(e && e.code === '42P01')) throw e;
    }
    try {
      await client.query(`delete from workspace_editors where user_id=$1`, [uid]);
    } catch (e) {
      if (!(e && e.code === '42P01')) throw e;
    }

    // Wipe creator profile contacts + hide from discovery for owned workspaces.
    try {
      await client.query(
        `update workspace_settings s
            set network_enabled = false,
                curator_enabled = false,
                profile_contact = null,
                profile_contacts = null,
                profile_contacts_v = null,
                profile_ig = null,
                profile_portfolio_urls = null,
                profile_about = null,
                profile_title = null,
                profile_niche = null,
                profile_geo = null,
                profile_verticals = null,
                profile_formats = null,
                profile_mode = null,
                updated_at = now()
          where s.workspace_id in (select id from workspaces where owner_user_id=$1)`,
        [uid]
      );
    } catch (e) {
      if (!(e && e.code === '42P01')) throw e;
    }

    // IG OAuth accounts for owned workspaces (if feature enabled / table exists).
    try {
      await client.query(
        `delete from ig_oauth_accounts where ws_id in (select id from workspaces where owner_user_id=$1)`,
        [uid]
      );
    } catch (e) {
      if (!(e && e.code === '42P01')) throw e;
    }

    // Verification requests may contain PII in submitted_text.
    try {
      await client.query(
        `update user_verifications
            set submitted_text = null,
                rejection_reason = null,
                updated_at = now()
          where user_id=$1`,
        [uid]
      );
    } catch (e) {
      if (!(e && e.code === '42P01')) throw e;
    }

    await client.query('commit');
    return r.rows[0] || null;
  } catch (e) {
    try { await client.query('rollback'); } catch {}
    // 42703 = undefined_column (soft-delete migration missing)
    if (e && e.code === '42703') {
      const err = new Error('missing_soft_delete_columns');
      err.code = 'MISSING_SOFT_DELETE_COLUMNS';
      throw err;
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function restoreUser(userId, opts = {}) {
  const uid = Number(userId || 0);
  if (!uid) throw new Error('userId required');
  try {
    const r = await pool.query(
      `update users
          set is_deleted = false,
              deleted_at = null,
              updated_at = now()
        where id=$1
        returning id, tg_id, tg_username, is_deleted, deleted_at`,
      [uid]
    );
    return r.rows[0] || null;
  } catch (e) {
    if (e && e.code === '42703') {
      const err = new Error('missing_soft_delete_columns');
      err.code = 'MISSING_SOFT_DELETE_COLUMNS';
      throw err;
    }
    throw e;
  }
}


// -----------------------------
// Analytics events (optional)
// -----------------------------
export async function trackEvent(name, { userId = null, wsId = null, meta = {} } = {}) {
  if (!CFG.ANALYTICS_ENABLED) return null;
  const n = String(name || '').trim();
  if (!n) return null;
  try {
    await pool.query(
      `insert into events (user_id, ws_id, name, meta) values ($1, $2, $3, $4::jsonb)`,
      [userId ? Number(userId) : null, wsId ? Number(wsId) : null, n, JSON.stringify(meta || {})]
    );
    return true;
  } catch (e) {
    // Never break bot UX if analytics table/migration is missing.
    return null;
  }
}


// -----------------------------
// Analytics aggregates (optional)
// -----------------------------
export async function getAnalyticsTopline({ windowDays = 14 } = {}) {
  if (!CFG.ANALYTICS_ENABLED) return null;
  const wd = Math.max(1, Number(windowDays) || 14);

  try {
    const r1 = await pool.query(
      `select
         count(distinct user_id) filter (where user_id is not null and ts >= now() - interval '1 day')::int as dau_24h,
         count(distinct user_id) filter (where user_id is not null and ts >= now() - interval '7 day')::int as wau_7d,
         count(distinct user_id) filter (where user_id is not null and ts >= now() - interval '30 day')::int as mau_30d
       from events`
    );

    const r2 = await pool.query(
      `select
         count(*) filter (where name='paywall_shown')::int as paywall_events,
         count(distinct user_id) filter (where name='paywall_shown' and user_id is not null)::int as paywall_users,

         count(*) filter (
           where name='payment_success'
             and ((meta->>'payload') like 'brand_%' or (meta->>'payload') like 'bplan_%')
         )::int as brandpay_events,
         count(distinct user_id) filter (
           where name='payment_success'
             and user_id is not null
             and ((meta->>'payload') like 'brand_%' or (meta->>'payload') like 'bplan_%')
         )::int as brandpay_users,

         count(*) filter (where name='ws_created')::int as ws_events,
         count(distinct user_id) filter (where name='ws_created' and user_id is not null)::int as ws_users,

         count(*) filter (where name='gw_published')::int as gw_events,
         count(distinct user_id) filter (where name='gw_published' and user_id is not null)::int as gw_users
       from events
       where ts >= now() - ($1::int || ' days')::interval`,
      [wd]
    );

    return { ...(r1.rows[0] || {}), ...(r2.rows[0] || {}), window_days: wd };
  } catch {
    // Missing table/migration or any DB error should not break admin UX.
    return null;
  }
}

export async function getAnalyticsDaily(days = 14) {
  if (!CFG.ANALYTICS_ENABLED) return [];
  const d = Math.max(1, Math.min(90, Number(days) || 14));

  try {
    const r = await pool.query(
      `select
         (ts at time zone 'Europe/Moscow')::date as day,
         count(distinct user_id) filter (where user_id is not null)::int as dau,
         count(*) filter (where name='start')::int as starts,
         count(*) filter (where name='ws_created')::int as ws_created,
         count(*) filter (where name='gw_published')::int as gw_published,
         count(*) filter (where name='bx_offer_published')::int as bx_offer_published,
         count(*) filter (where name='intro_attempt')::int as intro_attempt,
         count(*) filter (where name='paywall_shown')::int as paywall_shown,
         count(*) filter (
           where name='payment_success'
             and ((meta->>'payload') like 'brand_%' or (meta->>'payload') like 'bplan_%')
         )::int as brand_purchases
       from events
       where ts >= now() - ($1::int || ' days')::interval
       group by day
       order by day desc`,
      [d]
    );
    return r.rows || [];
  } catch {
    return [];
  }
}


// -----------------------------
// Admin metrics snapshot (works even when analytics disabled)
// -----------------------------
export async function getAdminMetricsSnapshot(windowDays = 14) {
  const wd = Math.max(1, Math.min(90, Number(windowDays) || 14));

  // Base entity counts
  const out = { window_days: wd };

  try {
    const r = await pool.query(`
      select
        (select count(*)::int from users) as users_total,
        (select count(*)::int from workspaces) as workspaces_total,
        (select count(*)::int from giveaways) as giveaways_total,
        (select count(*)::int from giveaways where status in ('DRAFT','PUBLISHED','ACTIVE')) as giveaways_active,
        (select count(*)::int from barter_offers) as offers_total,
        (select count(*)::int from barter_offers where status not in ('CLOSED','DELETED')) as offers_active
    `);
    Object.assign(out, r.rows[0] || {});
  } catch {
    // ignore
  }

  // Payments summary in the window
  try {
    const r = await pool.query(
      `select
         status,
         currency,
         count(*)::int as cnt,
         coalesce(sum(total_amount), 0)::int as amount_sum
       from payments
       where created_at >= now() - ($1::int || ' days')::interval
       group by status, currency
       order by status asc, currency asc`,
      [wd]
    );
    out.payments = r.rows || [];
  } catch {
    out.payments = [];
  }

  // Activity summary: relies on optional analytics/events table. Safe to call.
  try {
    const topline = await getAnalyticsTopline({ windowDays: wd });
    out.analytics_topline = topline;
  } catch {
    out.analytics_topline = null;
  }

  try {
    const daily = await getAnalyticsDaily(wd);
    out.analytics_daily = daily;
  } catch {
    out.analytics_daily = [];
  }

  return out;
}


export async function findUserByUsername(username) {
  const u = String(username || '').replace(/^@/, '').toLowerCase();
  const r = await pool.query(`select id, tg_id, tg_username from users where lower(tg_username)= $1 limit 1`, [u]);
  return r.rows[0] || null;
}

export async function getUserTgIdByUserId(userId) {
  const r = await pool.query(`select tg_id, tg_username from users where id=$1`, [userId]);
  return r.rows[0] || null;
}

// Users directory (admin)
// Filters: all | brands | creators | curators | managers
const USERS_DIRECTORY_SEGMENTS = ['all', 'brands', 'creators', 'curators', 'managers'];
const USERS_DIRECTORY_PLAN_STATES = ['all', 'with_plan', 'no_plan'];
const USERS_DIRECTORY_CREDITS_STATES = ['all', 'with_credits', 'no_credits'];
const USERS_DIRECTORY_CHANNEL_STATES = ['all', 'with_channel', 'no_channel'];
const USERS_DIRECTORY_ACTIVITY_WINDOWS = ['all', '7d', '30d', '90d'];
const USERS_DIRECTORY_PAYMENTS_STATES = ['all', 'with_payments', 'no_payments'];
const USERS_DIRECTORY_SORTS = ['created_desc', 'activity_desc', 'activity_asc', 'payments_desc', 'problem_desc'];
const USERS_DIRECTORY_COHORTS = ['all', 'dormant_payers', 'paid_no_channel', 'plan_no_channel', 'fresh_brands', 'quiet_creators'];

const USERS_DIRECTORY_COHORT_WHERE = {
  dormant_payers: [
    `meta.payments_count > 0`,
    `meta.last_known_activity_at < now() - interval '30 days'`,
  ],
  paid_no_channel: [
    `meta.payments_count > 0`,
    `meta.has_channel = false`,
  ],
  plan_no_channel: [
    `u.brand_plan is not null`,
    `meta.has_channel = false`,
  ],
  fresh_brands: [
    `(
      exists (select 1 from brand_profiles bp where bp.user_id = u.id)
      or u.brand_plan is not null
      or coalesce(u.brand_credits,0) > 0
    )`,
    `meta.last_known_activity_at >= now() - interval '30 days'`,
  ],
  quiet_creators: [
    `exists (select 1 from workspaces w where w.owner_user_id = u.id)`,
    `meta.last_known_activity_at < now() - interval '30 days'`,
  ],
};

function getUsersDirectoryCohortWhereClauses(cohortView = 'all') {
  const key = String(cohortView || 'all').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(USERS_DIRECTORY_COHORT_WHERE, key)) return [];
  return Array.isArray(USERS_DIRECTORY_COHORT_WHERE[key]) ? [...USERS_DIRECTORY_COHORT_WHERE[key]] : [];
}

const USERS_DIRECTORY_META_SQL = `
  left join lateral (
    select
      exists (
        select 1
        from workspaces w
        where w.owner_user_id = u.id
          and (w.channel_id is not null or nullif(trim(coalesce(w.channel_username, '')), '') is not null)
      ) as has_channel,
      coalesce((select count(*)::int from payments p where p.user_id = u.id), 0) as payments_count,
      (select max(p.created_at) from payments p where p.user_id = u.id) as last_payment_at,
      greatest(
        coalesce(u.updated_at, u.created_at),
        coalesce((select max(p.created_at) from payments p where p.user_id = u.id), '-infinity'::timestamptz),
        coalesce((select max(w.created_at) from workspaces w where w.owner_user_id = u.id), '-infinity'::timestamptz),
        coalesce((select max(wc.created_at) from workspace_curators wc where wc.user_id = u.id), '-infinity'::timestamptz),
        coalesce((select max(bm.created_at) from brand_managers bm where bm.manager_user_id = u.id), '-infinity'::timestamptz),
        coalesce((select max(coalesce(bp.updated_at, bp.created_at)) from brand_profiles bp where bp.user_id = u.id), '-infinity'::timestamptz)
      ) as last_known_activity_at
  ) meta on true`;

let USERS_BANNED_AT_COLUMN_CACHE = null;

export async function hasUsersBannedAtColumn() {
  if (typeof USERS_BANNED_AT_COLUMN_CACHE === 'boolean') return USERS_BANNED_AT_COLUMN_CACHE;
  try {
    const r = await pool.query(
      `select 1 as ok
       from information_schema.columns
       where table_name='users'
         and column_name='banned_at'
       limit 1`
    );
    USERS_BANNED_AT_COLUMN_CACHE = r.rows.length > 0;
  } catch (err) {
    console.warn('[db] hasUsersBannedAtColumn check failed; degrading users-directory to banned_at-safe mode', err?.message || err);
    USERS_BANNED_AT_COLUMN_CACHE = false;
  }
  return USERS_BANNED_AT_COLUMN_CACHE;
}

function usersDirectoryBannedAtSelectSql(hasBannedAtColumn, alias = 'u') {
  return hasBannedAtColumn ? `${alias}.banned_at as banned_at` : `null::timestamptz as banned_at`;
}

function usersDirectoryBannedAtPresenceSql(hasBannedAtColumn, alias = 'u') {
  return hasBannedAtColumn ? `${alias}.banned_at is not null` : `false`;
}

function buildUsersDirectoryProblemScoreSql(hasBannedAtColumn) {
  return `
    (case when ${usersDirectoryBannedAtPresenceSql(hasBannedAtColumn)} then 100 else 0 end
     + case when meta.payments_count > 0 and meta.has_channel = false then 35 else 0 end
     + case when u.brand_plan is not null and meta.has_channel = false then 25 else 0 end
     + case when coalesce(u.brand_credits,0) > 0 and meta.last_known_activity_at < now() - interval '30 days' then 15 else 0 end
     + case when meta.last_known_activity_at < now() - interval '90 days' then 10 else 0 end)
  `;
}

export function normalizeUsersDirectoryFilters(input = {}) {
  const segmentRaw = String(input.segment || input.filter || 'all').trim().toLowerCase();
  const segment = USERS_DIRECTORY_SEGMENTS.includes(segmentRaw) ? segmentRaw : 'all';

  const planStateRaw = String(input.planState || input.plan || 'all').trim().toLowerCase();
  const creditsStateRaw = String(input.creditsState || input.credits || 'all').trim().toLowerCase();
  const channelStateRaw = String(input.channelState || input.channel || 'all').trim().toLowerCase();
  const activityWindowRaw = String(input.activityWindow || input.activity || 'all').trim().toLowerCase();
  const paymentsStateRaw = String(input.paymentsState || input.payments || 'all').trim().toLowerCase();
  const sortByRaw = String(input.sortBy || input.sort || 'created_desc').trim().toLowerCase();
  const cohortViewRaw = String(input.cohortView || input.cohort || 'all').trim().toLowerCase();

  return {
    segment,
    planState: USERS_DIRECTORY_PLAN_STATES.includes(planStateRaw) ? planStateRaw : 'all',
    creditsState: USERS_DIRECTORY_CREDITS_STATES.includes(creditsStateRaw) ? creditsStateRaw : 'all',
    channelState: USERS_DIRECTORY_CHANNEL_STATES.includes(channelStateRaw) ? channelStateRaw : 'all',
    activityWindow: USERS_DIRECTORY_ACTIVITY_WINDOWS.includes(activityWindowRaw) ? activityWindowRaw : 'all',
    paymentsState: USERS_DIRECTORY_PAYMENTS_STATES.includes(paymentsStateRaw) ? paymentsStateRaw : 'all',
    sortBy: USERS_DIRECTORY_SORTS.includes(sortByRaw) ? sortByRaw : 'created_desc',
    cohortView: USERS_DIRECTORY_COHORTS.includes(cohortViewRaw) ? cohortViewRaw : 'all',
  };
}

function buildUsersDirectoryOrderSql(normalized = {}, hasBannedAtColumn = true) {
  if (normalized.sortBy === 'activity_desc') {
    return `order by meta.last_known_activity_at desc nulls last, u.created_at desc`;
  }
  if (normalized.sortBy === 'activity_asc') {
    return `order by meta.last_known_activity_at asc nulls first, u.created_at desc`;
  }
  if (normalized.sortBy === 'payments_desc') {
    return `order by meta.payments_count desc, meta.last_payment_at desc nulls last, meta.last_known_activity_at desc nulls last, u.created_at desc`;
  }
  if (normalized.sortBy === 'problem_desc') {
    return `order by ${buildUsersDirectoryProblemScoreSql(hasBannedAtColumn)} desc, meta.last_known_activity_at asc nulls first, meta.payments_count desc, u.created_at desc`;
  }
  return `order by u.created_at desc`;
}

function buildUsersDirectorySqlParts({ filterRaw = 'all', qRaw = '', filtersRaw = {}, startIndex = 1 } = {}) {
  const normalized = normalizeUsersDirectoryFilters({ segment: filterRaw, ...(filtersRaw || {}) });
  const q0 = String(qRaw || '').trim();
  const q = q0.replace(/^@/, '').toLowerCase();

  const where = [];
  const params = [];
  let paramIndex = Math.max(1, Number(startIndex) || 1);
  const addParam = (value) => {
    params.push(value);
    const ref = `$${paramIndex}`;
    paramIndex += 1;
    return ref;
  };

  if (normalized.segment === 'brands') {
    where.push(`(
      exists (select 1 from brand_profiles bp where bp.user_id = u.id)
      or u.brand_plan is not null
      or coalesce(u.brand_credits,0) > 0
    )`);
  } else if (normalized.segment === 'creators') {
    where.push(`exists (select 1 from workspaces w where w.owner_user_id = u.id)`);
  } else if (normalized.segment === 'curators') {
    where.push(`(
      exists (select 1 from workspace_curators wc where wc.user_id = u.id)
      or exists (select 1 from network_moderators nm where nm.user_id = u.id)
    )`);
  } else if (normalized.segment === 'managers') {
    where.push(`exists (select 1 from brand_managers bm where bm.manager_user_id = u.id)`);
  }

  if (normalized.planState === 'with_plan') where.push(`u.brand_plan is not null`);
  else if (normalized.planState === 'no_plan') where.push(`u.brand_plan is null`);

  if (normalized.creditsState === 'with_credits') where.push(`coalesce(u.brand_credits,0) > 0`);
  else if (normalized.creditsState === 'no_credits') where.push(`coalesce(u.brand_credits,0) = 0`);

  if (normalized.channelState === 'with_channel') where.push(`meta.has_channel = true`);
  else if (normalized.channelState === 'no_channel') where.push(`meta.has_channel = false`);

  if (normalized.paymentsState === 'with_payments') where.push(`meta.payments_count > 0`);
  else if (normalized.paymentsState === 'no_payments') where.push(`meta.payments_count = 0`);

  where.push(...getUsersDirectoryCohortWhereClauses(normalized.cohortView));

  const activityDays = normalized.activityWindow === '7d' ? 7
    : normalized.activityWindow === '30d' ? 30
    : normalized.activityWindow === '90d' ? 90
    : 0;
  if (activityDays > 0) {
    where.push(`meta.last_known_activity_at >= now() - interval '${activityDays} days'`);
  }

  if (q) {
    if (/^\d+$/.test(q)) {
      const tgRef = addParam(Number(q));
      const userRef = addParam(Number(q));
      where.push(`(u.tg_id = ${tgRef} or u.id = ${userRef})`);
    } else {
      const likeRef = addParam(`%${q}%`);
      where.push(`lower(coalesce(u.tg_username,'')) like ${likeRef}`);
    }
  }

  return {
    normalized,
    params,
    q,
    whereSql: where.length ? `where ${where.join(' and ')}` : '',
  };
}

export async function getUsersDirectoryCohortCounters(filterRaw = 'all', qRaw = '', filtersRaw = {}) {
  const baseFilters = normalizeUsersDirectoryFilters({ segment: filterRaw, ...(filtersRaw || {}), cohortView: 'all' });
  const parts = buildUsersDirectorySqlParts({
    filterRaw: baseFilters.segment,
    qRaw,
    filtersRaw: baseFilters,
    startIndex: 1,
  });

  const dormantSql = getUsersDirectoryCohortWhereClauses('dormant_payers').join(' and ');
  const paidNoChannelSql = getUsersDirectoryCohortWhereClauses('paid_no_channel').join(' and ');
  const planNoChannelSql = getUsersDirectoryCohortWhereClauses('plan_no_channel').join(' and ');
  const freshBrandsSql = getUsersDirectoryCohortWhereClauses('fresh_brands').join(' and ');
  const quietCreatorsSql = getUsersDirectoryCohortWhereClauses('quiet_creators').join(' and ');

  const r = await pool.query(
    `select
       count(*)::int as total_count,
       count(*) filter (where ${dormantSql})::int as dormant_payers_count,
       count(*) filter (where ${paidNoChannelSql})::int as paid_no_channel_count,
       count(*) filter (where ${planNoChannelSql})::int as plan_no_channel_count,
       count(*) filter (where ${freshBrandsSql})::int as fresh_brands_count,
       count(*) filter (where ${quietCreatorsSql})::int as quiet_creators_count
     from users u
     ${USERS_DIRECTORY_META_SQL}
     ${parts.whereSql}`,
    parts.params
  );

  const row = r.rows?.[0] || {};
  return {
    scopeFilters: baseFilters,
    all: Number(row.total_count || 0),
    dormant_payers: Number(row.dormant_payers_count || 0),
    paid_no_channel: Number(row.paid_no_channel_count || 0),
    plan_no_channel: Number(row.plan_no_channel_count || 0),
    fresh_brands: Number(row.fresh_brands_count || 0),
    quiet_creators: Number(row.quiet_creators_count || 0),
  };
}

export async function listUsersDirectory(filterRaw = 'all', limitRaw = 20, offsetRaw = 0, qRaw = '', filtersRaw = {}) {
  const hasBannedAtColumn = await hasUsersBannedAtColumn();
  const limit = Math.max(1, Math.min(50, Number(limitRaw) || 20));
  const offset = Math.max(0, Number(offsetRaw) || 0);
  const params = [limit, offset];
  const parts = buildUsersDirectorySqlParts({
    filterRaw,
    qRaw,
    filtersRaw,
    startIndex: 3,
  });
  params.push(...parts.params);

  const r = await pool.query(
    `select
       u.id as user_id,
       u.tg_id,
       u.tg_username,
       u.created_at,
       u.updated_at,
       u.brand_plan,
       u.brand_plan_until,
       ${usersDirectoryBannedAtSelectSql(hasBannedAtColumn)},
       coalesce(u.brand_credits,0)::int as brand_credits,
       meta.has_channel,
       (meta.payments_count > 0) as has_payments,
       meta.payments_count,
       meta.last_payment_at,
       meta.last_known_activity_at,
       ${buildUsersDirectoryProblemScoreSql(hasBannedAtColumn)} as problem_score,
       exists (select 1 from workspaces w where w.owner_user_id = u.id) as is_creator,
       exists (select 1 from workspace_curators wc where wc.user_id = u.id) as is_curator,
       exists (select 1 from network_moderators nm where nm.user_id = u.id) as is_moderator,
       exists (select 1 from brand_managers bm where bm.manager_user_id = u.id) as is_manager,
       exists (select 1 from brand_profiles bp where bp.user_id = u.id) as has_brand_profile,
       count(*) over()::int as total_count
     from users u
     ${USERS_DIRECTORY_META_SQL}
     ${parts.whereSql}
     ${buildUsersDirectoryOrderSql(parts.normalized, hasBannedAtColumn)}
     limit $1 offset $2`,
    params
  );
  return { rows: r.rows || [], filters: parts.normalized };
}

export async function getUsersDirectoryByIds(userIdsRaw = []) {
  const hasBannedAtColumn = await hasUsersBannedAtColumn();
  const ids = Array.from(new Set((Array.isArray(userIdsRaw) ? userIdsRaw : [userIdsRaw])
    .map((value) => Number(value || 0) || 0)
    .filter((value) => value > 0))).slice(0, 500);
  if (!ids.length) return [];

  const r = await pool.query(
    `select
       u.id as user_id,
       u.tg_id,
       u.tg_username,
       u.created_at,
       u.updated_at,
       ${usersDirectoryBannedAtSelectSql(hasBannedAtColumn)},
       u.brand_plan,
       u.brand_plan_until,
       coalesce(u.brand_credits,0)::int as brand_credits,
       coalesce(u.brand_credits_spent,0)::int as brand_credits_spent,
       meta.has_channel,
       (meta.payments_count > 0) as has_payments,
       meta.payments_count,
       meta.last_payment_at,
       meta.last_known_activity_at,
       ${buildUsersDirectoryProblemScoreSql(hasBannedAtColumn)} as problem_score,
       exists (select 1 from workspaces w where w.owner_user_id = u.id) as is_creator,
       exists (select 1 from workspace_curators wc where wc.user_id = u.id) as is_curator,
       exists (select 1 from network_moderators nm where nm.user_id = u.id) as is_moderator,
       exists (select 1 from brand_managers bm where bm.manager_user_id = u.id) as is_manager,
       exists (select 1 from brand_profiles bp where bp.user_id = u.id) as has_brand_profile
     from users u
     ${USERS_DIRECTORY_META_SQL}
     where u.id = any($1::int[])
     order by u.created_at desc`,
    [ids]
  );
  return r.rows || [];
}

/**
 * Admin: export users for CSV (same filters as listUsersDirectory, but up to 10 000 rows).
 * Returns flat rows with all fields needed for CSV.
 */
export async function exportUsersDirectory(filterRaw = 'all', qRaw = '', filtersRaw = {}) {
  const hasBannedAtColumn = await hasUsersBannedAtColumn();
  const MAX_EXPORT = 10000;
  const parts = buildUsersDirectorySqlParts({
    filterRaw,
    qRaw,
    filtersRaw,
    startIndex: 2,
  });
  const params = [MAX_EXPORT, ...parts.params];

  const r = await pool.query(
    `select
       u.id as user_id,
       u.tg_id,
       u.tg_username,
       u.created_at,
       u.updated_at,
       ${usersDirectoryBannedAtSelectSql(hasBannedAtColumn)},
       u.brand_plan,
       u.brand_plan_until,
       coalesce(u.brand_credits,0)::int as brand_credits,
       coalesce(u.brand_credits_spent,0)::int as brand_credits_spent,
       meta.has_channel,
       (meta.payments_count > 0) as has_payments,
       meta.payments_count,
       meta.last_payment_at,
       meta.last_known_activity_at,
       ${buildUsersDirectoryProblemScoreSql(hasBannedAtColumn)} as problem_score,
       exists (select 1 from workspaces w where w.owner_user_id = u.id) as is_creator,
       exists (select 1 from workspace_curators wc where wc.user_id = u.id) as is_curator,
       exists (select 1 from network_moderators nm where nm.user_id = u.id) as is_moderator,
       exists (select 1 from brand_managers bm where bm.manager_user_id = u.id) as is_manager,
       exists (select 1 from brand_profiles bp where bp.user_id = u.id) as has_brand_profile
     from users u
     ${USERS_DIRECTORY_META_SQL}
     ${parts.whereSql}
     ${buildUsersDirectoryOrderSql(parts.normalized, hasBannedAtColumn)}
     limit $1`,
    params
  );
  return {
    rows: r.rows || [],
    truncated: (r.rows || []).length >= MAX_EXPORT,
    filters: parts.normalized,
  };
}

/**
 * Admin: full user card by internal user id.
 * Returns user row + computed role flags + workspaces + brand profile info.
 */
export async function getUserCardById(userId) {
  const uid = Number(userId);
  if (!uid) return null;
  const r = await pool.query(
    `select
       u.*,
       exists (select 1 from workspaces w where w.owner_user_id = u.id) as is_creator,
       exists (select 1 from workspace_curators wc where wc.user_id = u.id) as is_curator,
       exists (select 1 from network_moderators nm where nm.user_id = u.id) as is_moderator,
       exists (select 1 from brand_managers bm where bm.manager_user_id = u.id) as is_manager,
       exists (select 1 from brand_profiles bp where bp.user_id = u.id) as has_brand_profile
     from users u
     where u.id = $1`,
    [uid]
  );
  const user = r.rows[0] || null;
  if (!user) return null;

  // Workspaces owned by user
  const wsR = await pool.query(
    `select w.id, w.title, w.channel_id, w.channel_username, w.created_at,
            coalesce(s.plan, 'free') as plan, s.pro_until
     from workspaces w
     left join workspace_settings s on s.workspace_id = w.id
     where w.owner_user_id = $1
     order by w.created_at`,
    [uid]
  );
  user._workspaces = wsR.rows || [];

  // Workspaces where user is curator
  const curR = await pool.query(
    `select w.id, w.title, w.channel_username, wc.created_at as joined_at
     from workspace_curators wc
     join workspaces w on w.id = wc.workspace_id
     where wc.user_id = $1
     order by wc.created_at`,
    [uid]
  );
  user._curator_in = curR.rows || [];

  // Brand profile (if exists)
  const bpR = await pool.query(
    `select user_id, brand_name, niche, created_at, updated_at
     from brand_profiles where user_id = $1
     order by created_at limit 1`,
    [uid]
  );
  user._brand_profile = bpR.rows[0] || null;

  return user;
}

// -----------------------------
// Brand Pass credits (brands pay for first contact)
// -----------------------------

export async function getBrandCredits(userId) {
  const r = await pool.query(`select brand_credits from users where id=$1`, [userId]);
  return Number(r.rows[0]?.brand_credits ?? 0);
}

// Fallback: resolve Brand Pass credits by Telegram ID (used when a row references only tg_id).
export async function getBrandCreditsByTgId(tgId) {
  const r = await pool.query(`select brand_credits from users where tg_id=$1`, [tgId]);
  return Number(r.rows[0]?.brand_credits ?? 0);
}

export async function getBrandIntroMeta(userId) {
  const r = await pool.query(
    `select brand_credits, brand_trial_granted, brand_trial_granted_at
     from users
     where id=$1`,
    [userId]
  );
  const row = r.rows[0] || null;
  if (!row) return null;
  return {
    brand_credits: Number(row.brand_credits ?? 0),
    brand_trial_granted: !!row.brand_trial_granted,
    brand_trial_granted_at: row.brand_trial_granted_at || null
  };
}

export async function getIntroDailyUsage(userId, day = null) {
  const r = await pool.query(
    `select used_count from intro_daily_usage
     where user_id=$1 and day = coalesce($2::date, now()::date)`,
    [userId, day]
  );
  return Number(r.rows[0]?.used_count ?? 0);
}

export async function addBrandCredits(userId, credits) {
  const r = await pool.query(
    `update users
       set brand_credits = brand_credits + $2,
           brand_credits_updated_at = now()
     where id=$1
     returning brand_credits`,
    [userId, Number(credits || 0)]
  );
  return Number(r.rows[0]?.brand_credits ?? 0);
}

// Add Brand Pass credits that are explicitly gifted (admin gifts).
// These can later be safely revoked without touching purchased/trial credits.
export async function addGiftedBrandCredits(userId, credits) {
  const uid = Number(userId);
  const c = Math.max(0, Math.floor(Number(credits) || 0));
  if (!uid || !c) return await addBrandCredits(uid, c);

  try {
    const r = await pool.query(
      `update users
         set brand_credits = brand_credits + $2,
             brand_credits_gifted = brand_credits_gifted + $2,
             brand_credits_updated_at = now()
       where id=$1
       returning brand_credits`,
      [uid, c]
    );
    return Number(r.rows[0]?.brand_credits ?? 0);
  } catch (e) {
    // Rolling upgrade safety: if column doesn't exist yet.
    if (e && e.code === '42703') {
      return await addBrandCredits(uid, c);
    }
    throw e;
  }
}

// Revoke all remaining gifted credits (does not touch purchased/trial credits).
// Returns {taken, brand_credits, brand_credits_gifted}
export async function revokeGiftedBrandCredits(userId) {
  const uid = Number(userId);
  if (!uid) return { taken: 0, brand_credits: 0, brand_credits_gifted: 0 };

  try {
    const r = await pool.query(
      `with s as (
         select id,
                coalesce(brand_credits,0)::int as total,
                coalesce(brand_credits_gifted,0)::int as gifted,
                least(coalesce(brand_credits,0), coalesce(brand_credits_gifted,0))::int as take
         from users
         where id=$1
       )
       update users u
          set brand_credits = greatest(0, coalesce(u.brand_credits,0) - s.take),
              brand_credits_gifted = greatest(0, least(greatest(0, coalesce(u.brand_credits_gifted,0) - s.take), greatest(0, coalesce(u.brand_credits,0) - s.take))),
              brand_credits_updated_at = now(),
              updated_at = now()
         from s
        where u.id = s.id
       returning s.take::int as taken, u.brand_credits::int as brand_credits, u.brand_credits_gifted::int as brand_credits_gifted`,
      [uid]
    );
    const row = r.rows[0] || null;
    if (!row) return { taken: 0, brand_credits: 0, brand_credits_gifted: 0 };
    return {
      taken: Number(row.taken || 0),
      brand_credits: Number(row.brand_credits || 0),
      brand_credits_gifted: Number(row.brand_credits_gifted || 0)
    };
  } catch (e) {
    // Column missing -> nothing to revoke (can't distinguish gifted)
    if (e && e.code === '42703') {
      return { taken: 0, brand_credits: await getBrandCredits(uid), brand_credits_gifted: 0 };
    }
    throw e;
  }
}

// Spend Brand Pass credits (atomic, no negatives). Returns new balance or null if insufficient.
export async function spendBrandCredits(userId, cost = 1) {
  const c = Math.max(1, Math.floor(Number(cost) || 1));
  const uid = Number(userId);

  // Rolling-upgrade safety: if brand_credits_gifted column isn't applied yet, fall back to old query.
  try {
    const r = await pool.query(
      `update users
       set brand_credits = brand_credits - $2,
           brand_credits_spent = brand_credits_spent + $2,
           brand_credits_gifted = greatest(0, brand_credits_gifted - $2),
           updated_at=now()
       where id=$1 and brand_credits >= $2
       returning brand_credits`,
      [uid, c]
    );
    if (!r.rows.length) return null;
    return Number(r.rows[0]?.brand_credits ?? 0);
  } catch (e) {
    // 42703 = undefined_column
    if (e && e.code === '42703') {
      const r = await pool.query(
        `update users
         set brand_credits = brand_credits - $2,
             brand_credits_spent = brand_credits_spent + $2,
             updated_at=now()
         where id=$1 and brand_credits >= $2
         returning brand_credits`,
        [uid, c]
      );
      if (!r.rows.length) return null;
      return Number(r.rows[0]?.brand_credits ?? 0);
    }
    throw e;
  }
}

// ----------------------------------------
// Brand Pass: workspace contacts unlock
// ----------------------------------------

// DB fallback for contacts unlock state.
// IMPORTANT: callers should only use this when Redis is unavailable,
// to avoid adding Neon reads on hot UI paths.
export async function isWorkspaceContactsUnlocked(brandUserId, workspaceId) {
  const uid = Number(brandUserId || 0);
  const wsId = Number(workspaceId || 0);
  if (!uid || !wsId) return false;

  try {
    const r = await pool.query(
      `select 1
       from brand_contact_unlocks
       where brand_user_id=$1 and workspace_id=$2 and unlocked_until > now()
       limit 1`,
      [uid, wsId]
    );
    return !!r.rowCount;
  } catch (e) {
    // 42P01 = undefined_table (rolling upgrade safety)
    if (e && e.code === '42P01') return false;
    throw e;
  }
}

// Exactly-once charging for contacts unlock:
// - If unlock is already active => charged=false
// - If unlock is expired/missing => charge credits (if cost>0) and activate unlock
// Uses PG advisory lock so it stays safe even when Redis is down.
export async function unlockWorkspaceContactsWithCredits(brandUserId, workspaceId, cost = 1, ttlSec = 30 * 24 * 60 * 60, opts = {}) {
  const uid = Number(brandUserId || 0);
  const wsId = Number(workspaceId || 0);
  const c = Math.max(0, Math.floor(Number(cost) || 0));
  const ttl = Math.max(60, Math.floor(Number(ttlSec) || 0));
  if (!uid || !wsId) return { ok: false, error: 'bad_args' };

  const client = await pool.connect();
  try {
    await client.query('begin');

    const stm = Math.floor(Number(opts?.statementTimeoutMs || 0));
    if (Number.isFinite(stm) && stm > 0) {
      await txSetLocalStatementTimeout(client, stm);
    }

    // Per-(brand,workspace) exactly-once guard even with Redis degradation.
    // IMPORTANT: fail-fast on click-storm (do not queue waiting connections in Neon).
    const lockRes = await client.query(
      `select pg_try_advisory_xact_lock(hashtext($1)) as ok`,
      [`wsp_contact:${wsId}:${uid}`]
    );
    if (!lockRes.rows?.[0]?.ok) {
      await client.query('rollback');
      return { ok: false, error: 'busy' };
    }

    // STEP353: prevent charging for empty contact packs ("selling air").
    // If the creator has no revealable contacts/links at the moment of unlock, skip without charging.
    const requireNonEmpty = opts?.requireNonEmptyContacts !== false;
    if (requireNonEmpty) {
      const rWs = await client.query(
        `select ws.channel_username,
                s.profile_contact,
                s.profile_ig,
                s.profile_portfolio_urls,
                s.profile_contacts
         from workspaces ws
         left join workspace_settings s on s.workspace_id = ws.id
         where ws.id=$1
         limit 1`,
        [wsId]
      );

      if (!rWs.rowCount) {
        await client.query('rollback');
        return { ok: false, error: 'missing_ws' };
      }

      const w = rWs.rows[0] || {};
      const channel = String(w.channel_username || '').trim();
      const contact = String(w.profile_contact || '').trim();
      const ig = String(w.profile_ig || '').trim();
      const ports = Array.isArray(w.profile_portfolio_urls) ? w.profile_portfolio_urls : [];
      const hasPorts = ports.some((x) => String(x || '').trim().length > 0);

      const cObj = (w.profile_contacts && typeof w.profile_contacts === 'object') ? w.profile_contacts : null;
      const cTgRaw = cObj?.tg ? String(cObj.tg).trim() : '';
      const cTg = cTgRaw.replace(/^@/, '');
      const cEmail = cObj?.email ? String(cObj.email).trim() : '';
      const cPhone = cObj?.phone ? String(cObj.phone).trim() : '';
      const cSite = cObj?.site ? String(cObj.site).trim() : '';
      const cOther = cObj?.other ? String(cObj.other).trim() : '';
      const hasStructured = !!(cTg || cEmail || cPhone || cSite || cOther);

      const hasAny = !!(channel || contact || ig || hasPorts || hasStructured);
      if (!hasAny) {
        await client.query('rollback');
        return { ok: false, error: 'no_contacts' };
      }
    }

    // Activate unlock only if it is missing/expired. If still active => no-op (0 rows).
    let activated = false;
    let unlockedUntil = null;
    try {
      const rUnlock = await client.query(
        `insert into brand_contact_unlocks (brand_user_id, workspace_id, unlocked_until)
         values ($1, $2, now() + ($3::text || ' seconds')::interval)
         on conflict (brand_user_id, workspace_id)
         do update set unlocked_until = excluded.unlocked_until, updated_at = now()
         where brand_contact_unlocks.unlocked_until < now()
         returning unlocked_until`,
        [uid, wsId, ttl]
      );
      activated = rUnlock.rowCount > 0;
      unlockedUntil = rUnlock.rows[0]?.unlocked_until ?? null;
    } catch (e) {
      // rolling upgrade safety
      if (e && e.code === '42P01') {
        await client.query('rollback');

        // Fallback to legacy behavior (no DB unlock tracking).
        const left = c > 0 ? await spendBrandCredits(uid, c) : 0;
        if (c > 0 && left === null) return { ok: false, needPaywall: true };
        return { ok: true, charged: c > 0, left: left ?? 0, unlockedUntil: null, legacy: true };
      }
      throw e;
    }

    if (!activated) {
      await client.query('commit');
      return { ok: true, charged: false, left: null, unlockedUntil: null };
    }

    // Free unlock: keep the DB record but don't charge.
    if (c <= 0) {
      await client.query('commit');
      return { ok: true, charged: false, left: 0, unlockedUntil };
    }

    // Spend credits atomically within the same TX.
    let rSpend;
    try {
      rSpend = await client.query(
        `update users
         set brand_credits = brand_credits - $2,
             brand_credits_spent = brand_credits_spent + $2,
             brand_credits_gifted = greatest(0, brand_credits_gifted - $2),
             updated_at=now()
         where id=$1 and brand_credits >= $2
         returning brand_credits`,
        [uid, c]
      );
    } catch (e) {
      // 42703 = undefined_column (brand_credits_gifted rolling upgrade)
      if (e && e.code === '42703') {
        rSpend = await client.query(
          `update users
           set brand_credits = brand_credits - $2,
               brand_credits_spent = brand_credits_spent + $2,
               updated_at=now()
           where id=$1 and brand_credits >= $2
           returning brand_credits`,
          [uid, c]
        );
      } else {
        throw e;
      }
    }

    if (!rSpend.rowCount) {
      await client.query('rollback');
      return { ok: false, needPaywall: true };
    }

    const left = Number(rSpend.rows[0]?.brand_credits ?? 0);
    await client.query('commit');
    return { ok: true, charged: true, left, unlockedUntil };
  } catch (e) {
    try { await client.query('rollback'); } catch {}
    throw e;
  } finally {
    try { client.release(); } catch {}
  }
}

// -----------------------------
// Intro retry credits (fairness)
// -----------------------------

export async function countAvailableBrandRetryCredits(userId) {
  const r = await pool.query(
    `select count(*)::int as c
     from brand_retry_credits
     where user_id=$1 and status='AVAILABLE' and expires_at>now()`,
    [userId]
  );
  return Number(r.rows[0]?.c ?? 0);
}

// Transaction helper: take 1 retry credit (oldest expiry) with row-level lock
export async function takeAvailableRetryCreditForUpdate(client, userId) {
  const r = await client.query(
    `select id
     from brand_retry_credits
     where user_id=$1 and status='AVAILABLE' and expires_at>now()
     order by expires_at asc
     limit 1
     for update`,
    [userId]
  );
  return r.rows[0]?.id || null;
}

export async function redeemRetryCredit(client, retryId, redeemedThreadId) {
  await client.query(
    `update brand_retry_credits
     set status='REDEEMED', redeemed_at=now(), redeemed_thread_id=$2
     where id=$1 and status='AVAILABLE'`,
    [retryId, redeemedThreadId]
  );
}

export async function listIntroThreadsForRetry(limit = 50, afterHours = 24) {
  // Note: these columns are added in migration 019. Caller can catch undefined_column for rolling upgrades.
  const r = await pool.query(
    `select t.id as thread_id, t.buyer_user_id, t.offer_id, t.buyer_first_msg_at
     from barter_threads t
     where t.intro_charge_source='CREDITS'
       and t.intro_charged_at is not null
       and t.buyer_first_msg_at is not null
       and t.seller_first_reply_at is null
       and t.retry_issued_at is null
       and t.buyer_first_msg_at < (now() - (($2::text || ' hours')::interval))
     order by t.buyer_first_msg_at asc
     limit $1`,
    [Number(limit || 50), Number(afterHours || 24)]
  );
  return r.rows || [];
}

export async function issueRetryCreditForThread(threadId, userId, expiresDays = 7, reason = 'no_reply') {
  const r = await pool.query(
    `insert into brand_retry_credits (user_id, source_thread_id, expires_at, reason)
     values ($1,$2, now() + (($3::text || ' days')::interval), $4)
     on conflict (source_thread_id) do nothing
     returning id`,
    [userId, threadId, Number(expiresDays || 7), String(reason || 'no_reply')]
  );
  if (r.rowCount > 0) {
    await pool.query(
      `update barter_threads set retry_issued_at=now(), updated_at=now()
       where id=$1 and retry_issued_at is null`,
      [threadId]
    );
    return { issued: true, id: r.rows[0].id };
  }
  return { issued: false, id: null };
}

export async function expireRetryCredits(limit = 200) {
  const r = await pool.query(
    `update brand_retry_credits
     set status='EXPIRED'
     where id in (
       select id from brand_retry_credits
       where status='AVAILABLE' and expires_at < now()
       order by expires_at asc
       limit $1
     )
     returning id`,
    [Number(limit || 200)]
  );
  return r.rowCount || 0;
}

// END MOVED QUERY BODY: usersRepository
