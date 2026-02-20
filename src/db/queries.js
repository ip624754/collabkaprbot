import { pool } from './pool.js';
import { CFG } from '../lib/config.js';
import { redis, k as rk, rateLimit } from '../lib/redis.js';

// Users
export async function upsertUser(tgId, username) {
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
export async function listUsersDirectory(filterRaw = 'all', limitRaw = 20, offsetRaw = 0, qRaw = '') {
  const filter = String(filterRaw || 'all').toLowerCase();
  const limit = Math.max(1, Math.min(50, Number(limitRaw) || 20));
  const offset = Math.max(0, Number(offsetRaw) || 0);

  const q0 = String(qRaw || '').trim();
  const q = q0.replace(/^@/, '').toLowerCase();

  const where = [];
  if (filter === 'brands') {
    where.push(`(
      exists (select 1 from brand_profiles bp where bp.user_id = u.id)
      or u.brand_plan is not null
      or coalesce(u.brand_credits,0) > 0
    )`);
  } else if (filter === 'creators') {
    where.push(`exists (select 1 from workspaces w where w.owner_user_id = u.id)`);
  } else if (filter === 'curators') {
    where.push(`(
      exists (select 1 from workspace_curators wc where wc.user_id = u.id)
      or exists (select 1 from network_moderators nm where nm.user_id = u.id)
    )`);
  } else if (filter === 'managers') {
    where.push(`exists (select 1 from brand_managers bm where bm.manager_user_id = u.id)`);
  }

  // Search (optional):
  // - numeric: match tg_id OR user id
  // - string: match username (case-insensitive, partial)
  const params = [limit, offset];
  if (q) {
    if (/^\d+$/.test(q)) {
      const n = Number(q);
      params.push(n);
      params.push(n);
      const i = params.length - 1; // points to first of the two just pushed (tg_id)
      where.push(`(u.tg_id = $${i} or u.id = $${i + 1})`);
    } else {
      params.push(`%${q}%`);
      const i = params.length;
      where.push(`lower(coalesce(u.tg_username,'')) like $${i}`);
    }
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';

  const r = await pool.query(
    `select
       u.id as user_id,
       u.tg_id,
       u.tg_username,
       u.created_at,
       u.brand_plan,
       u.brand_plan_until,
       coalesce(u.brand_credits,0)::int as brand_credits,

       exists (select 1 from workspaces w where w.owner_user_id = u.id) as is_creator,
       exists (select 1 from workspace_curators wc where wc.user_id = u.id) as is_curator,
       exists (select 1 from network_moderators nm where nm.user_id = u.id) as is_moderator,
       exists (select 1 from brand_managers bm where bm.manager_user_id = u.id) as is_manager,
       exists (select 1 from brand_profiles bp where bp.user_id = u.id) as has_brand_profile
     from users u
     ${whereSql}
     order by u.created_at desc
     limit $1 offset $2`,
    params
  );
  return r.rows || [];
}

/**
 * Admin: export users for CSV (same filters as listUsersDirectory, but up to 10 000 rows).
 * Returns flat rows with all fields needed for CSV.
 */
export async function exportUsersDirectory(filterRaw = 'all', qRaw = '') {
  const filter = String(filterRaw || 'all').toLowerCase();
  const MAX_EXPORT = 10000;

  const q0 = String(qRaw || '').trim();
  const q = q0.replace(/^@/, '').toLowerCase();

  const where = [];
  if (filter === 'brands') {
    where.push(`(
      exists (select 1 from brand_profiles bp where bp.user_id = u.id)
      or u.brand_plan is not null
      or coalesce(u.brand_credits,0) > 0
    )`);
  } else if (filter === 'creators') {
    where.push(`exists (select 1 from workspaces w where w.owner_user_id = u.id)`);
  } else if (filter === 'curators') {
    where.push(`(
      exists (select 1 from workspace_curators wc where wc.user_id = u.id)
      or exists (select 1 from network_moderators nm where nm.user_id = u.id)
    )`);
  } else if (filter === 'managers') {
    where.push(`exists (select 1 from brand_managers bm where bm.manager_user_id = u.id)`);
  }

  const params = [MAX_EXPORT];
  if (q) {
    if (/^\d+$/.test(q)) {
      const n = Number(q);
      params.push(n);
      params.push(n);
      const i = params.length - 1;
      where.push(`(u.tg_id = $${i} or u.id = $${i + 1})`);
    } else {
      params.push(`%${q}%`);
      const i = params.length;
      where.push(`lower(coalesce(u.tg_username,'')) like $${i}`);
    }
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';

  const r = await pool.query(
    `select
       u.id as user_id,
       u.tg_id,
       u.tg_username,
       u.created_at,
       u.updated_at,
       u.brand_plan,
       u.brand_plan_until,
       coalesce(u.brand_credits,0)::int as brand_credits,
       coalesce(u.brand_credits_spent,0)::int as brand_credits_spent,
       exists (select 1 from workspaces w where w.owner_user_id = u.id) as is_creator,
       exists (select 1 from workspace_curators wc where wc.user_id = u.id) as is_curator,
       exists (select 1 from network_moderators nm where nm.user_id = u.id) as is_moderator,
       exists (select 1 from brand_managers bm where bm.manager_user_id = u.id) as is_manager,
       exists (select 1 from brand_profiles bp where bp.user_id = u.id) as has_brand_profile
     from users u
     ${whereSql}
     order by u.created_at desc
     limit $1`,
    params
  );
  return { rows: r.rows || [], truncated: (r.rows || []).length >= MAX_EXPORT };
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

// Spend Brand Pass credits (atomic, no negatives). Returns new balance or null if insufficient.
export async function spendBrandCredits(userId, cost = 1) {
  const c = Math.max(1, Math.floor(Number(cost) || 1));
  const r = await pool.query(
    `update users
     set brand_credits = brand_credits - $2,
         brand_credits_spent = brand_credits_spent + $2,
         updated_at=now()
     where id=$1 and brand_credits >= $2
     returning brand_credits`,
    [Number(userId), c]
  );
  if (!r.rows.length) return null;
  return Number(r.rows[0]?.brand_credits ?? 0);
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
async function takeAvailableRetryCreditForUpdate(client, userId) {
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

async function redeemRetryCredit(client, retryId, redeemedThreadId) {
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

// Minimal rule: "brand" is a user without any workspaces.
export async function userHasWorkspace(userId) {
  const r = await pool.query(`select 1 from workspaces where owner_user_id=$1 limit 1`, [userId]);
  return r.rowCount > 0;
}

// Workspaces
export async function createWorkspace({ ownerUserId, title, channelId, channelUsername }) {
  const r = await pool.query(
    `insert into workspaces (owner_user_id, title, channel_id, channel_username)
     values ($1,$2,$3,$4)
     on conflict (owner_user_id, channel_id)
     do update set title = excluded.title, channel_username = excluded.channel_username
     returning *`,
    [ownerUserId, title, channelId, channelUsername || null]
  );
  const ws = r.rows[0];
  await ensureWorkspaceSettings(ws.id);
  return ws;
}

export async function ensureWorkspaceSettings(workspaceId) {
  await pool.query(
    `insert into workspace_settings (workspace_id)
     values ($1)
     on conflict (workspace_id) do nothing`,
    [workspaceId]
  );
}

export async function listWorkspaces(ownerUserId) {
  const r = await pool.query(
    `select ws.*, s.network_enabled, s.curator_enabled, s.auto_draw_default, s.auto_publish_default,
            s.plan, s.pro_until, s.pro_pinned_offer_id,
            s.profile_title, s.profile_niche, s.profile_contact, s.profile_geo,
            s.profile_mode, s.profile_ig, s.profile_verticals, s.profile_formats, s.profile_portfolio_urls, s.profile_about
     from workspaces ws
     left join workspace_settings s on s.workspace_id = ws.id
     where ws.owner_user_id=$1
     order by ws.created_at desc`,
    [ownerUserId]
  );
  return r.rows;
}

export async function getWorkspace(ownerUserId, workspaceId) {
  const r = await pool.query(
    `select ws.*, s.network_enabled, s.curator_enabled, s.auto_draw_default, s.auto_publish_default,
            s.plan, s.pro_until, s.pro_pinned_offer_id,
            s.profile_title, s.profile_niche, s.profile_contact, s.profile_geo,
            s.profile_mode, s.profile_ig, s.profile_verticals, s.profile_formats, s.profile_portfolio_urls, s.profile_about
     from workspaces ws
     left join workspace_settings s on s.workspace_id = ws.id
     where ws.owner_user_id=$1 and ws.id=$2`,
    [ownerUserId, workspaceId]
  );
  return r.rows[0] || null;
}



// Workspaces (admin/helpers)
export async function getWorkspaceAny(workspaceId) {
  const r = await pool.query(
    `select ws.*, s.network_enabled, s.curator_enabled, s.auto_draw_default, s.auto_publish_default,
            s.plan, s.pro_until, s.pro_pinned_offer_id,
            s.profile_title, s.profile_niche, s.profile_contact, s.profile_geo,
            s.profile_mode, s.profile_ig, s.profile_verticals, s.profile_formats, s.profile_portfolio_urls, s.profile_about
     from workspaces ws
     left join workspace_settings s on s.workspace_id = ws.id
     where ws.id=$1`,
    [workspaceId]
  );
  return r.rows[0] || null;
}

export async function findWorkspaceByChannelUsername(channelUsername) {
  const u = String(channelUsername || '').replace(/^@/, '').toLowerCase();
  const r = await pool.query(
    `select ws.*, s.network_enabled, s.curator_enabled, s.auto_draw_default, s.auto_publish_default,
            s.plan, s.pro_until, s.pro_pinned_offer_id,
            s.profile_title, s.profile_niche, s.profile_contact, s.profile_geo,
            s.profile_mode, s.profile_ig, s.profile_verticals, s.profile_formats, s.profile_portfolio_urls, s.profile_about
     from workspaces ws
     left join workspace_settings s on s.workspace_id = ws.id
     where lower(ws.channel_username)= $1
     limit 1`,
    [u]
  );
  return r.rows[0] || null;
}

export async function isWorkspacePro(workspaceId) {
  const r = await pool.query(
    `select plan, pro_until from workspace_settings where workspace_id=$1`,
    [workspaceId]
  );
  const row = r.rows[0];
  if (!row) return false
  const plan = String(row.plan || 'free');
  const until = row.pro_until;
  if (plan !== 'pro') return false;
  if (!until) return true;
  return new Date(until).getTime() > Date.now();
}

export async function activateWorkspacePro(workspaceId, days) {
  await pool.query(
    `update workspace_settings
     set plan='pro',
         pro_until = coalesce(pro_until, now()) + ($2::int || ' days')::interval,
         updated_at=now()
     where workspace_id=$1`,
    [workspaceId, Number(days || 30)]
  );
}

export async function setWorkspacePinnedOffer(workspaceId, offerId) {
  await pool.query(
    `update workspace_settings
     set pro_pinned_offer_id=$2, updated_at=now()
     where workspace_id=$1`,
    [workspaceId, offerId]
  );
}

export async function countActiveBarterOffers(workspaceId) {
  const r = await pool.query(
    `select count(*)::int as cnt from barter_offers where workspace_id=$1 and status='ACTIVE'`,
    [workspaceId]
  );
  return Number(r.rows[0]?.cnt || 0);
}
export async function setWorkspaceSetting(workspaceId, patch) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k}=$${i + 2}`);
  const vals = keys.map(k => patch[k]);
  await pool.query(
    `update workspace_settings set ${sets.join(', ')}, updated_at=now() where workspace_id=$1`,
    [workspaceId, ...vals]
  );
}

// Curators
export async function addCurator(workspaceId, curatorUserId, addedByUserId) {
  const r = await pool.query(
    `insert into workspace_curators (workspace_id, user_id, added_by_user_id)
     values ($1,$2,$3)
     on conflict (workspace_id, user_id) do nothing
     returning id`,
    [workspaceId, curatorUserId, addedByUserId]
  );
  return r.rowCount ? r.rows[0] : null;
}

export async function listCurators(workspaceId) {
  const r = await pool.query(
    `select c.id, u.id as user_id, u.tg_id, u.tg_username, c.created_at
     from workspace_curators c
     join users u on u.id = c.user_id
     where c.workspace_id=$1
     order by c.created_at desc`,
    [workspaceId]
  );
  return r.rows;
}


// Curator activity summary for HQ (no migrations): aggregate giveaway_audit for the workspace.
export async function getCuratorWorkspaceSummary(workspaceId, windowDays = 30, limit = 50) {
  const days = Math.max(1, Math.min(365, Number(windowDays || 30)));
  const lim = Math.max(1, Math.min(200, Number(limit || 50)));
  const r = await pool.query(
    `select
       u.id as user_id,
       u.tg_username,
       count(*)::int as actions,
       count(*) filter (where a.action='curator.note')::int as notes,
       count(*) filter (where a.action='gw.reminder_posted' and (a.payload->>'actor_role')='curator')::int as reminders,
       count(*) filter (where a.action='curator.owner_notified')::int as notifies,
       max(a.created_at) as last_at
     from giveaway_audit a
     join users u on u.id = a.actor_user_id
     where a.workspace_id=$1
       and a.actor_user_id is not null
       and a.created_at >= now() - ($2::text || ' days')::interval
     group by u.id, u.tg_username
     order by last_at desc nulls last
     limit $3`,
    [workspaceId, days, lim]
  );
  return r.rows;
}


export async function getCuratorLeadStats(workspaceId, windowDays = 30) {
  const wsId = Number(workspaceId || 0);
  const days = Math.max(1, Math.min(365, Number(windowDays || 30)));
  if (!wsId) return [];

  const r = await pool.query(
    `with take_events as (
        select
          nullif(l.meta->>'in_progress_by','')::int as user_id,
          count(*)::int as taken_cnt,
          max(coalesce(nullif(l.meta->>'in_progress_at','')::timestamptz, l.updated_at)) as last_at
        from brand_leads l
        where l.workspace_id=$1
          and coalesce(nullif(l.meta->>'in_progress_by',''), '') <> ''
          and coalesce(nullif(l.meta->>'in_progress_at','')::timestamptz, l.updated_at) >= (now() - ($2::int * interval '1 day'))
        group by 1
    ),
    close_events as (
        select
          nullif(l.meta->>'closed_by','')::int as user_id,
          count(*)::int as closed_cnt,
          max(coalesce(nullif(l.meta->>'closed_at','')::timestamptz, l.updated_at)) as last_at
        from brand_leads l
        where l.workspace_id=$1
          and coalesce(nullif(l.meta->>'closed_by',''), '') <> ''
          and coalesce(nullif(l.meta->>'closed_at','')::timestamptz, l.updated_at) >= (now() - ($2::int * interval '1 day'))
        group by 1
    )
    select
      coalesce(t.user_id, c.user_id) as user_id,
      coalesce(t.taken_cnt,0)::int as taken_cnt,
      coalesce(c.closed_cnt,0)::int as closed_cnt,
      greatest(coalesce(t.last_at, 'epoch'::timestamptz), coalesce(c.last_at, 'epoch'::timestamptz)) as last_at
    from take_events t
    full join close_events c on c.user_id = t.user_id
    where coalesce(t.user_id, c.user_id) is not null`,
    [wsId, days]
  );
  return r.rows || [];
}

export async function removeCurator(workspaceId, curatorUserId) {
  await pool.query(
    `delete from workspace_curators where workspace_id=$1 and user_id=$2`,
    [workspaceId, curatorUserId]
  );
}

export async function hasAnyCuratorRole(userId) {
  const r = await pool.query(
    `select 1 from workspace_curators where user_id=$1 limit 1`,
    [userId]
  );
  return r.rowCount > 0;
}

export async function listCuratorWorkspaces(userId) {
  const r = await pool.query(
    `select ws.id, ws.title, ws.channel_id, ws.channel_username, ws.owner_user_id, ss.curator_enabled
     from workspace_curators c
     join workspaces ws on ws.id = c.workspace_id
     left join workspace_settings ss on ss.workspace_id = ws.id
     where c.user_id=$1
     order by ws.created_at desc`,
    [userId]
  );
  return r.rows;
}

export async function isCuratorForWorkspace(workspaceId, userId) {
  const wsId = Number(workspaceId || 0);
  const uId = Number(userId || 0);
  if (!wsId || !uId) return false;

  const r = await pool.query(
    `select
        (ws.owner_user_id = $2) as is_owner,
        coalesce(s.curator_enabled, false) as curator_enabled,
        exists(select 1 from workspace_curators c where c.workspace_id = ws.id and c.user_id = $2) as is_curator
     from workspaces ws
     left join workspace_settings s on s.workspace_id = ws.id
     where ws.id = $1
     limit 1`,
    [wsId, uId]
  );
  const row = r.rows[0];
  if (!row) return false;
  if (row.is_owner) return true;
  return !!row.curator_enabled && !!row.is_curator;
}

export async function listGiveawaysForCurator(workspaceId, userId, limit = 25) {
  const lim = Math.max(1, Math.min(50, Number(limit || 25)));
  const r = await pool.query(
    `select g.*
     from giveaways g
     join workspaces ws on ws.id = g.workspace_id
     left join workspace_settings ss on ss.workspace_id = ws.id
     where g.workspace_id=$1
       and (
         ws.owner_user_id=$2
         or (ss.curator_enabled=true and exists(
           select 1 from workspace_curators c where c.workspace_id=ws.id and c.user_id=$2
         ))
       )
     order by g.created_at desc
     limit $3`,
    [workspaceId, userId, lim]
  );
  return r.rows;
}

export async function getGiveawayForCurator(giveawayId, userId) {
  const r = await pool.query(
    `select g.*, ws.owner_user_id, ws.channel_id, ws.channel_username, ws.title as workspace_title, ss.curator_enabled
     from giveaways g
     join workspaces ws on ws.id = g.workspace_id
     left join workspace_settings ss on ss.workspace_id = ws.id
     where g.id=$1
       and (
         ws.owner_user_id=$2
         or (ss.curator_enabled=true and exists(
           select 1 from workspace_curators c where c.workspace_id=ws.id and c.user_id=$2
         ))
       )`,
    [giveawayId, userId]
  );
  return r.rows[0] || null;
}

// Workspace audit
function sanitizeAuditPrefix(p) {
  return String(p || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

async function incrAuditThrottleSuppressed(prefix) {
  // Redis-only metric (no DB). Keep cardinality low: total + per-prefix, per-day.
  try {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD (UTC)
    const ttlSec = 35 * 86400;

    const totalKey = rk(['audit', 'throttle', 'suppressed', day]);
    const pKey = rk(['audit', 'throttle', 'suppressed', 'p', sanitizeAuditPrefix(prefix), day]);

    const [t, p] = await Promise.all([
      redis.incr(totalKey),
      redis.incr(pKey)
    ]);

    if (t === 1) await redis.expire(totalKey, ttlSec);
    if (p === 1) await redis.expire(pKey, ttlSec);
  } catch {
    // metrics must never break bot UX
  }
}

export async function auditWorkspace(workspaceId, actorUserId, action, payload = {}) {
  if (!CFG.AUDIT_DB_ENABLED) return null;

  const wsId = Number(workspaceId) || 0;
  const act = String(action || '').trim();
  if (!wsId || !act) return null;

  // Write-shedding for noisy actions to reduce Neon CU:
  // throttle only selected prefixes (default: lead./folders./ws.profile_)
  if (CFG.AUDIT_DB_THROTTLE_ENABLED && (Number(CFG.AUDIT_DB_THROTTLE_LIMIT) || 0) > 0) {
    const prefixes = Array.isArray(CFG.AUDIT_DB_THROTTLE_PREFIXES) ? CFG.AUDIT_DB_THROTTLE_PREFIXES : [];
    const hit = prefixes.find((p) => p && act.startsWith(p));
    if (hit) {
      try {
        const key = rk(['audit', 'ws', wsId, hit]);
        const rl = await rateLimit(key, {
          limit: CFG.AUDIT_DB_THROTTLE_LIMIT,
          windowSec: CFG.AUDIT_DB_THROTTLE_WINDOW_SEC,
        });
        if (!rl.allowed) {
          // Track how many inserts we suppressed (Redis-only; no DB)
          await incrAuditThrottleSuppressed(hit);
          return null;
        }
      } catch {
        // Fail open: audit must never break bot UX
      }
    }
  }

  try {
    await pool.query(
      `insert into workspace_audit (workspace_id, actor_user_id, action, payload)
       values ($1,$2,$3,$4::jsonb)`,
      [wsId, actorUserId, act, JSON.stringify(payload || {})]
    );
    return true;
  } catch {
    // Missing table/migration or any DB error should not break bot UX.
    return null;
  }
}


export async function listWorkspaceAudit(workspaceId, limit = 30) {
  const r = await pool.query(
    `select action, payload, created_at
     from workspace_audit
     where workspace_id=$1
     order by created_at desc
     limit $2`,
    [workspaceId, limit]
  );
  return r.rows;
}

// Detailed audit list with optional filters.
// Used for Curator Manager / owner-only audit log.
// Notes:
// - actionPrefix may be an empty string to disable action filtering.
// - leadId is matched against payload.lead_id (int) when present.
export async function listWorkspaceAuditDetailed(workspaceId, opts = {}) {
  const {
    actionPrefix = '',
    actorUserId = 0,
    leadId = 0,
    limit = 20,
    offset = 0,
    onlyRole = '',
  } = (opts || {});

  const wh = ['a.workspace_id = $1'];
  const args = [Number(workspaceId)];
  let idx = 2;

  if (actionPrefix) {
    wh.push(`a.action like $${idx} || '%'`);
    args.push(String(actionPrefix));
    idx += 1;
  }

  if (Number(actorUserId) > 0) {
    wh.push(`a.actor_user_id = $${idx}`);
    args.push(Number(actorUserId));
    idx += 1;
  }

  if (Number(leadId) > 0) {
    // payload may store lead_id as number or string; cast defensively
    wh.push(`(a.payload->>'lead_id')::int = $${idx}`);
    args.push(Number(leadId));
    idx += 1;
  }

  if (onlyRole) {
    wh.push(`coalesce(a.payload->>'actor_role','') = $${idx}`);
    args.push(String(onlyRole));
    idx += 1;
  }

  args.push(Math.max(1, Math.min(50, Number(limit) || 20)));
  args.push(Math.max(0, Number(offset) || 0));

  const r = await pool.query(
    `select a.action, a.payload, a.created_at, a.actor_user_id,
            u.tg_username, u.tg_id
     from workspace_audit a
     left join users u on u.id = a.actor_user_id
     where ${wh.join(' and ')}
     order by a.created_at desc
     limit $${idx} offset $${idx + 1}`,
    args
  );
  return r.rows;
}

export async function countWorkspaceAuditDetailed(workspaceId, opts = {}) {
  const {
    actionPrefix = '',
    actorUserId = 0,
    leadId = 0,
    onlyRole = '',
  } = (opts || {});

  const wh = ['workspace_id = $1'];
  const args = [Number(workspaceId)];
  let idx = 2;

  if (actionPrefix) {
    wh.push(`action like $${idx} || '%'`);
    args.push(String(actionPrefix));
    idx += 1;
  }
  if (Number(actorUserId) > 0) {
    wh.push(`actor_user_id = $${idx}`);
    args.push(Number(actorUserId));
    idx += 1;
  }
  if (Number(leadId) > 0) {
    wh.push(`(payload->>'lead_id')::int = $${idx}`);
    args.push(Number(leadId));
    idx += 1;
  }
  if (onlyRole) {
    wh.push(`coalesce(payload->>'actor_role','') = $${idx}`);
    args.push(String(onlyRole));
    idx += 1;
  }

  const r = await pool.query(
    `select count(*)::int as cnt
     from workspace_audit
     where ${wh.join(' and ')}`,
    args
  );
  return Number(r.rows?.[0]?.cnt || 0);
}

/**
 * Admin: global audit search across all workspaces.
 * Supports: action prefix, wsId, userId, time range, pagination.
 */
export async function searchGlobalAudit(opts = {}) {
  const {
    action = '',
    wsId = 0,
    userId = 0,
    afterHours = 0,
    limit = 20,
    offset = 0,
  } = (opts || {});

  const wh = [];
  const args = [];
  let idx = 1;

  if (action) { wh.push(`a.action like $${idx} || '%'`); args.push(String(action)); idx++; }
  if (Number(wsId) > 0) { wh.push(`a.workspace_id = $${idx}`); args.push(Number(wsId)); idx++; }
  if (Number(userId) > 0) { wh.push(`a.actor_user_id = $${idx}`); args.push(Number(userId)); idx++; }
  if (Number(afterHours) > 0) { wh.push(`a.created_at >= now() - interval '1 hour' * $${idx}`); args.push(Number(afterHours)); idx++; }

  const whereSql = wh.length ? `where ${wh.join(' and ')}` : '';
  const limIdx = idx; args.push(Math.max(1, Math.min(50, Number(limit) || 20))); idx++;
  const offIdx = idx; args.push(Math.max(0, Number(offset) || 0));

  const r = await pool.query(
    `select a.id, a.workspace_id, a.actor_user_id, a.action, a.payload, a.created_at,
            u.tg_username, u.tg_id,
            w.title as ws_title, w.channel_username as ws_channel
     from workspace_audit a
     left join users u on u.id = a.actor_user_id
     left join workspaces w on w.id = a.workspace_id
     ${whereSql}
     order by a.created_at desc
     limit $${limIdx} offset $${offIdx}`,
    args
  );
  return r.rows || [];
}

export async function countGlobalAudit(opts = {}) {
  const { action = '', wsId = 0, userId = 0, afterHours = 0 } = (opts || {});
  const wh = [];
  const args = [];
  let idx = 1;
  if (action) { wh.push(`action like $${idx} || '%'`); args.push(String(action)); idx++; }
  if (Number(wsId) > 0) { wh.push(`workspace_id = $${idx}`); args.push(Number(wsId)); idx++; }
  if (Number(userId) > 0) { wh.push(`actor_user_id = $${idx}`); args.push(Number(userId)); idx++; }
  if (Number(afterHours) > 0) { wh.push(`created_at >= now() - interval '1 hour' * $${idx}`); args.push(Number(afterHours)); idx++; }
  const whereSql = wh.length ? `where ${wh.join(' and ')}` : '';
  const r = await pool.query(`select count(*)::int as cnt from workspace_audit ${whereSql}`, args);
  return Number(r.rows?.[0]?.cnt || 0);
}

export async function exportGlobalAudit(opts = {}) {
  const { action = '', wsId = 0, userId = 0, afterHours = 0 } = (opts || {});
  const MAX = 5000;
  const wh = [];
  const args = [];
  let idx = 1;
  if (action) { wh.push(`a.action like $${idx} || '%'`); args.push(String(action)); idx++; }
  if (Number(wsId) > 0) { wh.push(`a.workspace_id = $${idx}`); args.push(Number(wsId)); idx++; }
  if (Number(userId) > 0) { wh.push(`a.actor_user_id = $${idx}`); args.push(Number(userId)); idx++; }
  if (Number(afterHours) > 0) { wh.push(`a.created_at >= now() - interval '1 hour' * $${idx}`); args.push(Number(afterHours)); idx++; }
  const whereSql = wh.length ? `where ${wh.join(' and ')}` : '';
  args.push(MAX);
  const r = await pool.query(
    `select a.id, a.workspace_id, a.actor_user_id, a.action, a.payload, a.created_at,
            u.tg_username, u.tg_id,
            w.title as ws_title, w.channel_username as ws_channel
     from workspace_audit a
     left join users u on u.id = a.actor_user_id
     left join workspaces w on w.id = a.workspace_id
     ${whereSql}
     order by a.created_at desc
     limit $${idx}`,
    args
  );
  return { rows: r.rows || [], truncated: (r.rows || []).length >= MAX };
}

// Giveaways
export async function createGiveaway({ workspaceId, prizeValueText, winnersCount, endsAt, autoDraw, autoPublish }) {
  const r = await pool.query(
    `insert into giveaways (workspace_id, prize_value_text, winners_count, ends_at, auto_draw, auto_publish)
     values ($1,$2,$3,$4,$5,$6)
     returning *`,
    [workspaceId, prizeValueText || null, winnersCount || 1, endsAt || null, !!autoDraw, !!autoPublish]
  );
  return r.rows[0];
}

export async function updateGiveaway(giveawayId, patch) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k}=$${i + 2}`);
  const vals = keys.map(k => patch[k]);
  await pool.query(
    `update giveaways set ${sets.join(', ')}, updated_at=now() where id=$1`,
    [giveawayId, ...vals]
  );
}

export async function getGiveawayForOwner(giveawayId, ownerUserId) {
  const r = await pool.query(
    `select g.*, ws.owner_user_id, ws.channel_id, ws.channel_username, ws.title as workspace_title
     from giveaways g
     join workspaces ws on ws.id = g.workspace_id
     where g.id=$1 and ws.owner_user_id=$2`,
    [giveawayId, ownerUserId]
  );
  return r.rows[0] || null;
}

export async function deleteGiveawayForOwner(giveawayId, ownerUserId) {
  // Hard delete (cascades: sponsors/entries/winners/audit).
  // We owner-gate via workspaces join.
  const r = await pool.query(
    `delete from giveaways g
     using workspaces ws
     where g.id=$1
       and g.workspace_id = ws.id
       and ws.owner_user_id = $2
     returning g.id, g.workspace_id`,
    [Number(giveawayId), Number(ownerUserId)]
  );
  return r.rows[0] || null;
}

export async function getGiveawayPublic(giveawayId) {
  const r = await pool.query(
    `select id, workspace_id, status, ends_at, published_chat_id
     from giveaways
     where id=$1`,
    [giveawayId]
  );
  return r.rows[0] || null;
}

export async function getGiveawayInfoForUser(giveawayId) {
  const r = await pool.query(
    `select id, workspace_id, status, ends_at, prize_value_text, winners_count, published_chat_id
     from giveaways
     where id=$1`,
    [giveawayId]
  );
  return r.rows[0] || null;
}

export async function getGiveawayById(giveawayId) {
  const r = await pool.query(
    `select g.*, w.title as ws_title, w.channel_username as ws_username
     from giveaways g
     join workspaces w on w.id = g.workspace_id
     where g.id=$1`,
    [giveawayId]
  );
  return r.rows[0] || null;
}

export async function getWinnersWithTgId(giveawayId) {
  const r = await pool.query(
    `select w.place, u.tg_id, u.tg_username
     from giveaway_winners w
     join users u on u.id = w.user_id
     where w.giveaway_id=$1
     order by w.place asc`,
    [giveawayId]
  );
  return r.rows.map(x => ({ place: Number(x.place), tg_id: Number(x.tg_id), username: x.tg_username || null }));
}

export async function listGiveaways(ownerUserId, limit = 20) {
  const r = await pool.query(
    `select g.*, ws.title as workspace_title
     from giveaways g
     join workspaces ws on ws.id = g.workspace_id
     where ws.owner_user_id=$1
     order by g.created_at desc
     limit $2`,
    [ownerUserId, limit]
  );
  return r.rows;
}

// Sponsors
export async function replaceGiveawaySponsors(giveawayId, sponsorTexts) {
  await pool.query(`delete from giveaway_sponsors where giveaway_id=$1`, [giveawayId]);
  let pos = 1;
  for (const s of sponsorTexts) {
    await pool.query(
      `insert into giveaway_sponsors (giveaway_id, position, sponsor_text)
       values ($1,$2,$3)`,
      [giveawayId, pos++, s]
    );
  }
}

export async function listGiveawaySponsors(giveawayId) {
  const r = await pool.query(
    `select sponsor_text, position
     from giveaway_sponsors
     where giveaway_id=$1
     order by position asc`,
    [giveawayId]
  );
  return r.rows;
}

// Entries
export async function upsertGiveawayEntry(giveawayId, userId) {
  await pool.query(
    `insert into giveaway_entries (giveaway_id, user_id, joined_at, is_eligible)
     values ($1,$2, now(), false)
     on conflict (giveaway_id, user_id)
     do update set joined_at = giveaway_entries.joined_at`,
    [giveawayId, userId]
  );
}

export async function getEntryStatus(giveawayId, userId) {
  const r = await pool.query(
    `select is_eligible, joined_at, last_checked_at
     from giveaway_entries
     where giveaway_id=$1 and user_id=$2`,
    [giveawayId, userId]
  );
  return r.rows[0] || null;
}

export async function setEntryEligibility(giveawayId, userId, isEligible) {
  await pool.query(
    `update giveaway_entries
     set is_eligible=$3, last_checked_at=now()
     where giveaway_id=$1 and user_id=$2`,
    [giveawayId, userId, !!isEligible]
  );
}

export async function getGiveawayStats(giveawayId, ownerUserId) {
  const r = await pool.query(
    `select
        count(*)::int as entries_total,
        sum(case when e.is_eligible then 1 else 0 end)::int as eligible_count,
        sum(case when not e.is_eligible then 1 else 0 end)::int as not_eligible_count,
        max(e.last_checked_at) as last_checked_at,
        max(e.joined_at) as last_joined_at
     from giveaway_entries e
     join giveaways g on g.id = e.giveaway_id
     join workspaces ws on ws.id = g.workspace_id
     where g.id=$1 and ws.owner_user_id=$2`,
    [giveawayId, ownerUserId]
  );
  return r.rows[0] || null;
}

export async function getGiveawayStatsForCurator(giveawayId, userId) {
  const r = await pool.query(
    `select
        count(e.*)::int as entries_total,
        sum(case when e.is_eligible then 1 else 0 end)::int as eligible_count,
        sum(case when not e.is_eligible then 1 else 0 end)::int as not_eligible_count,
        max(e.last_checked_at) as last_checked_at,
        max(e.joined_at) as last_joined_at
     from giveaways g
     join workspaces ws on ws.id = g.workspace_id
     left join workspace_settings ss on ss.workspace_id = ws.id
     left join giveaway_entries e on e.giveaway_id = g.id
     where g.id=$1
       and (
         ws.owner_user_id=$2
         or (ss.curator_enabled=true and exists(
           select 1 from workspace_curators c where c.workspace_id=ws.id and c.user_id=$2
         ))
       )
     group by g.id`,
    [giveawayId, userId]
  );
  return r.rows[0] || null;
}


export async function listGiveawayEntriesPage(giveawayId, ownerUserId, limit = 10, offset = 0) {
  const lim = Math.max(1, Math.min(50, Number(limit || 10)));
  const off = Math.max(0, Number(offset || 0));

  const r = await pool.query(
    `select
        e.user_id,
        u.tg_id,
        u.tg_username,
        e.is_eligible,
        e.last_checked_at,
        e.joined_at
     from giveaway_entries e
     join giveaways g on g.id = e.giveaway_id
     join workspaces ws on ws.id = g.workspace_id
     join users u on u.id = e.user_id
     where g.id=$1 and ws.owner_user_id=$2
     order by e.joined_at desc nulls last, e.user_id desc
     limit $3 offset $4`,
    [giveawayId, ownerUserId, lim, off]
  );

  return r.rows || [];
}


export async function exportGiveawayParticipantsUsernames(giveawayId, ownerUserId, onlyEligible = null) {
  const cond = onlyEligible === null ? '' : 'and e.is_eligible = ' + (onlyEligible ? 'true' : 'false');
  const r = await pool.query(
    `select u.tg_username
     from giveaway_entries e
     join giveaways g on g.id = e.giveaway_id
     join workspaces ws on ws.id = g.workspace_id
     join users u on u.id = e.user_id
     where g.id=$1 and ws.owner_user_id=$2
       and u.tg_username is not null and u.tg_username <> ''
       ${cond}
     order by lower(u.tg_username) asc`,
    [giveawayId, ownerUserId]
  );
  return r.rows.map(x => String(x.tg_username));
}

export async function exportGiveawayWinnersUsernames(giveawayId, ownerUserId) {
  const r = await pool.query(
    `select w.place, u.tg_username
     from giveaway_winners w
     join giveaways g on g.id = w.giveaway_id
     join workspaces ws on ws.id = g.workspace_id
     join users u on u.id = w.user_id
     where w.giveaway_id=$1 and ws.owner_user_id=$2
       and u.tg_username is not null and u.tg_username <> ''
     order by w.place asc`,
    [giveawayId, ownerUserId]
  );
  return r.rows.map(x => ({ place: Number(x.place), username: String(x.tg_username) }));
}

// Winners for publish/preview (include tg_id for mentions when username missing)
export async function exportGiveawayWinnersForPublish(giveawayId, ownerUserId) {
  const r = await pool.query(
    `select w.place, u.tg_id, u.tg_username
     from giveaway_winners w
     join giveaways g on g.id = w.giveaway_id
     join workspaces ws on ws.id = g.workspace_id
     join users u on u.id = w.user_id
     where w.giveaway_id=$1 and ws.owner_user_id=$2
     order by w.place asc`,
    [giveawayId, ownerUserId]
  );
  return r.rows.map(x => ({ place: Number(x.place), tg_id: Number(x.tg_id), username: x.tg_username ? String(x.tg_username) : null }));
}

// Winners
export async function setWinners(giveawayId, winners) {
  // winners: [{user_id, place}]
  await pool.query(`delete from giveaway_winners where giveaway_id=$1`, [giveawayId]);
  for (const w of winners) {
    await pool.query(
      `insert into giveaway_winners (giveaway_id, user_id, place)
       values ($1,$2,$3)`,
      [giveawayId, (w.user_id ?? w.userId), w.place]
    );
  }
}

export async function markGiveawayResultsPublished(giveawayId, ownerUserId, resultsMessageId) {
  const q = {
    text: `
      update giveaways g
      set status='RESULTS_PUBLISHED', results_message_id=$3, results_published_at=now(), updated_at=now()
      from workspaces w
      where g.id=$1 and g.workspace_id=w.id and w.owner_user_id=$2 and g.results_message_id is null
      returning g.id
    `,
    values: [giveawayId, ownerUserId, resultsMessageId],
  };
  const r = await pool.query(q);
  return r.rows[0] || null;
}

// Reserve publish to avoid double posts across retries (sets results_message_id=-1)
export async function reserveGiveawayPublish(giveawayId, ownerUserId) {
  const r = await pool.query(
    `update giveaways g
     set results_message_id = -1, updated_at=now()
     from workspaces w
     where g.id=$1 and g.workspace_id=w.id and w.owner_user_id=$2
       and g.results_message_id is null
       and upper(g.status)='WINNERS_DRAWN'
     returning g.id`,
    [giveawayId, ownerUserId]
  );
  return r.rows[0] || null;
}

export async function finalizeGiveawayPublish(giveawayId, ownerUserId, resultsMessageId) {
  const r = await pool.query(
    `update giveaways g
     set status='RESULTS_PUBLISHED', results_message_id=$3, results_published_at=now(), updated_at=now()
     from workspaces w
     where g.id=$1 and g.workspace_id=w.id and w.owner_user_id=$2
       and g.results_message_id = -1
     returning g.id`,
    [giveawayId, ownerUserId, resultsMessageId]
  );
  return r.rows[0] || null;
}

export async function releaseGiveawayPublish(giveawayId, ownerUserId) {
  const r = await pool.query(
    `update giveaways g
     set results_message_id=null, updated_at=now()
     from workspaces w
     where g.id=$1 and g.workspace_id=w.id and w.owner_user_id=$2
       and g.results_message_id = -1
     returning g.id`,
    [giveawayId, ownerUserId]
  );
  return r.rows[0] || null;
}

// Giveaway audit
export async function auditGiveaway(giveawayId, workspaceId, actorUserId, action, payload = {}) {
  await pool.query(
    `insert into giveaway_audit (giveaway_id, workspace_id, actor_user_id, action, payload)
     values ($1,$2,$3,$4,$5::jsonb)`,
    [giveawayId, workspaceId, actorUserId || null, action, JSON.stringify(payload || {})]
  );
}

export async function listGiveawayAudit(giveawayId, limit = 30) {
  const r = await pool.query(
    `select action, payload, created_at
     from giveaway_audit
     where giveaway_id=$1
     order by created_at desc
     limit $2`,
    [giveawayId, limit]
  );
  return r.rows;
}


export async function listGiveawayCuratorNotesAudit(giveawayId, limit = 3) {
  const r = await pool.query(
    `select payload, created_at
     from giveaway_audit
     where giveaway_id=$1 and action='curator.note'
     order by created_at desc
     limit $2`,
    [giveawayId, limit]
  );
  return r.rows;
}

// Worker queries
export async function listGiveawaysToEnd(limit = 50) {
  const r = await pool.query(
    `select g.id,
            g.workspace_id,
            g.ends_at,
            g.status,
            g.auto_draw,
            g.auto_publish,
            g.published_chat_id,
            g.published_message_id,
            w.owner_user_id,
            w.title as ws_title,
            w.channel_id as ws_channel_id,
            w.channel_username as ws_username
     from giveaways g
     join workspaces w on w.id = g.workspace_id
     where g.status in ('ACTIVE','PAUSED','PUBLISHED','RUNNING')
       and g.ends_at is not null
       and g.ends_at <= now()
     order by g.ends_at asc
     limit $1`,
    [limit]
  );
  return r.rows;
}

export async function listEndedGiveawaysToDraw(limit = 50) {
  const r = await pool.query(
    `select g.id, g.workspace_id, g.winners_count, g.auto_publish, g.auto_draw, g.published_chat_id, g.results_message_id, g.ends_at, w.owner_user_id
     from giveaways g
     join workspaces w on w.id = g.workspace_id
     where g.status='ENDED'
       and g.winners_drawn_at is null
     order by g.updated_at asc
     limit $1`,
    [limit]
  );
  return r.rows;
}

export async function listDrawnGiveawaysToPublish(limit = 50) {
  const r = await pool.query(
    `select id, workspace_id, published_chat_id, published_message_id, results_message_id
     from giveaways
     where status='WINNERS_DRAWN'
       and auto_publish=true
       and results_message_id is null
     order by updated_at asc
     limit $1`,
    [limit]
  );
  return r.rows;
}

export async function listEligibleUserIdsForGiveaway(giveawayId) {
  const r = await pool.query(
    `select user_id from giveaway_entries where giveaway_id=$1 and is_eligible=true`,
    [giveawayId]
  );
  return r.rows.map(x => Number(x.user_id));
}

export async function listAllUserIdsForGiveaway(giveawayId) {
  const r = await pool.query(
    `select user_id from giveaway_entries where giveaway_id=$1`,
    [giveawayId]
  );
  return r.rows.map(x => Number(x.user_id));
}

export async function listEntriesToCheck(limit = 50) {
  const r = await pool.query(
    `select e.giveaway_id, e.user_id
     from giveaway_entries e
     join giveaways g on g.id = e.giveaway_id
     where g.status <> 'ENDED'
       and e.is_eligible=false
       and (e.last_checked_at is null or e.last_checked_at < now() - interval '10 minutes')
     order by coalesce(e.last_checked_at, e.joined_at) asc
     limit $1`,
    [limit]
  );
  return r.rows;
}

// -----------------------------
// Barters marketplace (v0.9.1)
// -----------------------------

function isMissingBarterOffersMetaColumnError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '').toLowerCase();
  // 42703 = undefined_column (Postgres)
  if (code === '42703' && msg.includes('meta')) return true;
  if (msg.includes('column') && msg.includes('meta') && msg.includes('does not exist')) return true;
  return false;
}

export async function hasBarterOffersMetaColumn() {
  const r = await pool.query(
    `select 1 as ok
     from information_schema.columns
     where table_name='barter_offers'
       and column_name='meta'
     limit 1`
  );
  return r.rows.length > 0;
}


export async function createBarterOffer(input) {
  const {
    workspaceId,
    creatorUserId,
    category,
    offerType,
    compensationType,
    meta,
    title,
    description,
    partnerFolderId,
    contact,
  } = input;

  try {
    const r = await pool.query(
      `insert into barter_offers
        (workspace_id, creator_user_id, category, offer_type, compensation_type, meta, title, description, partner_folder_id, contact)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)
       returning *`,
      [workspaceId, creatorUserId || null, category, offerType, compensationType, JSON.stringify(meta || {}), title, description, partnerFolderId || null, contact || null]
    );
    return r.rows[0];
  } catch (err) {
    // Soft-fallback: if migration 028_barter_offers_meta.sql is not applied yet, publish without meta.
    if (!isMissingBarterOffersMetaColumnError(err)) throw err;
    const r = await pool.query(
      `insert into barter_offers
        (workspace_id, creator_user_id, category, offer_type, compensation_type, title, description, partner_folder_id, contact)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       returning *`,
      [workspaceId, creatorUserId || null, category, offerType, compensationType, title, description, partnerFolderId || null, contact || null]
    );
    const row = r.rows[0] || null;
    if (row) row.__meta_missing = true;
    return row;
  }
}


export async function listNetworkBarterOffers(opts = {}) {
  const { category = null, offerType = null, compensationType = null, goalsTags = null, reqTags = null, limit = 5, offset = 0 } = opts;
  try {
    const r = await pool.query(
      `select o.*, w.title as ws_title, w.channel_username, w.channel_id
       from barter_offers o
       join workspaces w on w.id = o.workspace_id
       join workspace_settings s on s.workspace_id = w.id
       where o.status='ACTIVE'
         and s.network_enabled=true
         and ($1::text is null or o.category=$1)
         and ($2::text is null or o.offer_type=$2)
         and ($3::text is null or o.compensation_type=$3)
         and ($4::text[] is null or coalesce(o.meta->'goals_tags','[]'::jsonb) ?| $4::text[])
         and ($5::text[] is null or coalesce(o.meta->'req_tags','[]'::jsonb) ?| $5::text[])
       order by case when s.plan='pro' and (s.pro_until is null or s.pro_until>now()) and s.pro_pinned_offer_id = o.id then 0 else 1 end,
                o.bump_at desc
       limit $6 offset $7`,
      [category, offerType, compensationType, goalsTags && goalsTags.length ? goalsTags : null, reqTags && reqTags.length ? reqTags : null, limit, offset]
    );
    return r.rows;
  } catch (err) {
    if (!isMissingBarterOffersMetaColumnError(err)) throw err;
    // Soft-fallback: ignore tag filters until migration 028 is applied.
    const r = await pool.query(
      `select o.*, w.title as ws_title, w.channel_username, w.channel_id
       from barter_offers o
       join workspaces w on w.id = o.workspace_id
       join workspace_settings s on s.workspace_id = w.id
       where o.status='ACTIVE'
         and s.network_enabled=true
         and ($1::text is null or o.category=$1)
         and ($2::text is null or o.offer_type=$2)
         and ($3::text is null or o.compensation_type=$3)
       order by case when s.plan='pro' and (s.pro_until is null or s.pro_until>now()) and s.pro_pinned_offer_id = o.id then 0 else 1 end,
                o.bump_at desc
       limit $4 offset $5`,
      [category, offerType, compensationType, limit, offset]
    );
    const rows = r.rows || [];
    for (const row of rows) row.__meta_missing = true;
    return rows;
  }
}

export async function countNetworkBarterOffers(opts = {}) {
  const { category = null, offerType = null, compensationType = null, goalsTags = null, reqTags = null } = opts;
  try {
    const r = await pool.query(
      `select count(*)::int as cnt
       from barter_offers o
       join workspaces w on w.id = o.workspace_id
       join workspace_settings s on s.workspace_id = w.id
       where o.status='ACTIVE'
         and s.network_enabled=true
         and ($1::text is null or o.category=$1)
         and ($2::text is null or o.offer_type=$2)
         and ($3::text is null or o.compensation_type=$3)
         and ($4::text[] is null or coalesce(o.meta->'goals_tags','[]'::jsonb) ?| $4::text[])
         and ($5::text[] is null or coalesce(o.meta->'req_tags','[]'::jsonb) ?| $5::text[])`,
      [category, offerType, compensationType, goalsTags && goalsTags.length ? goalsTags : null, reqTags && reqTags.length ? reqTags : null]
    );
    return Number(r.rows[0]?.cnt || 0);
  } catch (err) {
    if (!isMissingBarterOffersMetaColumnError(err)) throw err;
    const r = await pool.query(
      `select count(*)::int as cnt
       from barter_offers o
       join workspaces w on w.id = o.workspace_id
       join workspace_settings s on s.workspace_id = w.id
       where o.status='ACTIVE'
         and s.network_enabled=true
         and ($1::text is null or o.category=$1)
         and ($2::text is null or o.offer_type=$2)
         and ($3::text is null or o.compensation_type=$3)`,
      [category, offerType, compensationType]
    );
    return Number(r.rows[0]?.cnt || 0);
  }
}

export async function listBarterOffersForOwnerWorkspace(ownerUserId, workspaceId, limit = 10, offset = 0) {
  // owner gate
  const ws = await pool.query(
    `select id from workspaces where id=$1 and owner_user_id=$2`,
    [workspaceId, ownerUserId]
  );
  if (!ws.rows.length) return [];
  const r = await pool.query(
    `select *
     from barter_offers
     where workspace_id=$1
       and coalesce(status,'ACTIVE') <> 'CLOSED'
     order by coalesce(bump_at, created_at) desc
     limit $2 offset $3`,
    [workspaceId, limit, offset]
  );
  return r.rows;
}

export async function listArchivedBarterOffersForOwnerWorkspace(ownerUserId, workspaceId, limit = 10, offset = 0) {
  // owner gate
  const ws = await pool.query(
    `select id from workspaces where id=$1 and owner_user_id=$2`,
    [workspaceId, ownerUserId]
  );
  if (!ws.rows.length) return [];
  const r = await pool.query(
    `select *
     from barter_offers
     where workspace_id=$1
       and coalesce(status,'ACTIVE') = 'CLOSED'
     order by updated_at desc, created_at desc
     limit $2 offset $3`,
    [workspaceId, limit, offset]
  );
  return r.rows;
}

export async function restoreBarterOfferForOwner(offerId, ownerUserId) {
  const r = await pool.query(
    `update barter_offers o
     set status='ACTIVE', bump_at=now(), updated_at=now()
     from workspaces w
     where o.id=$1
       and o.workspace_id = w.id
       and w.owner_user_id = $2
     returning o.*`,
    [Number(offerId), Number(ownerUserId)]
  );
  return r.rows[0] || null;
}

export async function getBarterOfferForOwner(ownerUserId, offerId) {
  const r = await pool.query(
    `select o.*, w.owner_user_id
     from barter_offers o
     join workspaces w on w.id = o.workspace_id
     where o.id=$1`,
    [offerId]
  );
  const row = r.rows[0];
  if (!row) return null;
  if (Number(row.owner_user_id) !== Number(ownerUserId)) return null;
  return row;
}

export async function updateBarterOffer(offerId, patch) {
  const fields = [];
  const vals = [];
  let idx = 1;

  const allowed = ['status', 'title', 'description', 'contact', 'bump_at', 'partner_folder_id', 'media_type', 'media_file_id', 'meta'];
  for (const k2 of allowed) {
    if (patch[k2] === undefined) continue;
    fields.push(`${k2}=$${idx++}`);
    if (k2 === 'meta') vals.push(JSON.stringify(patch[k2] || {}));
    else vals.push(patch[k2]);
  }
  fields.push(`updated_at=now()`);
  vals.push(offerId);
  const sql = `update barter_offers set ${fields.join(', ')} where id=$${idx} returning *`;

  try {
    const r = await pool.query(sql, vals);
    return r.rows[0];
  } catch (err) {
    // Soft-fallback: if meta column is missing (migration 028 not applied) — retry without meta patch.
    if (!isMissingBarterOffersMetaColumnError(err)) throw err;
    if (patch && patch.meta === undefined) throw err;

    const patch2 = { ...patch };
    delete patch2.meta;

    const f2 = [];
    const v2 = [];
    let i2 = 1;
    for (const k2 of allowed) {
      if (k2 === 'meta') continue;
      if (patch2[k2] === undefined) continue;
      f2.push(`${k2}=$${i2++}`);
      v2.push(patch2[k2]);
    }
    f2.push(`updated_at=now()`);
    v2.push(offerId);

    const sql2 = `update barter_offers set ${f2.join(', ')} where id=$${i2} returning *`;
    const r2 = await pool.query(sql2, v2);
    const row = r2.rows[0] || null;
    if (row) row.__meta_missing = true;
    return row;
  }
}


export async function auditBarterOffer(offerId, workspaceId, actorUserId, action, payload = {}) {
  await pool.query(
    `insert into barter_offer_audit (offer_id, workspace_id, actor_user_id, action, payload)
     values ($1,$2,$3,$4,$5::jsonb)`,
    [offerId, workspaceId, actorUserId || null, action, JSON.stringify(payload || {})]
  );
}

export async function updateBarterOfferStatus(offerId, status) {
  return await updateBarterOffer(offerId, { status });
}

export async function bumpBarterOffer(offerId) {
  const r = await pool.query(
    `update barter_offers
     set bump_at=now(), bump_count=bump_count+1, updated_at=now()
     where id=$1
     returning *`,
    [offerId]
  );
  return r.rows[0];
}

export async function getBarterOfferPublic(offerId) {
  const r = await pool.query(
    `select o.*, w.title as ws_title, w.channel_username, w.channel_id, w.owner_user_id,
            s.network_enabled,
            s.profile_title as ws_profile_title,
            s.profile_niche as ws_profile_niche,
            s.profile_contact as ws_profile_contact,
            s.profile_geo as ws_profile_geo,
            s.profile_mode as ws_profile_mode,
            s.profile_ig as ws_profile_ig,
            s.profile_verticals as ws_profile_verticals,
            s.profile_formats as ws_profile_formats,
            s.profile_portfolio_urls as ws_profile_portfolio_urls,
            s.profile_about as ws_profile_about
     from barter_offers o
     join workspaces w on w.id = o.workspace_id
     join workspace_settings s on s.workspace_id = w.id
     where o.id=$1`,
    [offerId]
  );
  return r.rows[0] || null;
}

// -----------------------------
// Barters inbox / mini-deals (v0.9.2)
// -----------------------------

export async function getOrCreateBarterThread(offerId, buyerUserId) {
  const rOffer = await pool.query(
    `select o.id as offer_id, o.workspace_id, w.owner_user_id as seller_user_id, s.network_enabled, o.status
     from barter_offers o
     join workspaces w on w.id=o.workspace_id
     join workspace_settings s on s.workspace_id=w.id
     where o.id=$1`,
    [offerId]
  );
  const off = rOffer.rows[0];
  if (!off) return null;
  if (String(off.status).toUpperCase() !== 'ACTIVE') return null;
  if (!off.network_enabled) return null;

  const r = await pool.query(
    `insert into barter_threads (offer_id, workspace_id, buyer_user_id, seller_user_id, last_message_at)
     values ($1,$2,$3,$4, now())
     on conflict (offer_id, buyer_user_id)
     do update set updated_at=now()
     returning *`,
    [offerId, off.workspace_id, buyerUserId, off.seller_user_id]
  );
  return r.rows[0];
}

/**
 * Idempotent first-contact charging:
 * - If thread already exists => charged=false (no credits spent)
 * - If new thread created by this call => charged=true only when buyer is a "brand" (no workspaces)
 * - If brand has 0 credits => needPaywall=true
 */
export async function getOrCreateBarterThreadWithCredits(offerId, buyerUserId, opts = {}) {
  const forceBrand = !!opts.forceBrand;
  const cost = Number(opts.cost ?? 1);
  const trialCredits = Number(opts.trialCredits ?? 0);
  const dailyLimitRaw = opts.dailyLimit;
  const dailyLimit = dailyLimitRaw === null || dailyLimitRaw === undefined ? null : Number(dailyLimitRaw);

  const client = await pool.connect();
  try {
    await client.query('begin');

    // load offer
    const offerRes = await client.query(
      `select o.id, o.workspace_id, o.creator_user_id
       from barter_offers o
       where o.id=$1`,
      [offerId]
    );
    const offer = offerRes.rows[0];
    if (!offer) {
      await client.query('rollback');
      return { ok: false, error: 'offer_not_found' };
    }

    // prevent self-message (creator cannot open thread to own offer)
    if (Number(offer.creator_user_id) === Number(buyerUserId)) {
      await client.query('rollback');
      return { ok: false, self: true };
    }

    // check existing thread
    const existingRes = await client.query(
      `select * from barter_threads where offer_id=$1 and buyer_user_id=$2`,
      [offerId, buyerUserId]
    );
    if (existingRes.rows.length) {
      await client.query('commit');
      return { ok: true, thread: existingRes.rows[0], charged: false, chargedAmount: 0 };
    }

    // who is buyer
    const buyer = await client.query(
      `select id, brand_credits, brand_trial_granted
       from users
       where id=$1
       for update`,
      [buyerUserId]
    );
    const b = buyer.rows[0];
    if (!b) {
      await client.query('rollback');
      return { ok: false, error: 'buyer_not_found' };
    }

    // Minimal rule: a "brand" is a user without any workspaces.
    // We also allow forcing brand-mode explicitly (e.g., user opens Brand menu even if they have a workspace).
    let buyerIsBrand = forceBrand;
    if (!buyerIsBrand) {
      const hasWs = await client.query(
        `select 1 from workspaces where owner_user_id=$1 limit 1`,
        [buyerUserId]
      );
      buyerIsBrand = hasWs.rowCount === 0;
    }

    const requireCredits = forceBrand || buyerIsBrand;

    // Daily limit + trial (brands only)
    let dailyUsed = null;
    let trialGranted = false;
    let balance = requireCredits ? Number(b.brand_credits || 0) : null;

if (requireCredits) {
  const lim = Number.isFinite(dailyLimit) ? dailyLimit : null;
  if (lim !== null && lim > 0) {
    const usage = await client.query(
      `select used_count
       from intro_daily_usage
       where user_id=$1 and day=now()::date
       for update`,
      [buyerUserId]
    );
    dailyUsed = Number(usage.rows[0]?.used_count || 0);
    if (dailyUsed >= lim) {
      await client.query('rollback');
      return { ok: false, limitReached: true, dailyUsed, dailyLimit: lim };
    }
  }

  const normalizedCost = Number.isFinite(cost) && cost > 0 ? Math.floor(cost) : 1;
  const normalizedTrial = Number.isFinite(trialCredits) && trialCredits > 0 ? Math.floor(trialCredits) : 0;

  // Retry credits (fairness): use before paid credits (they expire).
  const retryEnabled = !!opts.retryEnabled;
  let retryUsed = false;
  let retryId = null;

  if (retryEnabled) {
    try {
      retryId = await takeAvailableRetryCreditForUpdate(client, buyerUserId);
      retryUsed = !!retryId;
    } catch (e) {
      // Rolling upgrade safety: if table doesn't exist yet, ignore.
      if (!(e && (e.code === '42P01' || String(e.message || '').includes('brand_retry_credits')))) throw e;
    }
  }

  if (!retryUsed) {
    if (balance < normalizedCost) {
      if (!b.brand_trial_granted && normalizedTrial > 0) {
        const t = await client.query(
          `update users
           set brand_credits = brand_credits + $2,
               brand_trial_granted=true,
               brand_trial_granted_at=now(),
               updated_at=now()
           where id=$1
           returning brand_credits`,
          [buyerUserId, normalizedTrial]
        );
        balance = Number(t.rows[0]?.brand_credits || balance);
        trialGranted = true;
      } else {
        await client.query('rollback');
        return { ok: false, needPaywall: true, balance };
      }
    }

    // re-check after possible trial
    if (balance < normalizedCost) {
      await client.query('rollback');
      return { ok: false, needPaywall: true, balance };
    }
  }

  // create thread (store intro payment meta if migration is applied)
  const chargeSource = retryUsed ? 'RETRY' : 'CREDITS';
  let ins;
  try {
    ins = await client.query(
      `insert into barter_threads (offer_id, workspace_id, buyer_user_id, seller_user_id, status, last_message_at, intro_cost, intro_charge_source, intro_charged_at)
       values ($1,$2,$3,$4,'OPEN',now(),$5,$6,now())
       on conflict (offer_id, buyer_user_id) do nothing
       returning *`,
      [offerId, offer.workspace_id, buyerUserId, offer.creator_user_id, normalizedCost, chargeSource]
    );
  } catch (e) {
    // 42703 = undefined_column (rolling upgrades)
    if (e && e.code === '42703') {
      ins = await client.query(
        `insert into barter_threads (offer_id, workspace_id, buyer_user_id, seller_user_id, status, last_message_at)
         values ($1,$2,$3,$4,'OPEN',now())
         on conflict (offer_id, buyer_user_id) do nothing
         returning *`,
        [offerId, offer.workspace_id, buyerUserId, offer.creator_user_id]
      );
      // best-effort backfill if columns exist
      try {
        if (ins.rows[0]?.id) {
          await client.query(
            `update barter_threads
             set intro_cost=$2, intro_charge_source=$3, intro_charged_at=now(), updated_at=now()
             where id=$1`,
            [ins.rows[0].id, normalizedCost, chargeSource]
          );
        }
      } catch {}
    } else {
      throw e;
    }
  }

  if (!ins.rows.length) {
    // someone else created concurrently
    const again = await client.query(
      `select * from barter_threads where offer_id=$1 and buyer_user_id=$2`,
      [offerId, buyerUserId]
    );
    await client.query('commit');
    return {
      ok: true,
      thread: again.rows[0] || null,
      charged: false,
      chargedAmount: 0,
      retryUsed: false,
      balance,
      trialGranted,
      dailyUsed,
      dailyLimit: Number.isFinite(dailyLimit) ? dailyLimit : null
    };
  }

  // Apply payment: retry credit OR paid credits
  if (retryUsed && retryId) {
    await redeemRetryCredit(client, retryId, ins.rows[0].id);
  } else {
    const chargedRes = await client.query(
      `update users
       set brand_credits = greatest(0, brand_credits - $2),
           brand_credits_spent = brand_credits_spent + $2,
           updated_at=now()
       where id=$1
       returning brand_credits`,
      [buyerUserId, normalizedCost]
    );
    balance = Number(chargedRes.rows[0]?.brand_credits || 0);
  }

  // track daily usage (counts retry too: it's still an intro attempt)
  const usageUp = await client.query(
    `insert into intro_daily_usage (user_id, day, used_count, updated_at)
     values ($1, now()::date, 1, now())
     on conflict (user_id, day)
     do update set used_count = intro_daily_usage.used_count + 1, updated_at=now()
     returning used_count`,
    [buyerUserId]
  );
  dailyUsed = Number(usageUp.rows[0]?.used_count || dailyUsed);

  await client.query('commit');
  return {
    ok: true,
    thread: ins.rows[0],
    charged: !retryUsed,
    chargedAmount: retryUsed ? 0 : normalizedCost,
    retryUsed,
    balance,
    trialGranted,
    dailyUsed,
    dailyLimit: Number.isFinite(dailyLimit) ? dailyLimit : null
  };
}

    // Non-brand path: create thread without credits
    const ins = await client.query(
      `insert into barter_threads (offer_id, workspace_id, buyer_user_id, seller_user_id, status, last_message_at)
       values ($1,$2,$3,$4,'OPEN',now())
       on conflict (offer_id, buyer_user_id) do nothing
       returning *`,
      [offerId, offer.workspace_id, buyerUserId, offer.creator_user_id]
    );

    if (!ins.rows.length) {
      const again = await client.query(
        `select * from barter_threads where offer_id=$1 and buyer_user_id=$2`,
        [offerId, buyerUserId]
      );
      await client.query('commit');
      return { ok: true, thread: again.rows[0] || null, charged: false, chargedAmount: 0 };
    }

    await client.query('commit');
    return { ok: true, thread: ins.rows[0], charged: false, chargedAmount: 0 };
  } catch (e) {
    try { await client.query('rollback'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export async function countBarterThreadProofs(threadId) {
  const r = await pool.query(
    `select count(*)::int as c
     from barter_thread_proofs
     where thread_id=$1`,
    [threadId]
  );
  return Number(r.rows[0]?.c ?? 0);
}

export async function listBarterThreadProofs(threadId, limit = 10) {
  const r = await pool.query(
    `select id, thread_id, kind, url, tg_file_id, tg_file_unique_id, added_by_user_id, created_at
     from barter_thread_proofs
     where thread_id=$1
     order by created_at desc
     limit $2`,
    [threadId, Number(limit || 10)]
  );
  return r.rows;
}

async function assertThreadAccess(client, threadId, userId) {
  const r = await client.query(
    `select 1
     from barter_threads
     where id=$1 and (buyer_user_id=$2 or seller_user_id=$2)
     limit 1`,
    [threadId, userId]
  );
  if (!r.rowCount) throw new Error('NO_THREAD_ACCESS');
}

export async function addBarterThreadProofLink(threadId, userId, url) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await assertThreadAccess(client, threadId, userId);
    const r = await client.query(
      `insert into barter_thread_proofs (thread_id, kind, url, added_by_user_id)
       values ($1, 'LINK', $3, $2)
       returning *`,
      [threadId, userId, String(url || '').trim()]
    );
    await client.query('commit');
    return r.rows[0] || null;
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

export async function addBarterThreadProofScreenshot(threadId, userId, fileId, fileUniqueId = null) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await assertThreadAccess(client, threadId, userId);
    const r = await client.query(
      `insert into barter_thread_proofs (thread_id, kind, tg_file_id, tg_file_unique_id, added_by_user_id)
       values ($1, 'SCREENSHOT', $3, $4, $2)
       returning *`,
      [threadId, userId, String(fileId || ''), fileUniqueId ? String(fileUniqueId) : null]
    );
    await client.query('commit');
    return r.rows[0] || null;
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

export async function addBarterMessage(threadId, senderUserId, body) {
  const r = await pool.query(
    `insert into barter_messages (thread_id, sender_user_id, body)
     values ($1,$2,$3)
     returning *`,
    [threadId, senderUserId, body]
  );

  // Rolling upgrade safe: newer columns may not exist yet on some deployments.
  try {
    await pool.query(
      `update barter_threads
       set last_message_at=now(),
           updated_at=now(),
           buyer_first_msg_at = case when buyer_first_msg_at is null and buyer_user_id=$2 then now() else buyer_first_msg_at end,
           seller_first_reply_at = case when seller_first_reply_at is null and seller_user_id=$2 then now() else seller_first_reply_at end
       where id=$1`,
      [threadId, senderUserId]
    );
  } catch (e) {
    // 42703 = undefined_column
    if (e && (e.code === '42703' || String(e.message || '').includes('does not exist'))) {
      await pool.query(
        `update barter_threads
         set last_message_at=now(), updated_at=now()
         where id=$1`,
        [threadId]
      );
    } else {
      throw e;
    }
  }

  return r.rows[0];
}

export async function closeBarterThread(threadId, userId) {
  const r = await pool.query(
    `update barter_threads
     set status='CLOSED', updated_at=now()
     where id=$1 and (buyer_user_id=$2 or seller_user_id=$2)
     returning *`,
    [threadId, userId]
  );
  return r.rows[0] || null;
}

// --- Soft delete (per-user hide) ---

export async function softDeleteBarterThread(threadId, userId) {
  const r = await pool.query(
    `update barter_threads
       set deleted_by_user_ids = coalesce(deleted_by_user_ids, '[]'::jsonb) || to_jsonb($2::bigint),
           updated_at = now()
     where id = $1
       and (buyer_user_id = $2 or seller_user_id = $2)
       and not (coalesce(deleted_by_user_ids, '[]'::jsonb) @> to_jsonb($2::bigint))
     returning id`,
    [Number(threadId), Number(userId)]
  );
  return !!r.rows[0];
}

export async function softDeleteBrandLead(leadId, userId) {
  const r = await pool.query(
    `update brand_leads
       set deleted_by_user_ids = coalesce(deleted_by_user_ids, '[]'::jsonb) || to_jsonb($2::bigint),
           updated_at = now()
     where id = $1
       and not (coalesce(deleted_by_user_ids, '[]'::jsonb) @> to_jsonb($2::bigint))
     returning id`,
    [Number(leadId), Number(userId)]
  );
  return !!r.rows[0];
}

export async function softDeleteBrandApplication(appId, userId) {
  const r = await pool.query(
    `update brand_applications
       set deleted_by_user_ids = coalesce(deleted_by_user_ids, '[]'::jsonb) || to_jsonb($2::bigint),
           updated_at = now()
     where id = $1
       and not (coalesce(deleted_by_user_ids, '[]'::jsonb) @> to_jsonb($2::bigint))
     returning id`,
    [Number(appId), Number(userId)]
  );
  return !!r.rows[0];
}

// -----------------------------
// Moderation (v1.0.0)
// -----------------------------

export async function addNetworkModerator(userId, addedByUserId) {
  const r = await pool.query(
    `insert into network_moderators (user_id, added_by_user_id)
     values ($1,$2)
     on conflict (user_id) do update set added_by_user_id=excluded.added_by_user_id
     returning user_id`,
    [userId, addedByUserId]
  );
  return r.rows[0] || null;
}

export async function removeNetworkModerator(userId) {
  await pool.query(`delete from network_moderators where user_id=$1`, [userId]);
}

export async function listNetworkModerators() {
  const r = await pool.query(
    `select m.user_id, u.tg_id, u.tg_username, m.created_at
     from network_moderators m
     join users u on u.id=m.user_id
     order by m.created_at desc`
  );
  return r.rows;
}

export async function isNetworkModerator(userId) {
  const r = await pool.query(`select 1 from network_moderators where user_id=$1`, [userId]);
  return r.rows.length > 0;
}

export async function createBarterReport(input) {
  const { workspaceId, offerId=null, threadId=null, reporterUserId=null, reason, details=null } = input;
  const r = await pool.query(
    `insert into barter_reports (workspace_id, offer_id, thread_id, reporter_user_id, reason, details)
     values ($1,$2,$3,$4,$5,$6)
     returning *`,
    [workspaceId, offerId, threadId, reporterUserId, reason, details]
  );
  return r.rows[0];
}

export async function listOpenBarterReports(limit=20, offset=0) {
  const r = await pool.query(
    `select r.*, u.tg_username as reporter_username,
            o.title as offer_title,
            w.title as ws_title, w.channel_username
     from barter_reports r
     join workspaces w on w.id=r.workspace_id
     left join users u on u.id=r.reporter_user_id
     left join barter_offers o on o.id=r.offer_id
     where r.status='OPEN'
     order by r.created_at desc
     limit $1 offset $2`,
    [limit, offset]
  );
  return r.rows;
}

export async function countOpenBarterReports() {
  const r = await pool.query(`select count(*)::int as cnt from barter_reports where status='OPEN'`);
  return Number(r.rows[0]?.cnt || 0);
}

export async function getBarterReport(reportId) {
  const r = await pool.query(
    `select r.*, u.tg_username as reporter_username,
            o.title as offer_title, o.status as offer_status,
            w.title as ws_title, w.channel_username
     from barter_reports r
     join workspaces w on w.id=r.workspace_id
     left join users u on u.id=r.reporter_user_id
     left join barter_offers o on o.id=r.offer_id
     where r.id=$1`,
    [reportId]
  );
  return r.rows[0] || null;
}

export async function resolveBarterReport(reportId, resolverUserId) {
  const r = await pool.query(
    `update barter_reports
     set status='RESOLVED', resolved_by_user_id=$2, resolved_at=now(), updated_at=now()
     where id=$1
     returning *`,
    [reportId, resolverUserId]
  );
  return r.rows[0] || null;
}

export async function moderatorCloseBarterThread(threadId) {
  const r = await pool.query(
    `update barter_threads set status='CLOSED', updated_at=now()
     where id=$1
     returning *`,
    [threadId]
  );
  return r.rows[0] || null;
}

export async function moderatorFreezeBarterOffer(offerId) {
  const r = await pool.query(
    `update barter_offers set status='PAUSED', updated_at=now() where id=$1 returning *`,
    [offerId]
  );
  return r.rows[0] || null;
}

// -----------------------------
// Brand Plan (tools subscription)
// -----------------------------

export async function getBrandPlan(userId) {
  const r = await pool.query(`select brand_plan, brand_plan_until from users where id=$1`, [userId]);
  return r.rows[0] || { brand_plan: null, brand_plan_until: null };
}

export async function isBrandPlanActive(userId) {
  const row = await getBrandPlan(userId);
  const plan = String(row.brand_plan || '').toLowerCase();
  if (!plan || plan === 'none') return false;
  const until = row.brand_plan_until;
  if (!until) return true;
  return new Date(until).getTime() > Date.now();
}

export async function activateBrandPlan(userId, plan, days) {
  const r = await pool.query(
    `update users
        set brand_plan = $2,
            brand_plan_until = (
              case
                when brand_plan_until is null or brand_plan_until < now() then now()
                else brand_plan_until
              end
            ) + ($3::int || ' days')::interval,
            brand_plan_updated_at = now(),
            updated_at = now()
      where id = $1
      returning brand_plan, brand_plan_until`,
    [userId, String(plan || 'basic'), Number(days || 30)]
  );
  return r.rows[0] || null;
}

// --- Admin: revoke subscriptions ---

export async function revokeBrandPlan(userId) {
  await pool.query(
    `update users set brand_plan = null, brand_plan_until = null, brand_plan_updated_at = now(), updated_at = now() where id = $1`,
    [Number(userId)]
  );
}

export async function resetBrandCredits(userId) {
  await pool.query(
    `update users set brand_credits = 0, updated_at = now() where id = $1`,
    [Number(userId)]
  );
}

export async function revokeAllWorkspacePro(userId) {
  await pool.query(
    `update workspace_settings set plan = 'free', pro_until = null, updated_at = now()
     where workspace_id in (select id from workspaces where owner_user_id = $1)`,
    [Number(userId)]
  );
}

// --- Admin: ban/unban ---

export async function banUser(userId) {
  await pool.query(
    `update users set banned_at = now(), updated_at = now() where id = $1`,
    [Number(userId)]
  );
}

export async function unbanUser(userId) {
  await pool.query(
    `update users set banned_at = null, updated_at = now() where id = $1`,
    [Number(userId)]
  );
}

export async function isUserBanned(userId) {
  const r = await pool.query(
    `select banned_at from users where id = $1`,
    [Number(userId)]
  );
  return !!(r.rows[0]?.banned_at);
}

export async function freezeAllUserOffers(userId) {
  await pool.query(
    `update barter_offers set status = 'FROZEN', updated_at = now()
     where workspace_id in (select id from workspaces where owner_user_id = $1) and status = 'ACTIVE'`,
    [Number(userId)]
  );
}

export async function closeAllUserThreads(userId) {
  await pool.query(
    `update barter_threads set status = 'CLOSED', updated_at = now()
     where (buyer_user_id = $1 or seller_user_id = $1) and status = 'OPEN'`,
    [Number(userId)]
  );
}

// -----------------------------
// CRM stage (buyer-side) in barter threads
// -----------------------------

export async function setBarterThreadBuyerStage(threadId, buyerUserId, stage) {
  const r = await pool.query(
    `update barter_threads
        set buyer_stage = $3,
            updated_at = now()
      where id = $1 and buyer_user_id = $2
      returning buyer_stage`,
    [threadId, buyerUserId, stage || null]
  );
  return r.rowCount ? (r.rows[0]?.buyer_stage ?? null) : null;
}

// Lightweight triage for buyer-side thread management (open / in_progress / spam).
// Rolling upgrade safe: if the column is not deployed yet, returns null.
export async function setBarterThreadTriageStatus(threadId, buyerUserId, triageStatus) {
  const s = String(triageStatus || 'open').toLowerCase();
  if (!['open', 'in_progress', 'spam'].includes(s)) return null;

  try {
    const r = await pool.query(
      `update barter_threads
          set triage_status = $3,
              updated_at = now()
        where id = $1 and buyer_user_id = $2
        returning triage_status`,
      [Number(threadId), Number(buyerUserId), s]
    );
    return r.rowCount ? (r.rows[0]?.triage_status ?? null) : null;
  } catch (e) {
    // 42703 = undefined_column
    if (e && (e.code === '42703' || String(e.message || '').includes('does not exist'))) return null;
    throw e;
  }
}

// -----------------------------
// Smart Matching
// -----------------------------

export async function createMatchingRequest(userId, tier, starsPaid) {
  const r = await pool.query(
    `insert into matching_requests (user_id, tier, stars_paid, status)
     values ($1,$2,$3,'PAID')
     returning *`,
    [userId, String(tier || 'S'), Number(starsPaid || 0)]
  );
  return r.rows[0];
}

export async function setMatchingBrief(requestId, userId, brief) {
  await pool.query(
    `update matching_requests
        set brief = $3,
            updated_at = now()
      where id = $1 and user_id = $2`,
    [requestId, userId, brief || null]
  );
}

export async function completeMatchingRequest(requestId, userId, offerIds) {
  await pool.query(
    `update matching_requests
        set result_offer_ids = $3::jsonb,
            status = 'DONE',
            updated_at = now()
      where id = $1 and user_id = $2`,
    [requestId, userId, JSON.stringify(offerIds || [])]
  );
}

export async function getMatchingRequest(requestId, userId) {
  const r = await pool.query(
    `select * from matching_requests where id=$1 and user_id=$2`,
    [requestId, userId]
  );
  return r.rows[0] || null;
}

// naive keyword search over active network offers
export async function searchNetworkBarterOffersByBrief(brief, limit = 10) {
  const q = String(brief || '').trim().toLowerCase();
  if (!q) return [];

  const raw = q
    .replace(/[^\p{L}\p{N}\s@._-]+/gu, ' ')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3)
    .slice(0, 8);

  if (!raw.length) return [];

  const terms = [...new Set(raw)];
  const conds = [];
  const params = [];
  let idx = 1;
  for (const t of terms) {
    const pat = `%${t}%`;
    params.push(pat, pat);
    conds.push(`(lower(o.title) like $${idx} or lower(o.description) like $${idx + 1})`);
    idx += 2;
  }

  params.push(Number(limit));

  const sql = `
    select o.*, w.title as ws_title, w.channel_username
      from barter_offers o
      join workspaces w on w.id = o.workspace_id
      join workspace_settings s on s.workspace_id = w.id
     where s.network_enabled = true
       and upper(o.status) = 'ACTIVE'
       and (${conds.join(' or ')})
     order by coalesce(o.bump_at, o.created_at) desc
     limit $${idx}
  `;

  const r = await pool.query(sql, params);
  return r.rows;
}

// -----------------------------
// Featured placements
// -----------------------------

export async function createFeaturedPlacement(userId, durationDays, starsPaid) {
  const r = await pool.query(
    `insert into featured_placements (user_id, duration_days, stars_paid, status)
     values ($1,$2,$3,'WAIT_CONTENT')
     returning *`,
    [userId, Number(durationDays || 1), Number(starsPaid || 0)]
  );
  return r.rows[0];
}

export async function activateFeaturedPlacementWithContent(id, userId, title, body, contact) {
  const r = await pool.query(
    `update featured_placements
        set title = $3,
            body = $4,
            contact = $5,
            status = 'ACTIVE',
            starts_at = now(),
            ends_at = now() + (duration_days::int * interval '1 day'),
            updated_at = now()
      where id = $1 and user_id = $2
      returning *`,
    [id, userId, title || null, body || null, contact || null]
  );
  return r.rows[0] || null;
}

export async function stopFeaturedPlacement(id, userId) {
  const r = await pool.query(
    `update featured_placements
        set status = 'STOPPED',
            ends_at = now(),
            updated_at = now()
      where id = $1 and user_id = $2
      returning id`,
    [id, userId]
  );
  return r.rowCount > 0;
}

export async function getFeaturedPlacement(id) {
  const r = await pool.query(`select * from featured_placements where id=$1`, [id]);
  return r.rows[0] || null;
}

export async function listActiveFeatured(limit = 5) {
  const r = await pool.query(
    `select *
       from featured_placements
      where status='ACTIVE'
        and (starts_at is null or starts_at <= now())
        and (ends_at is null or ends_at > now())
      order by coalesce(ends_at, now()) desc, created_at desc
      limit $1`,
    [Number(limit || 5)]
  );
  return r.rows;
}

export async function listFeaturedForUser(userId, limit = 10) {
  const r = await pool.query(
    `select * from featured_placements where user_id=$1 order by created_at desc limit $2`,
    [userId, Number(limit || 10)]
  );
  return r.rows;
}


// -----------------------------
// -----------------------------
// Official channel posts
// -----------------------------

export async function getOfficialPostByOfferId(offerId) {
  const r = await pool.query(`select * from official_posts where offer_id=$1`, [Number(offerId)]);
  return r.rows[0] || null;
}

export async function upsertOfficialPostDraft(input = {}) {
  const offerId = Number(input.offerId);
  const channelChatId = Number(input.channelChatId);
  const placementType = String(input.placementType || 'MANUAL');
  const paymentId = input.paymentId ? Number(input.paymentId) : null;
  const slotDays = input.slotDays ? Number(input.slotDays) : null;
  const slotExpiresAt = input.slotExpiresAt || null;

  const r = await pool.query(
    `insert into official_posts (offer_id, channel_chat_id, status, placement_type, payment_id, slot_days, slot_expires_at, updated_at)
     values ($1,$2,'PENDING',$3,$4,$5,$6, now())
     on conflict (offer_id)
     do update set channel_chat_id=excluded.channel_chat_id,
                   status='PENDING',
                   placement_type=excluded.placement_type,
                   payment_id=coalesce(excluded.payment_id, official_posts.payment_id),
                   slot_days=coalesce(excluded.slot_days, official_posts.slot_days),
                   slot_expires_at=coalesce(excluded.slot_expires_at, official_posts.slot_expires_at),
                   updated_at=now()
     returning *`,
    [offerId, channelChatId, placementType, paymentId, slotDays, slotExpiresAt]
  );
  return r.rows[0] || null;
}

export async function setOfficialPostActive(offerId, input = {}) {
  const channelChatId = Number(input.channelChatId);
  const messageId = input.messageId ? Number(input.messageId) : null;
  const placementType = String(input.placementType || 'MANUAL');
  const paymentId = input.paymentId ? Number(input.paymentId) : null;
  const slotDays = input.slotDays ? Number(input.slotDays) : null;
  const slotExpiresAt = input.slotExpiresAt || null;
  const publishedByUserId = input.publishedByUserId ? Number(input.publishedByUserId) : null;

  const r = await pool.query(
    `insert into official_posts (offer_id, channel_chat_id, message_id, status, placement_type, payment_id, slot_days, slot_expires_at, published_by_user_id, updated_at)
     values ($1,$2,$3,'ACTIVE',$4,$5,$6,$7,$8, now())
     on conflict (offer_id)
     do update set channel_chat_id=excluded.channel_chat_id,
                   message_id=excluded.message_id,
                   status='ACTIVE',
                   placement_type=excluded.placement_type,
                   payment_id=coalesce(excluded.payment_id, official_posts.payment_id),
                   slot_days=coalesce(excluded.slot_days, official_posts.slot_days),
                   slot_expires_at=coalesce(excluded.slot_expires_at, official_posts.slot_expires_at),
                   published_by_user_id=coalesce(excluded.published_by_user_id, official_posts.published_by_user_id),
                   last_error=null,
                   updated_at=now()
     returning *`,
    [Number(offerId), channelChatId, messageId, placementType, paymentId, slotDays, slotExpiresAt, publishedByUserId]
  );
  return r.rows[0] || null;
}

export async function setOfficialPostStatus(offerId, status, input = {}) {
  const st = String(status || '').toUpperCase();
  const lastError = input.lastError ? String(input.lastError).slice(0, 2000) : null;
  const r = await pool.query(
    `update official_posts
        set status=$2,
            last_error=coalesce($3, last_error),
            updated_at=now()
      where offer_id=$1
      returning *`,
    [Number(offerId), st, lastError]
  );
  return r.rows[0] || null;
}

export async function listOfficialPending(limit = 20, offset = 0) {
  const r = await pool.query(
    `select op.*, o.title as offer_title, w.title as ws_title, w.channel_username
       from official_posts op
       join barter_offers o on o.id=op.offer_id
       join workspaces w on w.id=o.workspace_id
      where op.status='PENDING'
      order by op.updated_at desc
      limit $1 offset $2`,
    [Number(limit), Number(offset)]
  );
  return r.rows;
}

export async function countOfficialPending() {
  const r = await pool.query(`select count(*)::int as c from official_posts where status='PENDING'`);
  return (r.rows[0] && Number(r.rows[0].c)) || 0;
}

export async function listOfficialToExpire(limit = 50) {
  const r = await pool.query(
    `select *
       from official_posts
      where status='ACTIVE'
        and slot_expires_at is not null
        and slot_expires_at <= now()
      order by slot_expires_at asc
      limit $1`,
    [Number(limit)]
  );
  return r.rows;
}



// --------------------------------------------
// Backfilled exports (compat): v1.3.2+ runtime safety
// --------------------------------------------


function isMissingRelationError(e, relation) {
  return Boolean(e) && String(e.code || '') === '42P01' && String(e.message || '').includes(String(relation || ''));
}

export async function recordStarsPayment(input = {}) {
  const userId = Number(input.userId);
  const kind = String(input.kind || '');
  const invoicePayload = String(input.invoicePayload || '');
  const currency = String(input.currency || '');
  const totalAmount = Number(input.totalAmount || 0);
  const telegramPaymentChargeId = String(input.telegramPaymentChargeId || '');
  const providerPaymentChargeId = input.providerPaymentChargeId ? String(input.providerPaymentChargeId) : null;
  const raw = input.raw || null;

  if (!userId || !telegramPaymentChargeId) {
    return { inserted: true, ledger: 'skipped_missing_fields' };
  }

  try {
    const r = await pool.query(
      `insert into stars_payments
         (user_id, kind, invoice_payload, currency, total_amount, telegram_payment_charge_id, provider_payment_charge_id, raw)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (telegram_payment_charge_id) do nothing
       returning id`,
      [userId, kind, invoicePayload, currency, totalAmount, telegramPaymentChargeId, providerPaymentChargeId, raw]
    );
    if (r.rowCount > 0) return { inserted: true, id: r.rows[0].id };
    return { inserted: false, reason: 'duplicate_charge_id' };
  } catch (e) {
    // Duplicate invoice payload (unique index)
    if (String(e.code || '') === '23505') {
      return { inserted: false, reason: 'duplicate' };
    }
    if (isMissingRelationError(e, 'stars_payments')) {
      return { inserted: true, ledger: 'missing_table' };
    }
    throw e;
  }
}



export async function insertPayment(input = {}) {
  const userId = Number(input.userId);
  const kind = String(input.kind || 'unknown');
  const invoicePayload = String(input.invoicePayload || '');
  const currency = String(input.currency || '');
  const totalAmount = Number(input.totalAmount || 0);
  const telegramPaymentChargeId = String(input.telegramPaymentChargeId || '');
  const providerPaymentChargeId = input.providerPaymentChargeId ? String(input.providerPaymentChargeId) : null;
  const raw = input.raw || null;
  const status = String(input.status || 'RECEIVED');

  if (!userId || !telegramPaymentChargeId || !invoicePayload) {
    return { inserted: true, ledger: 'skipped_missing_fields' };
  }

  try {
    const r = await pool.query(
      `insert into payments
         (user_id, kind, invoice_payload, currency, total_amount, telegram_payment_charge_id, provider_payment_charge_id, status, raw)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (telegram_payment_charge_id) do nothing
       returning id`,
      [userId, kind, invoicePayload, currency, totalAmount, telegramPaymentChargeId, providerPaymentChargeId, status, raw]
    );
    if (r.rowCount > 0) return { inserted: true, id: r.rows[0].id };
    return { inserted: false, reason: 'duplicate_charge_id' };
  } catch (e) {
    if (String(e.code || '') === '23505') {
      return { inserted: false, reason: 'duplicate' };
    }
    if (isMissingRelationError(e, 'payments')) {
      return { inserted: true, ledger: 'missing_table' };
    }
    throw e;
  }
}


export async function getPaymentById(paymentId) {
  const r = await pool.query(`select * from payments where id=$1`, [Number(paymentId)]);
  return r.rows[0] || null;
}

export async function setPaymentStatus(paymentId, status, note = null) {
  const st = String(status || 'ORPHANED').toUpperCase();
  const r = await pool.query(
    `update payments
        set status=$2,
            note=$3,
            updated_at=now()
      where id=$1
      returning *`,
    [Number(paymentId), st, note]
  );
  return r.rows[0] || null;
}

export async function markPaymentApplied(paymentId, appliedByUserId, note = null) {
  const r = await pool.query(
    `update payments
        set status='APPLIED',
            applied_by_user_id=$2,
            applied_at=now(),
            note=coalesce($3, note),
            updated_at=now()
      where id=$1
      returning *`,
    [Number(paymentId), Number(appliedByUserId), note]
  );
  return r.rows[0] || null;
}

// --------------------------------------------
// Brand Team (unlock by Brand Pass / Brand Plan)
// --------------------------------------------

export async function hasBrandTeamUnlockPurchase(userId) {
  const uid = Number(userId);
  if (!uid) return false;

  // Prefer canonical payments ledger; fallback to stars_payments if needed
  try {
    const r = await pool.query(
      `select 1
         from payments
        where user_id = $1
          and kind in ('brand_pass', 'brand_plan')
          and coalesce(status, 'RECEIVED') <> 'ERROR'
        limit 1`,
      [uid]
    );
    if (r.rowCount > 0) return true;
  } catch (e) {
    if (!isMissingRelationError(e, 'payments')) throw e;
  }

  try {
    const r2 = await pool.query(
      `select 1
         from stars_payments
        where user_id = $1
          and kind in ('brand_pass', 'brand_plan')
        limit 1`,
      [uid]
    );
    if (r2.rowCount > 0) return true;
  } catch (e) {
    if (!isMissingRelationError(e, 'stars_payments')) throw e;
  }

  return false;
}

// --------------------------------------------
// Brand Directory (for Creators)
// Show only brands with:
//  - basic profile filled (brand_name, niche, contact, brand_link)
//  - at least one purchase: brand_pass OR brand_plan
// --------------------------------------------

export async function listBrandsDirectory(limit = 10, offset = 0) {
  const lim = Math.max(1, Math.min(100, Number(limit) || 10));
  const off = Math.max(0, Number(offset) || 0);

  const baseWhere = `
    where coalesce(nullif(trim(bp.brand_name), ''), null) is not null
      and coalesce(nullif(trim(bp.niche), ''), null) is not null
      and coalesce(nullif(trim(bp.contact), ''), null) is not null
      and coalesce(nullif(trim(bp.brand_link), ''), null) is not null
  `;

  // Prefer payments ledger. Some deployments may not have stars_payments (legacy), so we try both forms safely.
  const qBoth = `
    select bp.*, u.tg_username
      from brand_profiles bp
      join users u on u.id = bp.user_id
      ${baseWhere}
       and (
         exists (
           select 1 from payments p
            where p.user_id = bp.user_id
              and p.kind in ('brand_pass', 'brand_plan')
              and coalesce(p.status, 'RECEIVED') <> 'ERROR'
            limit 1
         )
         or exists (
           select 1 from stars_payments sp
            where sp.user_id = bp.user_id
              and sp.kind in ('brand_pass', 'brand_plan')
            limit 1
         )
       )
     order by bp.updated_at desc nulls last, bp.created_at desc
     limit $1 offset $2
  `;

  const qPaymentsOnly = `
    select bp.*, u.tg_username
      from brand_profiles bp
      join users u on u.id = bp.user_id
      ${baseWhere}
       and exists (
         select 1 from payments p
          where p.user_id = bp.user_id
            and p.kind in ('brand_pass', 'brand_plan')
            and coalesce(p.status, 'RECEIVED') <> 'ERROR'
          limit 1
       )
     order by bp.updated_at desc nulls last, bp.created_at desc
     limit $1 offset $2
  `;

  const qStarsOnly = `
    select bp.*, u.tg_username
      from brand_profiles bp
      join users u on u.id = bp.user_id
      ${baseWhere}
       and exists (
         select 1 from stars_payments sp
          where sp.user_id = bp.user_id
            and sp.kind in ('brand_pass', 'brand_plan')
          limit 1
       )
     order by bp.updated_at desc nulls last, bp.created_at desc
     limit $1 offset $2
  `;

  try {
    const r = await pool.query(qBoth, [lim, off]);
    return r.rows || [];
  } catch (e) {
    // If one of relations doesn't exist, retry a safe variant.
    const missPayments = isMissingRelationError(e, 'payments');
    const missStars = isMissingRelationError(e, 'stars_payments');
    if (!missPayments && !missStars) throw e;

    if (missStars && !missPayments) {
      const r = await pool.query(qPaymentsOnly, [lim, off]);
      return r.rows || [];
    }
    if (missPayments && !missStars) {
      const r = await pool.query(qStarsOnly, [lim, off]);
      return r.rows || [];
    }
    // both missing -> return empty, directory disabled
    return [];
  }
}

// Brand Directory (for Creators) with filters:
//  - category: matches brand_profiles.niche (best-effort via substrings)
//  - offerType / compensationType: matches brand_profiles.collab_types (CSV tags, normalized)
export async function listBrandsDirectoryFiltered(limit = 10, offset = 0, filter = {}) {
  const lim = Math.max(1, Math.min(100, Number(limit) || 10));
  const off = Math.max(0, Number(offset) || 0);

  const f = filter || {};
  const cat = f.category ? String(f.category) : null;
  const offerType = f.offerType ? String(f.offerType) : null;
  const compType = f.compensationType ? String(f.compensationType) : null;

  const baseWhere = `
    where coalesce(nullif(trim(bp.brand_name), ''), null) is not null
      and coalesce(nullif(trim(bp.niche), ''), null) is not null
      and coalesce(nullif(trim(bp.contact), ''), null) is not null
      and coalesce(nullif(trim(bp.brand_link), ''), null) is not null
  `;

  const params = [lim, off];
  let idx = 3;
  let extraWhere = '';

  const nichePatterns = (c) => {
    const v = String(c || '').toLowerCase();
    if (!v) return null;
    if (v === 'cosmetics') return ['%косм%', '%cosm%', '%beauty%', '%makeup%', '%skin%'];
    if (v === 'fashion') return ['%одеж%', '%fashion%', '%cloth%', '%apparel%', '%style%'];
    if (v === 'unboxing') return ['%распак%', '%unbox%'];
    if (v === 'other') return ['%друг%', '%other%'];
    return null;
  };

  const ctPatternsByOffer = (t) => {
    const v = String(t || '').toLowerCase();
    if (!v) return null;
    if (v === 'ad') return ['%,integration,%', '%,stories,%', '%,reels,%', '%,post,%', '%,ambassador,%'];
    if (v === 'review') return ['%,review,%', '%,unboxing,%'];
    if (v === 'ugc') return ['%,ugc,%'];
    if (v === 'giveaway') return ['%,giveaway,%'];
    if (v === 'other') return ['%,other,%'];
    return null;
  };

  const ctPatternsByComp = (t) => {
    const v = String(t || '').toLowerCase();
    if (!v) return null;
    if (v === 'barter') return ['%,barter,%'];
    if (v === 'cert') return ['%,cert,%'];
    if (v === 'paid') return ['%,paid,%'];
    if (v === 'rub') return ['%,paid,%'];
    if (v === 'mixed') return ['%,mixed,%'];
    return null;
  };

  const catP = nichePatterns(cat);
  if (catP && catP.length) {
    extraWhere += ` and (lower(bp.niche) like any($${idx}))`;
    params.push(catP);
    idx++;
  }

  const ctOfferP = ctPatternsByOffer(offerType);
  if (ctOfferP && ctOfferP.length) {
    // normalize CSV: remove whitespace
    extraWhere += ` and ((',' || regexp_replace(lower(coalesce(bp.collab_types,'')), '\\s+', '', 'g') || ',') like any($${idx}))`;
    params.push(ctOfferP);
    idx++;
  }

  const ctCompP = ctPatternsByComp(compType);
  if (ctCompP && ctCompP.length) {
    extraWhere += ` and ((',' || regexp_replace(lower(coalesce(bp.collab_types,'')), '\\s+', '', 'g') || ',') like any($${idx}))`;
    params.push(ctCompP);
    idx++;
  }

  // Advanced structured meta (brand_profiles.meta)
  const bb = String(f.budgetBucket || '').trim();
  if (bb) {
    extraWhere += ` and (coalesce(bp.meta->>'budget_bucket','') = $${idx})`;
    params.push(bb);
    idx++;
  }

  const goalsTags = Array.isArray(f.goalsTags) ? f.goalsTags.map((x) => String(x || '').trim()).filter(Boolean) : [];
  if (goalsTags.length) {
    extraWhere += ` and (coalesce(bp.meta->'goals_tags','[]'::jsonb) ?& $${idx}::text[])`;
    params.push(goalsTags);
    idx++;
  }

  const reqTags = Array.isArray(f.reqTags) ? f.reqTags.map((x) => String(x || '').trim()).filter(Boolean) : [];
  if (reqTags.length) {
    extraWhere += ` and (coalesce(bp.meta->'req_tags','[]'::jsonb) ?& $${idx}::text[])`;
    params.push(reqTags);
    idx++;
  }

  const q = `
    select bp.*, u.tg_username
      from brand_profiles bp
      join users u on u.id = bp.user_id
      ${baseWhere}
      ${extraWhere}
     order by bp.updated_at desc nulls last, bp.created_at desc
     limit $1 offset $2
  `;

  const r = await pool.query(q, params);
  return r.rows || [];
}


// Count Brand Directory matches (same logic as listBrandsDirectoryFiltered, but COUNT only)
export async function countBrandsDirectoryFiltered(filter = {}) {
  const f = filter || {};
  const cat = f.category ? String(f.category) : null;
  const offerType = f.offerType ? String(f.offerType) : null;
  const compType = f.compensationType ? String(f.compensationType) : null;

  const baseWhere = `
    where coalesce(nullif(trim(bp.brand_name), ''), null) is not null
      and coalesce(nullif(trim(bp.niche), ''), null) is not null
      and coalesce(nullif(trim(bp.contact), ''), null) is not null
      and coalesce(nullif(trim(bp.brand_link), ''), null) is not null
  `;

  const params = [];
  let idx = 1;
  let extraWhere = '';

  const nichePatterns = (c) => {
    const v = String(c || '').toLowerCase();
    if (!v) return null;
    if (v === 'cosmetics') return ['%косм%', '%cosm%', '%beauty%', '%makeup%', '%skin%'];
    if (v === 'fashion') return ['%одеж%', '%fashion%', '%cloth%', '%apparel%', '%style%'];
    if (v === 'unboxing') return ['%распак%', '%unbox%'];
    if (v === 'other') return ['%друг%', '%other%'];
    return null;
  };

  const ctPatternsByOffer = (t) => {
    const v = String(t || '').toLowerCase();
    if (!v) return null;
    if (v === 'ad') return ['%,integration,%', '%,stories,%', '%,reels,%', '%,post,%', '%,ambassador,%'];
    if (v === 'review') return ['%,review,%', '%,unboxing,%'];
    if (v === 'ugc') return ['%,ugc,%'];
    if (v === 'giveaway') return ['%,giveaway,%'];
    if (v === 'other') return ['%,other,%'];
    return null;
  };

  const ctPatternsByComp = (t) => {
    const v = String(t || '').toLowerCase();
    if (!v) return null;
    if (v === 'barter') return ['%,barter,%'];
    if (v === 'cert') return ['%,cert,%'];
    if (v === 'paid') return ['%,paid,%'];
    if (v === 'rub') return ['%,paid,%'];
    if (v === 'mixed') return ['%,mixed,%'];
    return null;
  };

  const catP = nichePatterns(cat);
  if (catP && catP.length) {
    extraWhere += ` and (lower(bp.niche) like any($${idx}))`;
    params.push(catP);
    idx++;
  }

  const ctOfferP = ctPatternsByOffer(offerType);
  if (ctOfferP && ctOfferP.length) {
    extraWhere += ` and ((',' || regexp_replace(lower(coalesce(bp.collab_types,'')), '\\s+', '', 'g') || ',') like any($${idx}))`;
    params.push(ctOfferP);
    idx++;
  }

  const ctCompP = ctPatternsByComp(compType);
  if (ctCompP && ctCompP.length) {
    extraWhere += ` and ((',' || regexp_replace(lower(coalesce(bp.collab_types,'')), '\\s+', '', 'g') || ',') like any($${idx}))`;
    params.push(ctCompP);
    idx++;
  }

  // Advanced structured meta (brand_profiles.meta)
  const bb = String(f.budgetBucket || '').trim();
  if (bb) {
    extraWhere += ` and (coalesce(bp.meta->>'budget_bucket','') = $${idx})`;
    params.push(bb);
    idx++;
  }

  const goalsTags = Array.isArray(f.goalsTags) ? f.goalsTags.map((x) => String(x || '').trim()).filter(Boolean) : [];
  if (goalsTags.length) {
    extraWhere += ` and (coalesce(bp.meta->'goals_tags','[]'::jsonb) ?& $${idx}::text[])`;
    params.push(goalsTags);
    idx++;
  }

  const reqTags = Array.isArray(f.reqTags) ? f.reqTags.map((x) => String(x || '').trim()).filter(Boolean) : [];
  if (reqTags.length) {
    extraWhere += ` and (coalesce(bp.meta->'req_tags','[]'::jsonb) ?& $${idx}::text[])`;
    params.push(reqTags);
    idx++;
  }

  const q = `
    select count(*)::int as c
      from brand_profiles bp
      join users u on u.id = bp.user_id
      ${baseWhere}
      ${extraWhere}
  `;

  const r = await pool.query(q, params);
  return Number(r.rows?.[0]?.c || 0);
}


// -----------------------------
// Workspace channel folders + editors (v1.1.2)
// -----------------------------

export async function listPaymentsByStatus(status, limit = 10, offset = 0) {
  const st = String(status || 'ORPHANED').toUpperCase();
  const r = await pool.query(
    `select p.*, u.tg_id, u.tg_username
     from payments p
     left join users u on u.id = p.user_id
     where p.status=$1
     order by p.created_at desc
     limit $2 offset $3`,
    [st, Number(limit), Number(offset)]
  );
  return r.rows;
}

export async function getUserVerification(userId) {
  const r = await pool.query(
    `select uv.*, u.tg_id, u.tg_username
     from user_verifications uv
     join users u on u.id = uv.user_id
     where uv.user_id=$1`,
    [userId]
  );
  return r.rows[0] || null;
}


// Brand profiles (Brand Mode)
export async function getBrandProfile(userId) {
  const r = await pool.query(`select * from brand_profiles where user_id=$1`, [Number(userId)]);
  return r.rows[0] || null;
}

export async function upsertBrandProfile(userId, patch = {}) {
  userId = Number(userId);
  if (!userId) throw new Error('userId required');

  // Ensure a row exists so we can do simple partial updates
  await pool.query(
    `insert into brand_profiles (user_id) values ($1)
     on conflict (user_id) do nothing`,
    [userId]
  );

  const allowed = [
    'brand_name',
    'brand_link',
    'contact',
    'niche',
    'geo',
    'collab_types',
    'budget',
    'goals',
    'requirements',
    'meta'
  ];

  const keys = allowed.filter((k) => Object.prototype.hasOwnProperty.call(patch, k));
  if (keys.length) {
    const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = keys.map((k) => (patch[k] === undefined ? null : patch[k]));

    await pool.query(
      `update brand_profiles
       set ${set}, updated_at = now()
       where user_id = $1`,
      [userId, ...values]
    );
  }

  return getBrandProfile(userId);
}

// ───────────────────────────────────────────────────────────────────────────────
// Brand Managers (team access)
// ───────────────────────────────────────────────────────────────────────────────

export async function addBrandManager(brandUserId, managerUserId, addedByUserId = null) {
  brandUserId = Number(brandUserId);
  managerUserId = Number(managerUserId);
  addedByUserId = addedByUserId == null ? null : Number(addedByUserId);

  if (!brandUserId || !managerUserId) throw new Error('addBrandManager: bad ids');

  await pool.query(
    `insert into brand_managers (brand_user_id, manager_user_id, added_by_user_id)
     values ($1, $2, $3)
     on conflict (brand_user_id, manager_user_id) do nothing`,
    [brandUserId, managerUserId, addedByUserId]
  );

  return true;
}

export async function removeBrandManager(brandUserId, managerUserId) {
  brandUserId = Number(brandUserId);
  managerUserId = Number(managerUserId);

  if (!brandUserId || !managerUserId) throw new Error('removeBrandManager: bad ids');

  await pool.query(
    `delete from brand_managers
     where brand_user_id = $1 and manager_user_id = $2`,
    [brandUserId, managerUserId]
  );

  return true;
}

export async function isBrandManager(brandUserId, managerUserId) {
  brandUserId = Number(brandUserId);
  managerUserId = Number(managerUserId);
  if (!brandUserId || !managerUserId) return false;

  const r = await pool.query(
    `select 1 as ok
     from brand_managers
     where brand_user_id = $1 and manager_user_id = $2
     limit 1`,
    [brandUserId, managerUserId]
  );

  return (r.rows || []).length > 0;
}

export async function listBrandManagers(brandUserId) {
  brandUserId = Number(brandUserId);
  if (!brandUserId) throw new Error('listBrandManagers: bad brandUserId');

  const r = await pool.query(
    `select
        bm.manager_user_id as user_id,
        u.tg_id,
        u.tg_username,
        bm.created_at
     from brand_managers bm
     join users u on u.id = bm.manager_user_id
     where bm.brand_user_id = $1
     order by bm.created_at desc`,
    [brandUserId]
  );

  return r.rows || [];
}

export async function listBrandsForManager(managerUserId) {
  managerUserId = Number(managerUserId);
  if (!managerUserId) throw new Error('listBrandsForManager: bad managerUserId');

  const r = await pool.query(
    `select
        bm.brand_user_id as user_id,
        u.tg_id,
        u.tg_username,
        bp.brand_name,
        bm.created_at
     from brand_managers bm
     left join users u on u.id = bm.brand_user_id
     left join brand_profiles bp on bp.user_id = bm.brand_user_id
     where bm.manager_user_id = $1
     order by bm.created_at desc`,
    [managerUserId]
  );

  return r.rows || [];
}

export async function deleteBrandProfile(userId) {
  userId = Number(userId);
  if (!userId) throw new Error('userId required');
  await pool.query(`delete from brand_profiles where user_id = $1`, [userId]);
  return true;
}


export async function upsertVerificationRequest(userId, input = {}) {
  const kind = (input.kind || 'creator').toString();
  const submittedText = (input.submittedText || '').toString();
  const r = await pool.query(
    `insert into user_verifications (user_id, kind, status, submitted_text, submitted_at, updated_at)
     values ($1, $2, 'PENDING', $3, now(), now())
     on conflict (user_id)
     do update set kind=excluded.kind,
                   status='PENDING',
                   submitted_text=excluded.submitted_text,
                   submitted_at=now(),
                   reviewed_at=null,
                   reviewed_by_user_id=null,
                   rejection_reason=null,
                   updated_at=now()
     returning *`,
    [userId, kind, submittedText]
  );
  return r.rows[0] || null;
}

export async function setVerificationStatus(userId, status, reviewedByUserId, rejectionReason = null) {
  const st = String(status || '').toUpperCase();
  const rr = rejectionReason ? String(rejectionReason).slice(0, 2000) : null;
  const r = await pool.query(
    `update user_verifications
        set status=$2,
            reviewed_at=now(),
            reviewed_by_user_id=$3,
            rejection_reason=$4,
            updated_at=now()
      where user_id=$1
      returning *`,
    [userId, st, reviewedByUserId || null, rr]
  );
  return r.rows[0] || null;
}

// Verified joins for barter UI

export async function listPendingVerifications(limit = 20, offset = 0) {
  const r = await pool.query(
    `select uv.user_id, uv.kind, uv.status, uv.submitted_text, uv.submitted_at,
            u.tg_id, u.tg_username
     from user_verifications uv
     join users u on u.id=uv.user_id
     where uv.status='PENDING'
     order by uv.submitted_at desc
     limit $1 offset $2`,
    [Number(limit || 20), Number(offset || 0)]
  );
  return r.rows;
}

export async function countPendingVerifications() {
  const r = await pool.query(`select count(*)::int as cnt from user_verifications where status='PENDING'`);
  return Number(r.rows[0]?.cnt || 0);
}

export async function getWorkspaceById(workspaceId) {
  const r = await pool.query(`select * from workspaces where id=$1`, [Number(workspaceId)]);
  return r.rows[0] || null;
}

export async function hasAnyWorkspaceEditorRole(userId) {
  const r = await pool.query(`select 1 from workspace_editors where user_id=$1 limit 1`, [Number(userId)]);
  return r.rows.length > 0;
}

export async function isWorkspaceEditor(workspaceId, userId) {
  const r = await pool.query(
    `select 1 from workspace_editors where workspace_id=$1 and user_id=$2 limit 1`,
    [Number(workspaceId), Number(userId)]
  );
  return r.rows.length > 0;
}

export async function addWorkspaceEditor(workspaceId, userId, addedByUserId) {
  const r = await pool.query(
    `insert into workspace_editors (workspace_id, user_id, added_by_user_id)
     values ($1,$2,$3)
     on conflict (workspace_id, user_id) do update set added_by_user_id=excluded.added_by_user_id
     returning *`,
    [Number(workspaceId), Number(userId), Number(addedByUserId)]
  );
  return r.rows[0] || null;
}

export async function removeWorkspaceEditor(workspaceId, userId) {
  const r = await pool.query(
    `delete from workspace_editors where workspace_id=$1 and user_id=$2 returning *`,
    [Number(workspaceId), Number(userId)]
  );
  return r.rows[0] || null;
}

export async function listWorkspaceEditors(workspaceId) {
  const r = await pool.query(
    `select e.user_id, u.tg_id, u.tg_username, u.created_at as user_created_at, e.created_at as added_at
       from workspace_editors e
       join users u on u.id = e.user_id
      where e.workspace_id=$1
      order by e.created_at desc`,
    [Number(workspaceId)]
  );
  return r.rows;
}

export async function listWorkspaceEditorWorkspaces(userId) {
  const r = await pool.query(
    `select w.id, w.title, w.channel_username, w.channel_id
       from workspace_editors e
       join workspaces w on w.id = e.workspace_id
      where e.user_id=$1
      order by lower(w.title) asc`,
    [Number(userId)]
  );
  return r.rows;
}

export async function createChannelFolder(workspaceId, createdByUserId, title) {
  const r = await pool.query(
    `insert into channel_folders (workspace_id, created_by_user_id, title)
     values ($1,$2,$3)
     returning *`,
    [Number(workspaceId), Number(createdByUserId), String(title)]
  );
  return r.rows[0] || null;
}

export async function renameChannelFolder(folderId, title) {
  const r = await pool.query(
    `update channel_folders set title=$2 where id=$1 returning *`,
    [Number(folderId), String(title)]
  );
  return r.rows[0] || null;
}

export async function deleteChannelFolder(folderId) {
  const r = await pool.query(`delete from channel_folders where id=$1 returning *`, [Number(folderId)]);
  return r.rows[0] || null;
}

export async function getChannelFolder(folderId) {
  const r = await pool.query(
    `select f.*, (
        select count(*)::int from channel_folder_items i where i.folder_id=f.id
      ) as items_count
     from channel_folders f
     where f.id=$1`,
    [Number(folderId)]
  );
  return r.rows[0] || null;
}

export async function listChannelFolders(workspaceId) {
  const r = await pool.query(
    `select f.*, (
        select count(*)::int from channel_folder_items i where i.folder_id=f.id
      ) as items_count
     from channel_folders f
     where f.workspace_id=$1
     order by lower(f.title) asc`,
    [Number(workspaceId)]
  );
  return r.rows;
}

export async function listChannelFolderItems(folderId) {
  const r = await pool.query(
    `select id, channel_username, created_at
       from channel_folder_items
      where folder_id=$1
      order by lower(channel_username) asc`,
    [Number(folderId)]
  );
  return r.rows;
}

export async function addChannelFolderItems(folderId, usernames = []) {
  const norm = (x) => {
    const t = String(x || '').trim();
    if (!t) return null;

    let u = t;
    const m1 = u.match(/^https?:\/\/t\.me\/([a-zA-Z0-9_]{5,})/i);
    if (m1) u = '@' + m1[1];

    const m2 = u.match(/^@?([a-zA-Z0-9_]{5,})$/);
    if (m2) u = '@' + m2[1];

    return String(u).toLowerCase();
  };

  const cleaned = (usernames || [])
    .map(norm)
    .filter(Boolean);

  // unique preserve order
  const unique = [];
  const seen = new Set();
  for (const u of cleaned) {
    if (seen.has(u)) continue;
    seen.add(u);
    unique.push(u);
  }

  if (!unique.length) return { added: 0 };

  const values = unique.map((_, i) => `($1, $${i + 2})`).join(',');
  const params = [Number(folderId), ...unique];

  const r = await pool.query(
    `insert into channel_folder_items (folder_id, channel_username)
     values ${values}
     on conflict do nothing`,
    params
  );
  return { added: r.rowCount };
}

export async function removeChannelFolderItems(folderId, usernames = []) {
  const norm = (x) => {
    const t = String(x || '').trim();
    if (!t) return null;

    let u = t;
    const m1 = u.match(/^https?:\/\/t\.me\/([a-zA-Z0-9_]{5,})/i);
    if (m1) u = '@' + m1[1];

    const m2 = u.match(/^@?([a-zA-Z0-9_]{5,})$/);
    if (m2) u = '@' + m2[1];

    return String(u).toLowerCase();
  };

  const cleaned = (usernames || [])
    .map(norm)
    .filter(Boolean);
  if (!cleaned.length) return { removed: 0 };

  // unique
  const unique = [];
  const seen = new Set();
  for (const u of cleaned) {
    if (seen.has(u)) continue;
    seen.add(u);
    unique.push(u);
  }

  const placeholders = unique.map((_, i) => `$${i + 2}`).join(',');
  const params = [Number(folderId), ...unique];

  const r = await pool.query(
    `delete from channel_folder_items
      where folder_id=$1
        and lower(channel_username) in (${placeholders})`,
    params
  );
  return { removed: r.rowCount };
}

export async function clearChannelFolder(folderId) {
  const r = await pool.query(`delete from channel_folder_items where folder_id=$1`, [Number(folderId)]);
  return { removed: r.rowCount };
}

export async function getBarterOfferPublicWithVerified(offerId) {
  const r = await pool.query(
    `select o.*, w.title as ws_title, w.channel_username, w.channel_id,
            s.network_enabled,
            s.profile_title as ws_profile_title,
            s.profile_niche as ws_profile_niche,
            s.profile_contact as ws_profile_contact,
            s.profile_geo as ws_profile_geo,
            s.profile_mode as ws_profile_mode,
            s.profile_ig as ws_profile_ig,
            s.profile_verticals as ws_profile_verticals,
            s.profile_formats as ws_profile_formats,
            s.profile_portfolio_urls as ws_profile_portfolio_urls,
            s.profile_about as ws_profile_about,
            (case when uv.status='APPROVED' then true else false end) as creator_verified
     from barter_offers o
     join workspaces w on w.id=o.workspace_id
     join workspace_settings s on s.workspace_id=w.id
     left join user_verifications uv on uv.user_id=o.creator_user_id and uv.status='APPROVED'
     where o.id=$1`,
    [offerId]
  );
  return r.rows[0] || null;
}

export async function listNetworkBarterOffersWithVerified(opts = {}) {
  const { category = null, offerType = null, compensationType = null, goalsTags = null, reqTags = null, limit = 5, offset = 0 } = opts;
  try {
    const r = await pool.query(
      `select o.*, w.title as ws_title, w.channel_username, w.channel_id,
              (case when uv.status='APPROVED' then true else false end) as creator_verified
       from barter_offers o
       join workspaces w on w.id = o.workspace_id
       join workspace_settings s on s.workspace_id = w.id
       left join user_verifications uv on uv.user_id = o.creator_user_id
       where o.status='ACTIVE'
         and s.network_enabled=true
         and ($1::text is null or o.category=$1)
         and ($2::text is null or o.offer_type=$2)
         and ($3::text is null or o.compensation_type=$3)
         and ($4::text[] is null or coalesce(o.meta->'goals_tags','[]'::jsonb) ?| $4::text[])
         and ($5::text[] is null or coalesce(o.meta->'req_tags','[]'::jsonb) ?| $5::text[])
       order by case when s.plan='pro' and (s.pro_until is null or s.pro_until>now()) and s.pro_pinned_offer_id = o.id then 0 else 1 end,
                o.bump_at desc
       limit $6 offset $7`,
      [category, offerType, compensationType, goalsTags && goalsTags.length ? goalsTags : null, reqTags && reqTags.length ? reqTags : null, limit, offset]
    );
    return r.rows;
  } catch (err) {
    if (!isMissingBarterOffersMetaColumnError(err)) throw err;
    const r = await pool.query(
      `select o.*, w.title as ws_title, w.channel_username, w.channel_id,
              (case when uv.status='APPROVED' then true else false end) as creator_verified
       from barter_offers o
       join workspaces w on w.id = o.workspace_id
       join workspace_settings s on s.workspace_id = w.id
       left join user_verifications uv on uv.user_id = o.creator_user_id
       where o.status='ACTIVE'
         and s.network_enabled=true
         and ($1::text is null or o.category=$1)
         and ($2::text is null or o.offer_type=$2)
         and ($3::text is null or o.compensation_type=$3)
       order by case when s.plan='pro' and (s.pro_until is null or s.pro_until>now()) and s.pro_pinned_offer_id = o.id then 0 else 1 end,
                o.bump_at desc
       limit $4 offset $5`,
      [category, offerType, compensationType, limit, offset]
    );
    const rows = r.rows || [];
    for (const row of rows) row.__meta_missing = true;
    return rows;
  }
}

export async function listBarterThreadsForUserWithVerified(userId, limit = 20, offset = 0) {
  const r = await pool.query(
    `select t.*, o.title as offer_title, o.category, o.offer_type, o.compensation_type,
            w.channel_username, w.title as ws_title,
            case when t.buyer_user_id=$1 then t.seller_user_id else t.buyer_user_id end as other_user_id,
            uo.tg_username as other_username,
            (case when uvo.status='APPROVED' then true else false end) as other_verified,
            lm.body as last_body, lm.created_at as last_created_at
     from barter_threads t
     join barter_offers o on o.id=t.offer_id
     join workspaces w on w.id=t.workspace_id
     left join users uo on uo.id = (case when t.buyer_user_id=$1 then t.seller_user_id else t.buyer_user_id end)
     left join user_verifications uvo on uvo.user_id = (case when t.buyer_user_id=$1 then t.seller_user_id else t.buyer_user_id end) and uvo.status='APPROVED'
     left join lateral (
       select m.body, m.created_at
       from barter_messages m
       where m.thread_id=t.id
       order by m.created_at desc
       limit 1
     ) lm on true
     where (t.buyer_user_id=$1 or t.seller_user_id=$1)
       and not (coalesce(t.deleted_by_user_ids, '[]'::jsonb) @> to_jsonb($1::bigint))
     order by coalesce(t.last_message_at, t.created_at) desc
     limit $2 offset $3`,
    [userId, limit, offset]
  );
  return r.rows;
}


export async function listBarterThreadsForUser(userId, limit = 20, offset = 0) {
  const r = await pool.query(
    `select t.*, o.title as offer_title, o.category, o.offer_type, o.compensation_type,
            w.channel_username, w.title as ws_title,
            case when t.buyer_user_id=$1 then t.seller_user_id else t.buyer_user_id end as other_user_id,
            uo.tg_username as other_username,
            false as other_verified,
            lm.body as last_body, lm.created_at as last_created_at
     from barter_threads t
     join barter_offers o on o.id=t.offer_id
     join workspaces w on w.id=t.workspace_id
     left join users uo on uo.id = (case when t.buyer_user_id=$1 then t.seller_user_id else t.buyer_user_id end)
     left join lateral (
       select m.body, m.created_at
       from barter_messages m
       where m.thread_id=t.id
       order by m.created_at desc
       limit 1
     ) lm on true
     where (t.buyer_user_id=$1 or t.seller_user_id=$1)
       and not (coalesce(t.deleted_by_user_ids, '[]'::jsonb) @> to_jsonb($1::bigint))
     order by coalesce(t.last_message_at, t.created_at) desc
     limit $2 offset $3`,
    [Number(userId), Number(limit || 20), Number(offset || 0)]
  );
  return r.rows || [];
}

export async function getBarterThreadForUserWithVerified(threadId, userId) {
  const r = await pool.query(
    `select t.*, o.title as offer_title, o.category, o.offer_type, o.compensation_type, o.meta as offer_meta,
            w.channel_username, w.title as ws_title,
            ub.tg_username as buyer_username, us.tg_username as seller_username,
            (case when uvb.status='APPROVED' then true else false end) as buyer_verified,
            (case when uvs.status='APPROVED' then true else false end) as seller_verified
     from barter_threads t
     join barter_offers o on o.id=t.offer_id
     join workspaces w on w.id=t.workspace_id
     left join users ub on ub.id=t.buyer_user_id
     left join users us on us.id=t.seller_user_id
     left join user_verifications uvb on uvb.user_id=t.buyer_user_id and uvb.status='APPROVED'
     left join user_verifications uvs on uvs.user_id=t.seller_user_id and uvs.status='APPROVED'
     where t.id=$1 and (t.buyer_user_id=$2 or t.seller_user_id=$2)`,
    [threadId, userId]
  );
  return r.rows[0] || null;
}




export async function getBarterThreadForUser(threadId, userId) {
  const r = await pool.query(
    `select t.*, o.title as offer_title, o.category, o.offer_type, o.compensation_type, o.meta as offer_meta,
            w.channel_username, w.title as ws_title,
            ub.tg_username as buyer_username, us.tg_username as seller_username
     from barter_threads t
     join barter_offers o on o.id=t.offer_id
     join workspaces w on w.id=t.workspace_id
     left join users ub on ub.id=t.buyer_user_id
     left join users us on us.id=t.seller_user_id
     where t.id=$1 and (t.buyer_user_id=$2 or t.seller_user_id=$2)`,
    [Number(threadId), Number(userId)]
  );
  return r.rows[0] || null;
}


export async function listBarterMessages(threadId, limit = 20) {
  const r = await pool.query(
    `select id, thread_id, sender_user_id, body, created_at
     from barter_messages
     where thread_id=$1
     order by created_at desc
     limit $2`,
    [Number(threadId), Number(limit || 20)]
  );
  return r.rows || [];
}


export async function listBarterOffersForWorkspace(ownerUserId, workspaceId, limit = 10, offset = 0) {
  // Backwards-compat alias: owner-gated list for workspace
  return await listBarterOffersForOwnerWorkspace(ownerUserId, workspaceId, limit, offset);
}


export async function listMyBarterOffers(workspaceId, limit = 100, offset = 0) {
  const r = await pool.query(
    `select *
     from barter_offers
     where workspace_id=$1
     order by created_at desc
     limit $2 offset $3`,
    [Number(workspaceId), Number(limit || 100), Number(offset || 0)]
  );
  return r.rows || [];
}


export async function getUserById(userId) {
  const r = await pool.query(`select * from users where id=$1`, [Number(userId)]);
  return r.rows[0] || null;
}


export async function listUsersByIds(userIds = []) {
  const ids = Array.from(new Set((userIds || []).map((x) => Number(x)).filter(Boolean)));
  if (!ids.length) return [];
  const r = await pool.query(
    `select id, tg_id, tg_username
     from users
     where id = any($1::int[])`,
    [ids]
  );
  return r.rows || [];
}



export async function auditBarterThread(threadId, actorUserId, action, payload = {}) {
  // We don't have a dedicated thread_audit table; log into workspace_audit for traceability.
  const r = await pool.query(`select workspace_id from barter_threads where id=$1`, [Number(threadId)]);
  const wsId = r.rows[0]?.workspace_id;
  if (!wsId) return;
  await pool.query(
    `insert into workspace_audit (workspace_id, actor_user_id, action, payload)
     values ($1,$2,$3,$4::jsonb)`,
    [Number(wsId), actorUserId || null, String(action || 'thread.audit'), JSON.stringify({ threadId: Number(threadId), ...(payload || {}) })]
  );
}



// --- Brand Leads (requests from brands on public profile vitrina) ---

export async function createBrandLead({
  workspaceId,
  ownerUserId,
  brandUserId,
  brandTgId,
  brandUsername = null,
  brandName = null,
  message,
  meta = null
}) {
  const r = await pool.query(
    `insert into brand_leads
      (workspace_id, owner_user_id, brand_user_id, brand_tg_id, brand_username, brand_name, message, meta)
     values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     returning *`,
    [
      Number(workspaceId),
      Number(ownerUserId),
      Number(brandUserId),
      Number(brandTgId),
      brandUsername ? String(brandUsername) : null,
      brandName ? String(brandName) : null,
      String(message || ''),
      meta ? JSON.stringify(meta) : null
    ]
  );
  return r.rows[0] || null;
}

export async function getBrandLeadById(leadId) {
  const r = await pool.query(`select * from brand_leads where id=$1`, [Number(leadId)]);
  return r.rows[0] || null;
}

export async function countBrandLeadsByStatus(workspaceId) {
  const r = await pool.query(
    `select status, count(*)::int as cnt
     from brand_leads
     where workspace_id=$1
     group by status`,
    [Number(workspaceId)]
  );
  const out = { new: 0, in_progress: 0, closed: 0, spam: 0 };
  for (const row of r.rows) {
    const k = String(row.status || '').toLowerCase();
    if (out[k] !== undefined) out[k] = Number(row.cnt || 0);
  }
  return out;
}

export async function listBrandLeads(workspaceId, status, limit = 10, offset = 0) {
  const r = await pool.query(
    `select *
     from brand_leads
     where workspace_id=$1 and status=$2
       and coalesce(deleted_by_user_ids, '[]'::jsonb) = '[]'::jsonb
     order by created_at desc, id desc
     limit $3 offset $4`,
    [Number(workspaceId), String(status), Number(limit), Number(offset)]
  );
  return r.rows || [];
}

// Curator Inbox (aggregate across all workspaces where user has access as curator/owner)
export async function countBrandLeadsForCuratorByStatus(userId) {
  const uId = Number(userId || 0);
  if (!uId) return { new: 0, in_progress: 0, closed: 0, spam: 0 };

  const r = await pool.query(
    `select l.status, count(*)::int as cnt
       from brand_leads l
       join workspaces ws on ws.id = l.workspace_id
       left join workspace_settings ss on ss.workspace_id = ws.id
      where not (coalesce(l.deleted_by_user_ids, '[]'::jsonb) @> to_jsonb($1::bigint))
        and (
        ws.owner_user_id = $1
        or (coalesce(ss.curator_enabled, false) = true and exists(
          select 1 from workspace_curators c where c.workspace_id = ws.id and c.user_id = $1
        ))
      )
      group by l.status`,
    [uId]
  );
  const out = { new: 0, in_progress: 0, closed: 0, spam: 0 };
  for (const row of r.rows || []) {
    const k = String(row.status || '').toLowerCase();
    if (out[k] !== undefined) out[k] = Number(row.cnt || 0);
  }
  return out;
}

export async function listBrandLeadsForCurator(userId, status, limit = 10, offset = 0) {
  const uId = Number(userId || 0);
  if (!uId) return [];

  const r = await pool.query(
    `select
        l.*,
        ws.title as workspace_title,
        ws.channel_username as workspace_username,
        ws.owner_user_id as workspace_owner_user_id
     from brand_leads l
     join workspaces ws on ws.id = l.workspace_id
     left join workspace_settings ss on ss.workspace_id = ws.id
     where l.status = $2
       and not (coalesce(l.deleted_by_user_ids, '[]'::jsonb) @> to_jsonb($1::bigint))
       and (
         ws.owner_user_id = $1
         or (coalesce(ss.curator_enabled, false) = true and exists(
           select 1 from workspace_curators c where c.workspace_id = ws.id and c.user_id = $1
         ))
       )
     order by l.created_at desc, l.id desc
     limit $3 offset $4`,
    [uId, String(status), Number(limit), Number(offset)]
  );
  return r.rows || [];
}

// --- Assignment: distribute leads among curators ---

export async function assignBrandLead(leadId, userId) {
  const r = await pool.query(
    `update brand_leads
       set assigned_user_id = $2, assigned_at = now(), updated_at = now()
     where id = $1
     returning *`,
    [Number(leadId), Number(userId)]
  );
  return r.rows[0] || null;
}

export async function unassignBrandLead(leadId) {
  const r = await pool.query(
    `update brand_leads
       set assigned_user_id = null, assigned_at = null, updated_at = now()
     where id = $1
     returning *`,
    [Number(leadId)]
  );
  return r.rows[0] || null;
}

/**
 * List leads for curator with assignment filter.
 * assignFilter: 'all' | 'my' | 'free'
 */
export async function listBrandLeadsForCuratorFiltered(userId, status, assignFilter = 'all', limit = 10, offset = 0) {
  const uId = Number(userId || 0);
  if (!uId) return [];

  let assignClause = '';
  if (assignFilter === 'my') {
    assignClause = ' and l.assigned_user_id = $1';
  } else if (assignFilter === 'free') {
    assignClause = ' and l.assigned_user_id is null';
  }

  const r = await pool.query(
    `select
        l.*,
        ws.title as workspace_title,
        ws.channel_username as workspace_username,
        ws.owner_user_id as workspace_owner_user_id,
        au.tg_username as assigned_username
     from brand_leads l
     join workspaces ws on ws.id = l.workspace_id
     left join workspace_settings ss on ss.workspace_id = ws.id
     left join users au on au.id = l.assigned_user_id
     where l.status = $2
       and not (coalesce(l.deleted_by_user_ids, '[]'::jsonb) @> to_jsonb($1::bigint))
       and (
         ws.owner_user_id = $1
         or (coalesce(ss.curator_enabled, false) = true and exists(
           select 1 from workspace_curators c where c.workspace_id = ws.id and c.user_id = $1
         ))
       )${assignClause}
     order by l.created_at desc, l.id desc
     limit $3 offset $4`,
    [uId, String(status), Number(limit), Number(offset)]
  );
  return r.rows || [];
}

export async function countBrandLeadsForCuratorFiltered(userId, status, assignFilter = 'all') {
  const uId = Number(userId || 0);
  if (!uId) return 0;

  let assignClause = '';
  if (assignFilter === 'my') {
    assignClause = ' and l.assigned_user_id = $1';
  } else if (assignFilter === 'free') {
    assignClause = ' and l.assigned_user_id is null';
  }

  const r = await pool.query(
    `select count(*)::int as cnt
       from brand_leads l
       join workspaces ws on ws.id = l.workspace_id
       left join workspace_settings ss on ss.workspace_id = ws.id
     where l.status = $2
       and not (coalesce(l.deleted_by_user_ids, '[]'::jsonb) @> to_jsonb($1::bigint))
       and (
         ws.owner_user_id = $1
         or (coalesce(ss.curator_enabled, false) = true and exists(
           select 1 from workspace_curators c where c.workspace_id = ws.id and c.user_id = $1
         ))
       )${assignClause}`,
    [uId, String(status)]
  );
  return Number(r.rows?.[0]?.cnt || 0);
}

export async function appendBrandLeadCuratorNote(leadId, byUserId, text, opts = {}) {
  const id = Number(leadId || 0);
  const by = Number(byUserId || 0);
  const t = String(text || '').trim();
  if (!id || !by || !t) return null;

  const safeText = t.length > 1200 ? (t.slice(0, 1200) + '…') : t;

  const roleRaw = opts && typeof opts === 'object' ? String(opts.role || '').trim() : '';
  const role = roleRaw ? roleRaw.toLowerCase() : null;
  const r = await pool.query(
    `update brand_leads
     set meta = jsonb_set(
       coalesce(meta, '{}'::jsonb),
       '{curator_notes}',
       (coalesce(coalesce(meta, '{}'::jsonb)->'curator_notes', '[]'::jsonb) ||
        jsonb_build_array(
          jsonb_build_object(
            'by', $2::int,
            'at', now(),
            'text', $3::text,
            'role', $4::text
          )
        )
       ),
       true
     ),
     updated_at = now()
     where id = $1
     returning meta`,
    [id, by, safeText, role]
  );
  return r.rows[0] || null;
}

export async function updateBrandLeadStatus(leadId, status) {
  const r = await pool.query(
    `update brand_leads
       set status=$2, updated_at=now()
     where id=$1
     returning *`,
    [Number(leadId), String(status)]
  );
  return r.rows[0] || null;
}

export async function markBrandLeadReplied(leadId, replyText, repliedByUserId) {
  const r = await pool.query(
    `update brand_leads
       set reply_text=$2,
           replied_by_user_id=$3,
           replied_at=now(),
           updated_at=now()
     where id=$1
     returning *`,
    [Number(leadId), String(replyText || ''), repliedByUserId ? Number(repliedByUserId) : null]
  );
  return r.rows[0] || null;
}


export async function markBrandLeadTakenInWork(leadId, byUserId) {
  const id = Number(leadId || 0);
  const by = Number(byUserId || 0);
  if (!id || !by) return null;

  const r = await pool.query(
    `update brand_leads
       set status = case when status='new' then 'in_progress' else status end,
           meta = jsonb_set(
             jsonb_set(
               coalesce(meta,'{}'::jsonb),
               '{in_progress_by}',
               coalesce(coalesce(meta,'{}'::jsonb)->'in_progress_by', to_jsonb($2::int)),
               true
             ),
             '{in_progress_at}',
             coalesce(coalesce(meta,'{}'::jsonb)->'in_progress_at', to_jsonb(now())),
             true
           ),
           updated_at=now()
     where id=$1
     returning *`,
    [id, by]
  );
  return r.rows[0] || null;
}

export async function markBrandLeadClosedBy(leadId, byUserId) {
  const id = Number(leadId || 0);
  const by = Number(byUserId || 0);
  if (!id || !by) return null;

  const r = await pool.query(
    `update brand_leads
       set status='closed',
           meta = jsonb_set(
             jsonb_set(
               coalesce(meta,'{}'::jsonb),
               '{closed_by}',
               coalesce(coalesce(meta,'{}'::jsonb)->'closed_by', to_jsonb($2::int)),
               true
             ),
             '{closed_at}',
             coalesce(coalesce(meta,'{}'::jsonb)->'closed_at', to_jsonb(now())),
             true
           ),
           updated_at=now()
     where id=$1
     returning *`,
    [id, by]
  );
  return r.rows[0] || null;
}



// --- Brand Applications (requests from creators on brand directory) ---

export async function createBrandApplication({
  brandUserId,
  creatorUserId,
  creatorTgId,
  creatorUsername = null,
  message,
  meta = null
}) {
  const r = await pool.query(
    `insert into brand_applications
      (brand_user_id, creator_user_id, creator_tg_id, creator_username, message, meta, status)
     values ($1,$2,$3,$4,$5,$6::jsonb,'new')
     returning *`,
    [
      Number(brandUserId),
      Number(creatorUserId),
      Number(creatorTgId),
      creatorUsername ? String(creatorUsername) : null,
      String(message || ''),
      meta ? JSON.stringify(meta) : null
    ]
  );
  return r.rows[0] || null;
}

export async function getBrandApplicationById(appId) {
  const r = await pool.query(`select * from brand_applications where id=$1`, [Number(appId)]);
  return r.rows[0] || null;
}

export async function countBrandApplicationsByStatus(brandUserId) {
  const r = await pool.query(
    `select status, count(*)::int as cnt
     from brand_applications
     where brand_user_id=$1
       and not (coalesce(deleted_by_user_ids, '[]'::jsonb) @> to_jsonb($1::bigint))
     group by status`,
    [Number(brandUserId)]
  );
  const out = { new: 0, in_progress: 0, closed: 0, spam: 0 };
  for (const row of r.rows) {
    const k = String(row.status || '').toLowerCase();
    if (out[k] !== undefined) out[k] = Number(row.cnt || 0);
  }
  return out;
}

export async function listBrandApplications(brandUserId, status, limit = 10, offset = 0) {
  const r = await pool.query(
    `select *
     from brand_applications
     where brand_user_id=$1 and coalesce(status,'new')=$2
       and not (coalesce(deleted_by_user_ids, '[]'::jsonb) @> to_jsonb($1::bigint))
     order by created_at desc, id desc
     limit $3 offset $4`,
    [Number(brandUserId), String(status), Number(limit), Number(offset)]
  );
  return r.rows || [];
}

export async function updateBrandApplicationStatus(appId, status) {
  const r = await pool.query(
    `update brand_applications
       set status=$2, updated_at=now()
     where id=$1
     returning *`,
    [Number(appId), String(status)]
  );
  return r.rows[0] || null;
}

export async function markBrandApplicationReplied(appId, replyText, repliedByUserId) {
  const r = await pool.query(
    `update brand_applications
       set reply_text=$2,
           replied_by_user_id=$3,
           replied_at=now(),
           updated_at=now()
     where id=$1
     returning *`,
    [Number(appId), String(replyText || ''), repliedByUserId ? Number(repliedByUserId) : null]
  );
  return r.rows[0] || null;
}

// Set status=in_progress and record accept meta (micro-CRM)
export async function markBrandApplicationAccepted(appId, acceptedByUserId) {
  const r = await pool.query(
    `update brand_applications
       set status='in_progress',
           meta = jsonb_set(
             jsonb_set(
               coalesce(meta,'{}'::jsonb),
               '{deal}',
               coalesce(coalesce(meta,'{}'::jsonb)->'deal','{}'::jsonb)
                 || jsonb_build_object(
                      'accepted_by_user_id', $2,
                      'accepted_at', now()
                    ),
               true
             ),
             '{deal_stage}',
             to_jsonb(coalesce(nullif(coalesce(meta->>'deal_stage',''),''), 'negotiation')),
             true
           ),
           updated_at=now()
     where id=$1
     returning *`,
    [Number(appId), acceptedByUserId ? Number(acceptedByUserId) : null]
  );
  return r.rows[0] || null;
}

// List brand deals (applications that have deal_stage set)
export async function countBrandDealsByStage(brandUserId, acceptedByUserId = null) {
  const params = [Number(brandUserId)];
  let where = `brand_user_id=$1 and coalesce(meta->>'deal_stage','') <> ''`;

  if (acceptedByUserId) {
    params.push(Number(acceptedByUserId));
    where += ` and nullif(meta->'deal'->>'accepted_by_user_id','')::int = $2`;
  }

  const r = await pool.query(
    `select coalesce(meta->>'deal_stage','') as stage, count(*)::int as cnt
     from brand_applications
     where ${where}
     group by stage`,
    params
  );

  const out = { negotiation: 0, deal: 0, paid: 0, done: 0, lost: 0, all: 0 };
  for (const row of r.rows) {
    const s = String(row.stage || '').toLowerCase();
    const n = Number(row.cnt || 0);
    out.all += n;
    if (out[s] !== undefined) out[s] = n;
  }
  return out;
}


export async function listBrandDeals(brandUserId, stage = 'negotiation', limit = 10, offset = 0, acceptedByUserId = null) {
  const st = String(stage || 'negotiation').toLowerCase();

  const params = [Number(brandUserId)];
  let idx = 2;

  let where = `brand_user_id=$1`;

  if (acceptedByUserId) {
    where += ` and nullif(meta->'deal'->>'accepted_by_user_id','')::int = $${idx}`;
    params.push(Number(acceptedByUserId));
    idx += 1;
  }

  if (st === 'all') {
    where += ` and coalesce(meta->>'deal_stage','') <> ''`;
  } else {
    where += ` and coalesce(meta->>'deal_stage','') = $${idx}`;
    params.push(st);
    idx += 1;
  }

  const limitIdx = idx; idx += 1;
  const offsetIdx = idx; idx += 1;
  params.push(Number(limit));
  params.push(Number(offset));

  const r = await pool.query(
    `select *
     from brand_applications
     where ${where}
     order by updated_at desc, id desc
     limit $${limitIdx} offset $${offsetIdx}`,
    params
  );
  return r.rows || [];
}


export async function countBrandDealsFiltered(brandUserId, stage = 'negotiation', search = '', acceptedByUserId = null) {
  const st = String(stage || 'negotiation').toLowerCase();
  const termRaw = String(search || '').trim();
  const term = termRaw.toLowerCase();

  const params = [Number(brandUserId)];
  let idx = 2;

  let where = `brand_user_id=$1`;

  if (acceptedByUserId) {
    where += ` and nullif(meta->'deal'->>'accepted_by_user_id','')::int = $${idx}`;
    params.push(Number(acceptedByUserId));
    idx += 1;
  }

  if (st === 'all') {
    where += ` and coalesce(meta->>'deal_stage','') <> ''`;
  } else {
    where += ` and coalesce(meta->>'deal_stage','') = $${idx}`;
    params.push(st);
    idx += 1;
  }

  if (term) {
    if (/^\d+$/.test(term)) {
      where += ` and creator_tg_id = $${idx}`;
      params.push(Number(term));
      idx += 1;
    } else {
      const like = `%${term.replace(/^@/, '')}%`;
      where += ` and (
        lower(coalesce(creator_username,'')) like $${idx}
        or lower(coalesce(message,'')) like $${idx}
      )`;
      params.push(like);
      idx += 1;
    }
  }

  const r = await pool.query(
    `select count(*)::int as cnt
     from brand_applications
     where ${where}`,
    params
  );

  return Number(r.rows[0]?.cnt || 0);
}


export async function listBrandDealsFiltered(brandUserId, stage = 'negotiation', search = '', limit = 10, offset = 0, acceptedByUserId = null) {
  const st = String(stage || 'negotiation').toLowerCase();
  const termRaw = String(search || '').trim();
  const term = termRaw.toLowerCase();

  const params = [Number(brandUserId)];
  let idx = 2;

  let where = `brand_user_id=$1`;

  if (acceptedByUserId) {
    where += ` and nullif(meta->'deal'->>'accepted_by_user_id','')::int = $${idx}`;
    params.push(Number(acceptedByUserId));
    idx += 1;
  }

  if (st === 'all') {
    where += ` and coalesce(meta->>'deal_stage','') <> ''`;
  } else {
    where += ` and coalesce(meta->>'deal_stage','') = $${idx}`;
    params.push(st);
    idx += 1;
  }

  if (term) {
    if (/^\d+$/.test(term)) {
      where += ` and creator_tg_id = $${idx}`;
      params.push(Number(term));
      idx += 1;
    } else {
      const like = `%${term.replace(/^@/, '')}%`;
      where += ` and (
        lower(coalesce(creator_username,'')) like $${idx}
        or lower(coalesce(message,'')) like $${idx}
      )`;
      params.push(like);
      idx += 1;
    }
  }

  const limitIdx = idx; idx += 1;
  const offsetIdx = idx; idx += 1;
  params.push(Number(limit));
  params.push(Number(offset));

  const r = await pool.query(
    `select *
     from brand_applications
     where ${where}
     order by updated_at desc, id desc
     limit $${limitIdx} offset $${offsetIdx}`,
    params
  );
  return r.rows || [];
}


export async function setBrandApplicationDealStage(appId, stage, setByUserId) {
  const st = String(stage || '').toLowerCase();
  const r = await pool.query(
    `update brand_applications
       set meta = jsonb_set(
         jsonb_set(
           coalesce(meta,'{}'::jsonb),
           '{deal_stage}',
           to_jsonb($2::text),
           true
         ),
         '{deal_stage_meta}',
         coalesce(coalesce(meta,'{}'::jsonb)->'deal_stage_meta','{}'::jsonb)
           || jsonb_build_object('set_by_user_id',$3,'set_at',now()),
         true
       ),
       updated_at=now()
     where id=$1
     returning *`,
    [Number(appId), st, setByUserId ? Number(setByUserId) : null]
  );
  return r.rows[0] || null;
}

// Append a message to meta.thread[] (no migration; stored in JSON)
export async function appendBrandApplicationThreadMessage(appId, messageObj) {
  const r = await pool.query(
    `update brand_applications
       set meta = jsonb_set(
         coalesce(meta,'{}'::jsonb),
         '{thread}',
         coalesce(coalesce(meta,'{}'::jsonb)->'thread','[]'::jsonb)
           || jsonb_build_array($2::jsonb),
         true
       ),
       updated_at=now()
     where id=$1
     returning *`,
    [Number(appId), JSON.stringify(messageObj || {})]
  );
  return r.rows[0] || null;
}

/**
 * List brand applications submitted BY a creator (creator-side inbox).
 */
export async function listCreatorApplications(creatorUserId, limit = 10, offset = 0) {
  const r = await pool.query(
    `select a.*,
            bp.brand_name,
            u.tg_username as brand_username
     from brand_applications a
     left join brand_profiles bp on bp.user_id = a.brand_user_id
     left join users u on u.id = a.brand_user_id
     where a.creator_user_id = $1
     order by a.updated_at desc
     limit $2 offset $3`,
    [Number(creatorUserId), Math.min(50, Number(limit) || 10), Math.max(0, Number(offset) || 0)]
  );
  return r.rows || [];
}

export async function countCreatorApplications(creatorUserId) {
  const r = await pool.query(
    `select count(*)::int as cnt from brand_applications where creator_user_id = $1`,
    [Number(creatorUserId)]
  );
  return Number(r.rows?.[0]?.cnt || 0);
}



// Profiles matching (matrix-based)
export async function searchWorkspaceProfilesByMatrix(verticals = [], formats = [], offset = 0, limit = 6) {
  const v = Array.isArray(verticals) ? verticals : [];
  const f = Array.isArray(formats) ? formats : [];

  const r = await pool.query(
    `
    select
      ws.id,
      ws.title as ws_title,
      ws.channel_username,
      ws.owner_user_id,
      s.profile_title,
      s.profile_mode,
      s.profile_ig,
      s.profile_verticals,
      s.profile_formats,
      s.profile_geo,
      s.profile_contact,
      s.profile_portfolio_urls,
      s.profile_about,
      (
        (select count(*) from unnest(coalesce(s.profile_verticals,'{}'::text[])) v1 where v1 = any($1::text[])) * 100
        +
        (select count(*) from unnest(coalesce(s.profile_formats,'{}'::text[])) f1 where f1 = any($2::text[])) * 10
      )::int as score
    from workspaces ws
    join workspace_settings s on s.workspace_id = ws.id
    where
      (cardinality($1::text[]) = 0 or coalesce(s.profile_verticals,'{}'::text[]) && $1::text[])
      and
      (cardinality($2::text[]) = 0 or coalesce(s.profile_formats,'{}'::text[]) && $2::text[])
      and (
        (s.profile_ig is not null and s.profile_ig <> '')
        or (s.profile_contact is not null and s.profile_contact <> '')
        or (s.profile_title is not null and s.profile_title <> '')
      )
    order by score desc, s.updated_at desc, ws.created_at desc
    offset $3 limit $4
    `,
    [v, f, offset, limit]
  );

  return r.rows;
}


// -----------------------------
// Broadcasts (admin mass-messaging)
// -----------------------------

export async function createBroadcast({ createdByUserId, audience, draftType, draftText, draftFileId, draftCaption, buttonsJson }) {
  const r = await pool.query(
    `insert into broadcasts (created_by_user_id, status, audience, draft_type, draft_text, draft_file_id, draft_caption, buttons_json)
     values ($1, 'PENDING', $2, $3, $4, $5, $6, $7)
     returning *`,
    [
      Number(createdByUserId),
      String(audience || 'all'),
      draftType || null,
      draftText || null,
      draftFileId || null,
      draftCaption || null,
      buttonsJson || null,
    ]
  );
  return r.rows[0] || null;
}

export async function getBroadcast(id) {
  const r = await pool.query(`select * from broadcasts where id = $1`, [Number(id)]);
  return r.rows[0] || null;
}

export async function updateBroadcast(id, fields = {}) {
  const sets = [];
  const params = [Number(id)];
  let idx = 2;
  for (const [key, val] of Object.entries(fields)) {
    sets.push(`${key} = $${idx}`);
    params.push(val);
    idx++;
  }
  if (!sets.length) return;
  sets.push(`updated_at = now()`);
  await pool.query(`update broadcasts set ${sets.join(', ')} where id = $1`, params);
}

/**
 * Count audience for a broadcast filter.
 * Mirrors listUsersDirectory filter logic.
 */
export async function countBroadcastAudience(audience = 'all') {
  const filter = String(audience || 'all').toLowerCase();
  let where = '';
  if (filter === 'brands') {
    where = `where (
      exists (select 1 from brand_profiles bp where bp.user_id = u.id)
      or u.brand_plan is not null
      or coalesce(u.brand_credits,0) > 0
    )`;
  } else if (filter === 'creators') {
    where = `where exists (select 1 from workspaces w where w.owner_user_id = u.id)`;
  } else if (filter === 'curators') {
    where = `where (
      exists (select 1 from workspace_curators wc where wc.user_id = u.id)
      or exists (select 1 from network_moderators nm where nm.user_id = u.id)
    )`;
  } else if (filter === 'managers') {
    where = `where exists (select 1 from brand_managers bm where bm.manager_user_id = u.id)`;
  }
  const r = await pool.query(`select count(*)::int as cnt from users u ${where}`);
  return Number(r.rows[0]?.cnt || 0);
}

/**
 * List user TG IDs for broadcast delivery (batched, cursor-based).
 * Returns users whose tg_id > lastTgId, ordered by tg_id, limited by batchSize.
 */
export async function listBroadcastRecipients(audience = 'all', batchSize = 30, lastUserId = 0) {
  const filter = String(audience || 'all').toLowerCase();
  const where = ['u.id > $1'];
  if (filter === 'brands') {
    where.push(`(
      exists (select 1 from brand_profiles bp where bp.user_id = u.id)
      or u.brand_plan is not null
      or coalesce(u.brand_credits,0) > 0
    )`);
  } else if (filter === 'creators') {
    where.push(`exists (select 1 from workspaces w where w.owner_user_id = u.id)`);
  } else if (filter === 'curators') {
    where.push(`(
      exists (select 1 from workspace_curators wc where wc.user_id = u.id)
      or exists (select 1 from network_moderators nm where nm.user_id = u.id)
    )`);
  } else if (filter === 'managers') {
    where.push(`exists (select 1 from brand_managers bm where bm.manager_user_id = u.id)`);
  }
  const r = await pool.query(
    `select u.id as user_id, u.tg_id
     from users u
     where ${where.join(' and ')}
     order by u.id
     limit $2`,
    [Number(lastUserId), Number(batchSize)]
  );
  return r.rows || [];
}

export async function logBroadcastSent(broadcastId, userId, status = 'sent') {
  await pool.query(
    `insert into broadcast_sent_log (broadcast_id, user_id, status)
     values ($1, $2, $3)
     on conflict (broadcast_id, user_id) do nothing`,
    [Number(broadcastId), Number(userId), String(status)]
  );
}

export async function isBroadcastSentToUser(broadcastId, userId) {
  const r = await pool.query(
    `select 1 from broadcast_sent_log where broadcast_id = $1 and user_id = $2 limit 1`,
    [Number(broadcastId), Number(userId)]
  );
  return (r.rows || []).length > 0;
}

export async function listBroadcasts(limit = 10, offset = 0) {
  const r = await pool.query(
    `select * from broadcasts order by created_at desc limit $1 offset $2`,
    [Math.min(50, Number(limit) || 10), Math.max(0, Number(offset) || 0)]
  );
  return r.rows || [];
}

/**
 * Get next active broadcast to process (PENDING first, then RUNNING).
 */
export async function getActiveBroadcast() {
  const r = await pool.query(
    `select * from broadcasts
     where status in ('PENDING','RUNNING')
     order by
       case status when 'RUNNING' then 0 when 'PENDING' then 1 end,
       created_at
     limit 1`
  );
  return r.rows[0] || null;
}

/**
 * List recipients that have NOT yet been sent this broadcast (idempotent cursor).
 * Uses broadcast_sent_log to skip already-processed users.
 */
export async function listBroadcastUnsentRecipients(broadcastId, audience = 'all', batchSize = 25, lastUserId = 0) {
  const filter = String(audience || 'all').toLowerCase();
  const where = ['u.id > $1', 'not exists (select 1 from broadcast_sent_log sl where sl.broadcast_id = $3 and sl.user_id = u.id)'];
  if (filter === 'brands') {
    where.push(`(
      exists (select 1 from brand_profiles bp where bp.user_id = u.id)
      or u.brand_plan is not null
      or coalesce(u.brand_credits,0) > 0
    )`);
  } else if (filter === 'creators') {
    where.push(`exists (select 1 from workspaces w where w.owner_user_id = u.id)`);
  } else if (filter === 'curators') {
    where.push(`(
      exists (select 1 from workspace_curators wc where wc.user_id = u.id)
      or exists (select 1 from network_moderators nm where nm.user_id = u.id)
    )`);
  } else if (filter === 'managers') {
    where.push(`exists (select 1 from brand_managers bm where bm.manager_user_id = u.id)`);
  }
  const r = await pool.query(
    `select u.id as user_id, u.tg_id
     from users u
     where ${where.join(' and ')}
     order by u.id
     limit $2`,
    [Number(lastUserId), Number(batchSize), Number(broadcastId)]
  );
  return r.rows || [];
}



// ==============================
// Deterministic draw + locking (serverless-safe)
// ==============================

/**
 * Deterministic winners draw in SQL.
 *
 * Seed policy (stable + reproducible): `${giveawayId}:${endsAtIso}`
 *
 * Preferred algorithm: SHA-256 via pgcrypto (digest).
 * Fallback (if pgcrypto isn't installed yet): md5.
 */
export async function drawWinnersDeterministic(
  giveawayId,
  winnersCount,
  endsAtIso,
  onlyEligible = true
) {
  const gid = Number(giveawayId);
  const cnt = Math.max(1, Number(winnersCount || 1));
  const seed = `${gid}:${String(endsAtIso || '')}`;
  const eligibilityClause = onlyEligible ? 'AND is_eligible = TRUE' : '';

  // Primary (sha256)
  try {
    const res = await pool.query(
      `
      SELECT user_id
      FROM giveaway_entries
      WHERE giveaway_id = $1
        ${eligibilityClause}
      ORDER BY encode(digest($3 || ':' || user_id::text, 'sha256'), 'hex')
      LIMIT $2
      `,
      [gid, cnt, seed]
    );
    return res.rows.map((r) => Number(r.user_id));
  } catch (e) {
    // Missing pgcrypto / digest() → fallback to md5
    const code = e?.code || null;
    const msg = String(e?.message || '');
    const looksLikeMissingDigest = code === '42883' || msg.includes('function digest');
    if (!looksLikeMissingDigest) throw e;

    const res = await pool.query(
      `
      SELECT user_id
      FROM giveaway_entries
      WHERE giveaway_id = $1
        ${eligibilityClause}
      ORDER BY md5($3 || ':' || user_id::text)
      LIMIT $2
      `,
      [gid, cnt, seed]
    );
    return res.rows.map((r) => Number(r.user_id));
  }
}

/**
 * Atomic draw + persist winners + update giveaway status.
 *
 * Guarantees:
 * - no partial writes (single DB transaction)
 * - no double draw (pg_try_advisory_xact_lock + row lock)
 * - deterministic and reproducible selection
 */
export async function drawAndFinalizeGiveawayWinnersAtomic(
  giveawayId,
  workspaceId,
  winnersCount,
  endsAtIso
) {
  const gid = Number(giveawayId);
  const wsid = Number(workspaceId);
  const requested = Math.max(1, Number(winnersCount || 1));
  const seed = `${gid}:${String(endsAtIso || '')}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Transaction-scoped advisory lock: released automatically on COMMIT/ROLLBACK
    const lockRes = await client.query(
      'SELECT pg_try_advisory_xact_lock($1) AS ok',
      [gid]
    );
    if (!lockRes.rows?.[0]?.ok) {
      await client.query('ROLLBACK');
      return { status: 'locked' };
    }

    // Row lock for idempotency (prevents a second tx from drawing the same giveaway)
    const gwRes = await client.query(
      `
      SELECT id, status, winners_drawn_at
      FROM giveaways
      WHERE id = $1
      FOR UPDATE
      `,
      [gid]
    );

    if (!gwRes.rowCount) {
      await client.query('ROLLBACK');
      return { status: 'missing' };
    }

    const gw = gwRes.rows[0];
    if (gw.winners_drawn_at) {
      await client.query('ROLLBACK');
      return { status: 'already_drawn' };
    }
    if (String(gw.status || '').toUpperCase() !== 'ENDED') {
      await client.query('ROLLBACK');
      return { status: 'wrong_status', status_value: gw.status };
    }

    // Helper to pick winners deterministically with sha256 (fallback: md5)
    async function pick({ onlyEligible, excludeIds, limit }) {
      const eligibilityClause = onlyEligible ? 'AND is_eligible = TRUE' : '';
      const exclude = Array.isArray(excludeIds) ? excludeIds : [];
      const lim = Math.max(1, Number(limit || 1));

      // Primary (sha256 via pgcrypto)
      try {
        const r = await client.query(
          `
          SELECT user_id
          FROM giveaway_entries
          WHERE giveaway_id = $1
            ${eligibilityClause}
            AND NOT (user_id = ANY($4::bigint[]))
          ORDER BY encode(digest($2 || ':' || user_id::text, 'sha256'), 'hex')
          LIMIT $3
          `,
          [gid, seed, lim, exclude]
        );
        return { rows: r.rows, method: 'sha256' };
      } catch (e) {
        const code = e?.code || null;
        const msg = String(e?.message || '');
        const looksLikeMissingDigest = code === '42883' || msg.includes('function digest');
        if (!looksLikeMissingDigest) throw e;

        const r = await client.query(
          `
          SELECT user_id
          FROM giveaway_entries
          WHERE giveaway_id = $1
            ${eligibilityClause}
            AND NOT (user_id = ANY($4::bigint[]))
          ORDER BY md5($2 || ':' || user_id::text)
          LIMIT $3
          `,
          [gid, seed, lim, exclude]
        );
        return { rows: r.rows, method: 'md5_fallback' };
      }
    }

    // 1) Prefer eligible
    let usedPool = 'eligible';
    const winnersUserIds = [];

    const pickedEligible = await pick({ onlyEligible: true, excludeIds: [], limit: requested });
    let method = pickedEligible.method;

    for (const r of pickedEligible.rows || []) {
      const uid = Number(r.user_id);
      if (Number.isFinite(uid)) winnersUserIds.push(uid);
    }

    // 2) Top-up from all entries if eligible < requested (no duplicates), deterministic
    if (winnersUserIds.length < requested) {
      const remaining = requested - winnersUserIds.length;

      const pickedTopup = await pick({
        onlyEligible: false,
        excludeIds: winnersUserIds,
        limit: remaining,
      });

      // If eligible was empty, this is effectively "all_entries"
      if (!winnersUserIds.length) usedPool = 'all_entries';
      else if ((pickedTopup.rows || []).length) usedPool = 'eligible_topup';
      else usedPool = 'eligible'; // partial, but still "eligible first"

      // If methods differ (shouldn't), prefer sha256 when available
      if (method !== 'sha256') method = pickedTopup.method;
      else method = 'sha256';

      for (const r of pickedTopup.rows || []) {
        const uid = Number(r.user_id);
        if (!Number.isFinite(uid)) continue;
        // excludeIds already prevents duplicates, but keep a hard guard anyway
        if (winnersUserIds.includes(uid)) continue;
        winnersUserIds.push(uid);
        if (winnersUserIds.length >= requested) break;
      }
    }

    if (!winnersUserIds.length) {
      // Audit skip (no entries)
      await client.query(
        `
        INSERT INTO giveaway_audit (giveaway_id, workspace_id, actor_user_id, action, payload)
        VALUES ($1, $2, NULL, $3, $4::jsonb)
        `,
        [
          gid,
          wsid,
          'gw.winners_drawn_skipped',
          JSON.stringify({ reason: 'no_entries', seed, method }),
        ]
      );
      await client.query('COMMIT');
      return { status: 'no_entries', seed, method };
    }

    // Persist winners (replace if any)
    await client.query('DELETE FROM giveaway_winners WHERE giveaway_id = $1', [gid]);
    for (let i = 0; i < winnersUserIds.length; i++) {
      await client.query(
        `
        INSERT INTO giveaway_winners (giveaway_id, user_id, place)
        VALUES ($1, $2, $3)
        `,
        [gid, winnersUserIds[i], i + 1]
      );
    }

    // Mark giveaway as drawn (extra atomic guard)
    const markRes = await client.query(
      `
      UPDATE giveaways
      SET status = 'WINNERS_DRAWN',
          winners_drawn_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND winners_drawn_at IS NULL
      RETURNING id
      `,
      [gid]
    );

    if (!markRes.rowCount) {
      await client.query('ROLLBACK');
      return { status: 'already_drawn' };
    }

    // Audit draw
    await client.query(
      `
      INSERT INTO giveaway_audit (giveaway_id, workspace_id, actor_user_id, action, payload)
      VALUES ($1, $2, NULL, $3, $4::jsonb)
      `,
      [
        gid,
        wsid,
        'gw.winners_drawn',
        JSON.stringify({
          seed,
          method,
          winners: winnersUserIds.length,
          used_pool: usedPool,
          requested_winners: requested,
        }),
      ]
    );

    await client.query('COMMIT');
    return {
      status: 'drawn',
      seed,
      method,
      used_pool: usedPool,
      winnersUserIds,
      requested_winners: requested,
    };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Try to acquire an advisory lock (session-level).
 * NOTE: For cron jobs prefer pg_try_advisory_xact_lock inside a transaction.
 */
export async function tryAdvisoryLock(key) {
  const res = await pool.query('SELECT pg_try_advisory_lock($1) AS locked', [Number(key)]);
  return !!res.rows?.[0]?.locked;
}

/**
 * Release an advisory lock (session-level).
 */
export async function advisoryUnlock(key) {
  await pool.query('SELECT pg_advisory_unlock($1)', [Number(key)]);
}

