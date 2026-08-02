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

import { isMissingRelationError } from './monetizationRepository.js';

// BEGIN MOVED QUERY BODY: brandsRepository
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


export async function claimOrphanedMissingSessionPaymentsForAutoheal(limit = 20, minAgeSec = 0) {
  // Claim a batch of ORPHANED (or stale APPLYING) payments that are marked missing_session.
  // Uses SKIP LOCKED to avoid duplicate work when cron overlaps / retries.
  const lim = Number(limit) || 0;
  const age = Number(minAgeSec) || 0;
  if (lim <= 0) return [];

  const r = await pool.query(
    `with cand as (
       select p.id, u.tg_id, u.tg_username
       from payments p
       left join users u on u.id = p.user_id
       where (
              p.status = 'ORPHANED'
           or (p.status = 'APPLYING' and p.applying_at is not null and p.applying_at < now() - interval '20 minutes')
         )
         and coalesce(p.note, '') ilike '%missing_session%'
         and ($2::int <= 0 or p.created_at < now() - ($2::int * interval '1 second'))
       order by p.created_at desc
       for update skip locked
       limit $1
     )
     update payments p
        set status = 'APPLYING',
            applying_by_user_id = null,
            applying_at = now(),
            updated_at = now()
       from cand
      where p.id = cand.id
      returning p.*, cand.tg_id, cand.tg_username`,
    [lim, age]
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

// END MOVED QUERY BODY: brandsRepository
