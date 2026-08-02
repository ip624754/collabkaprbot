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


// BEGIN MOVED QUERY BODY: monetizationRepository
// Smart Matching
// -----------------------------

// Count included Smart Matching runs used in the current calendar month.
// We treat "included" as requests created with stars_paid = 0.
export async function countIncludedMatchingThisMonth(userId) {
  const r = await pool.query(
    `select count(*)::int as c
       from matching_requests
      where user_id = $1
        and coalesce(stars_paid, 0) = 0
        and created_at >= date_trunc('month', now())`,
    [Number(userId)]
  );
  return Number(r.rows[0]?.c || 0);
}

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

// Count included Featured placements used in the current calendar month.
// We treat "included" as placements created with stars_paid = 0.
export async function countIncludedFeaturedThisMonth(userId) {
  const r = await pool.query(
    `select count(*)::int as c
       from featured_placements
      where user_id = $1
        and coalesce(stars_paid, 0) = 0
        and created_at >= date_trunc('month', now())`,
    [Number(userId)]
  );
  return Number(r.rows[0]?.c || 0);
}

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


export async function atomicReserveOfficialPublish(offerId, input = {}) {
  const channelChatId = Number(input.channelChatId);
  const placementType = String(input.placementType || 'MANUAL');
  const paymentId = input.paymentId ? Number(input.paymentId) : null;
  const slotDays = input.slotDays ? Number(input.slotDays) : null;
  const slotExpiresAt = input.slotExpiresAt || null;
  const publishedByUserId = input.publishedByUserId ? Number(input.publishedByUserId) : null;

  const r = await pool.query(
    `insert into official_posts (offer_id, channel_chat_id, status, placement_type, payment_id, slot_days, slot_expires_at, published_by_user_id, last_error, updated_at)
     values ($1,$2,'PUBLISHING',$3,$4,$5,$6,$7,null, now())
     on conflict (offer_id)
     do update set channel_chat_id=excluded.channel_chat_id,
                   status='PUBLISHING',
                   placement_type=excluded.placement_type,
                   payment_id=coalesce(excluded.payment_id, official_posts.payment_id),
                   slot_days=coalesce(excluded.slot_days, official_posts.slot_days),
                   slot_expires_at=coalesce(excluded.slot_expires_at, official_posts.slot_expires_at),
                   published_by_user_id=coalesce(excluded.published_by_user_id, official_posts.published_by_user_id),
                   last_error=null,
                   updated_at=now()
     where official_posts.status <> 'PUBLISHING'
        or official_posts.updated_at < now() - interval '10 minutes'
     returning *`,
    [Number(offerId), channelChatId, placementType, paymentId, slotDays, slotExpiresAt, publishedByUserId]
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

// STEP129: self-heal for serverless hard-kill during official publish
// When our bot successfully posts to the official channel but the function dies
// before persisting message_id, Telegram will still deliver a channel_post update
// to our webhook. We attach that message_id here to finish the transaction.
export async function atomicAttachOfficialPostMessageId(offerId, input = {}) {
  const channelChatId = Number(input.channelChatId || 0);
  const messageId = Number(input.messageId || 0);
  if (!offerId || !channelChatId || !messageId) return null;

  const r = await pool.query(
    `update official_posts
        set channel_chat_id=$2,
            message_id=$3,
            status='ACTIVE',
            last_error=null,
            updated_at=now()
      where offer_id=$1
        and (
          status='PUBLISHING'
          or (status='ACTIVE' and (message_id is null or message_id=0))
        )
      returning *`,
    [Number(offerId), channelChatId, messageId]
  );
  return r.rows[0] || null;
}

/**
 * Atomically expire an official post only if it is still ACTIVE.
 * Returns true if the row was updated; false means another tick already expired it.
 */
export async function atomicExpireOfficialPost(offerId) {
  const r = await pool.query(
    `update official_posts
        set status='EXPIRED',
            updated_at=now()
      where offer_id=$1 and status='ACTIVE'
      returning offer_id`,
    [Number(offerId)]
  );
  return r.rowCount > 0;
}

export async function listOfficialPending(limit = 20, offset = 0) {
  const r = await pool.query(
    `select op.*, o.title as offer_title, w.title as ws_title, w.channel_username
       from official_posts op
       join barter_offers o on o.id=op.offer_id
       join workspaces w on w.id=o.workspace_id
      where op.status in ('PENDING','PUBLISHING')
      order by op.updated_at desc
      limit $1 offset $2`,
    [Number(limit), Number(offset)]
  );
  return r.rows;
}

export async function countOfficialPending() {
  const r = await pool.query(`select count(*)::int as c from official_posts where status in ('PENDING','PUBLISHING')`);
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


export function isMissingRelationError(e, relation) {
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
    return { inserted: false, reason: 'missing_fields', ledger: 'unavailable' };
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
      return { inserted: false, reason: 'missing_table', ledger: 'missing_table' };
    }
    throw e;
  }
}


export async function getPaymentById(paymentId) {
  const r = await pool.query(`select * from payments where id=$1`, [Number(paymentId)]);
  return r.rows[0] || null;
}

export async function getPaymentByTelegramChargeId(telegramPaymentChargeId) {
  const cid = String(telegramPaymentChargeId || '').trim();
  if (!cid) return null;
  const r = await pool.query(`select * from payments where telegram_payment_charge_id=$1 limit 1`, [cid]);
  return r.rows[0] || null;
}

/**
 * Claim a payment for fulfillment to prevent duplicate apply on Telegram retries.
 * Returns the updated row if claimed; null if already APPLIED or currently APPLYING.
 *
 * Safety: allow re-claiming a stale APPLYING payment after a long timeout (serverless crash).
 */
export async function claimPaymentApplying(paymentId, applyingByUserId) {
  const pid = Number(paymentId);
  const uid = Number(applyingByUserId || 0) || null;
  if (!pid) return null;

  const r = await pool.query(
    `update payments
        set status='APPLYING',
            applying_by_user_id=$2,
            applying_at=now(),
            updated_at=now()
      where id=$1
        and status <> 'APPLIED'
        and (
              status in ('RECEIVED','ORPHANED','ERROR')
           or (status='APPLYING' and applying_at is not null and applying_at < now() - interval '20 minutes')
        )
      returning *`,
    [pid, uid]
  );

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

export async function setPaymentStatusIfNotApplied(paymentId, status, note = null) {
  const st = String(status || 'ORPHANED').toUpperCase();
  const r = await pool.query(
    `update payments
        set status=$2,
            note=$3,
            updated_at=now()
      where id=$1
        and status <> 'APPLIED'
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

// END MOVED QUERY BODY: monetizationRepository
