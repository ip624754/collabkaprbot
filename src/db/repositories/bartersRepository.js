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

import { takeAvailableRetryCreditForUpdate, redeemRetryCredit } from './usersRepository.js';

// BEGIN MOVED QUERY BODY: bartersRepository
// -----------------------------
// Barters marketplace (v0.9.1)
// -----------------------------

export function isMissingBarterOffersMetaColumnError(err) {
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
      where o.id = $1
        and w.owner_user_id = $2
      limit 1`,
    [Number(offerId), Number(ownerUserId)]
  );
  return r.rows[0] || null;
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

    // Serialize first-contact charging/opening per (offer_id, buyer_user_id) to avoid races:
    // - prevents false paywall/limit responses on double-click when another txn already created the thread
    // - ensures credits/retry/trial logic runs exactly once per pair
    const k1 = Math.abs(Number(offerId || 0)) % 2147483647;
    const k2 = Math.abs(Number(buyerUserId || 0)) % 2147483647;
    await client.query(`select pg_advisory_xact_lock($1::int, $2::int)`, [k1, k2]);

    // Re-check thread after lock (another request may have created it while we waited)
    const existingRes2 = await client.query(
      `select * from barter_threads where offer_id=$1 and buyer_user_id=$2`,
      [offerId, buyerUserId]
    );
    if (existingRes2.rows.length) {
      await client.query('commit');
      return { ok: true, thread: existingRes2.rows[0], charged: false, chargedAmount: 0 };
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
    let chargedRes;
    try {
      chargedRes = await client.query(
        `update users
         set brand_credits = greatest(0, brand_credits - $2),
             brand_credits_spent = brand_credits_spent + $2,
             brand_credits_gifted = greatest(0, brand_credits_gifted - $2),
             updated_at=now()
         where id=$1
         returning brand_credits`,
        [buyerUserId, normalizedCost]
      );
    } catch (e) {
      // Rolling upgrade safety: 42703 = undefined_column
      if (e && e.code === '42703') {
        chargedRes = await client.query(
          `update users
           set brand_credits = greatest(0, brand_credits - $2),
               brand_credits_spent = brand_credits_spent + $2,
               updated_at=now()
           where id=$1
           returning brand_credits`,
          [buyerUserId, normalizedCost]
        );
      } else {
        throw e;
      }
    }
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
  const uid = Number(userId);
  try {
    await pool.query(
      `update users set brand_credits = 0, brand_credits_gifted = 0, updated_at = now() where id = $1`,
      [uid]
    );
  } catch (e) {
    if (e && e.code === '42703') {
      await pool.query(
        `update users set brand_credits = 0, updated_at = now() where id = $1`,
        [uid]
      );
      return;
    }
    throw e;
  }
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
// END MOVED QUERY BODY: bartersRepository
