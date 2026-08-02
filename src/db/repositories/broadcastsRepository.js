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

import { listUsersDirectory } from './usersRepository.js';

// BEGIN MOVED QUERY BODY: broadcastsRepository
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

/**
 * Create broadcast with best-effort idempotency for the admin "confirm" click.
 *
 * Why:
 * - When Redis is degraded, double-click on "confirm" could create 2 broadcasts.
 * - We avoid schema changes by doing a short-window DB dedup guarded by a PG advisory xact lock.
 *
 * Properties:
 * - No waiting queue in Neon: uses pg_try_advisory_xact_lock (fail-fast).
 * - Dedup window is intentionally short (default 45s) to avoid blocking legitimate repeated sends.
 */
export async function createBroadcastIdempotent(
  { createdByUserId, audience, draftType, draftText, draftFileId, draftCaption, buttonsJson, totalCount },
  opts = {}
) {
  const uid = Number(createdByUserId || 0);
  if (!uid) return { ok: false, error: 'bad_args' };

  const winSec = Math.max(10, Math.min(300, Math.floor(Number(opts?.dedupWindowSec || 45))));
  const total = Math.max(0, Math.floor(Number(totalCount || 0)));

  const client = await pool.connect();
  try {
    await client.query('begin');

    const stm = Math.floor(Number(opts?.statementTimeoutMs || 0));
    if (Number.isFinite(stm) && stm > 0) {
      await txSetLocalStatementTimeout(client, stm);
    }

    // Per-admin confirm guard. Prevents click-storm even when Redis is down.
    const lockRes = await client.query(
      `select pg_try_advisory_xact_lock(hashtext($1)) as ok`,
      [`bc_confirm:${uid}`]
    );
    if (!lockRes.rows?.[0]?.ok) {
      await client.query('rollback');
      return { ok: false, error: 'busy' };
    }

    // Short-window dedup: if an identical PENDING broadcast was just created, reuse it.
    const dedupRes = await client.query(
      `select *
         from broadcasts
        where created_by_user_id = $1
          and status = 'PENDING'
          and created_at > now() - ($8::text || ' seconds')::interval
          and audience = $2
          and draft_type is not distinct from $3
          and draft_text is not distinct from $4
          and draft_file_id is not distinct from $5
          and draft_caption is not distinct from $6
          and buttons_json is not distinct from $7
          and total_count = $9
        order by id desc
        limit 1`,
      [
        uid,
        String(audience || 'all'),
        draftType || null,
        draftText || null,
        draftFileId || null,
        draftCaption || null,
        buttonsJson || null,
        String(winSec),
        total,
      ]
    );
    if (dedupRes.rows?.[0]) {
      await client.query('commit');
      return { ok: true, deduped: true, broadcast: dedupRes.rows[0] };
    }

    const ins = await client.query(
      `insert into broadcasts (created_by_user_id, status, audience, draft_type, draft_text, draft_file_id, draft_caption, buttons_json, total_count)
       values ($1, 'PENDING', $2, $3, $4, $5, $6, $7, $8)
       returning *`,
      [
        uid,
        String(audience || 'all'),
        draftType || null,
        draftText || null,
        draftFileId || null,
        draftCaption || null,
        buttonsJson || null,
        total,
      ]
    );

    await client.query('commit');
    return { ok: true, deduped: false, broadcast: ins.rows?.[0] || null };
  } catch (e) {
    try { await client.query('rollback'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export async function getBroadcast(id) {
  const r = await pool.query(`select * from broadcasts where id = $1`, [Number(id)]);
  return r.rows[0] || null;
}

const BROADCAST_PATCH_FIELDS = new Set([
  'status',
  'finished_at',
  'last_sent_user_id',
  'sent_count',
  'failed_count',
  'audience',
  'draft_type',
  'draft_text',
  'draft_file_id',
  'draft_caption',
  'buttons_json',
  'total_count',
]);

export async function updateBroadcast(id, fields = {}) {
  const built = buildAllowedPatch(fields, BROADCAST_PATCH_FIELDS, {
    label: 'broadcast_patch',
  });
  if (!built.keys.length) return false;
  const result = await pool.query(
    `update broadcasts
        set ${built.sets.join(', ')}, updated_at=now()
      where id=$1
      returning id`,
    [Number(id), ...built.values]
  );
  requireExactlyOneAffectedRow(result, 'broadcast_update');
  return true;
}

/**
 * DB fuse for Telegram 429 cooldown when Redis is unavailable.
 * Stores a per-broadcast cooldown window in Neon (best-effort).
 *
 * Important:
 * - Uses GREATEST to avoid shortening an existing cooldown.
 * - This is invoked only on Redis failures in cron (not on hot UI paths).
 */
export async function atomicMaxBroadcastCooldownUntil(id, cooldownUntilIso, reason = 'telegram_429') {
  const r = await pool.query(
    `update broadcasts
       set cooldown_until = greatest(coalesce(cooldown_until, 'epoch'::timestamptz), $2::timestamptz),
           cooldown_reason = $3,
           updated_at = now()
     where id = $1
     returning cooldown_until`,
    [Number(id), String(cooldownUntilIso), String(reason || 'telegram_429')]
  );
  return r.rows[0]?.cooldown_until || null;
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


/**
 * Return a small dry-run sample of recipients for the current broadcast scope.
 * Used only for operator recap / preview surfaces.
 */
export async function listBroadcastAudienceSample(audience = 'all', limit = 3) {
  const filter = String(audience || 'all').toLowerCase();
  const where = ['u.tg_id is not null'];
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
    `select u.id as user_id, u.tg_id, u.tg_username
       from users u
      where ${where.join(' and ')}
      order by u.id
      limit $1`,
    [Math.max(1, Math.min(5, Number(limit) || 3))]
  );
  return (r.rows || []).map((x) => ({
    user_id: Number(x.user_id || 0),
    tg_id: Number(x.tg_id || 0),
    tg_username: x.tg_username ? String(x.tg_username) : null,
  }));
}
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
  const normalizedStatus = String(status || 'sent').toLowerCase() === 'sent' ? 'sent' : 'failed';
  const r = await pool.query(
    `insert into broadcast_sent_log (broadcast_id, user_id, status, retry_after_until, non_retryable)
     values ($1, $2, $3, null, true)
     on conflict (broadcast_id, user_id)
     do update set
       status = excluded.status,
       retry_after_until = null,
       non_retryable = true,
       last_error = null,
       sent_at = now(),
       resolved_at = null,
       resolved_by_tg_id = null,
       resolution_note = null
     where broadcast_sent_log.status not in ('sent','delivery_unknown')
     returning *`,
    [Number(broadcastId), Number(userId), normalizedStatus]
  );
  return r.rows[0] || null;
}

// QStash fan-out: mark recipient queued (idempotent, does NOT increment attempts).
// Terminal and in-flight states are never moved backwards to queued.
export async function logBroadcastQueued(broadcastId, userId) {
  const r = await pool.query(
    `insert into broadcast_sent_log (broadcast_id, user_id, status, retry_after_until, non_retryable)
     values ($1, $2, 'queued', null, false)
     on conflict (broadcast_id, user_id)
     do update set
       status = 'queued',
       retry_after_until = null,
       non_retryable = false,
       last_error = null,
       sent_at = now()
     where broadcast_sent_log.status in ('queued','retry','deferred','quarantined')
     returning *`,
    [Number(broadcastId), Number(userId)]
  );
  return r.rows[0] || null;
}

// QStash fan-out: mark recipient blocked before an external send attempt.
// Existing sent/unknown/in-flight receipts are not overwritten.
export async function logBroadcastBlocked(broadcastId, userId, errorText = '') {
  const r = await pool.query(
    `insert into broadcast_sent_log (broadcast_id, user_id, status, retry_after_until, non_retryable, last_error)
     values ($1, $2, 'blocked', null, true, $3)
     on conflict (broadcast_id, user_id)
     do update set
       status = 'blocked',
       retry_after_until = null,
       non_retryable = true,
       last_error = excluded.last_error,
       sent_at = now()
     where broadcast_sent_log.status in ('queued','retry','deferred','quarantined','blocked','failed')
     returning *`,
    [Number(broadcastId), Number(userId), String(errorText || '').slice(0, 500)]
  );
  return r.rows[0] || null;
}

// Convert stale in-flight rows into a terminal operator-review state.
// They are deliberately NOT reclaimed for automatic sending: a process may have
// reached Telegram and died before persisting the receipt.
export async function quarantineStaleBroadcastDeliveries(broadcastId, staleSendingSec = 60) {
  const stale = Math.max(10, Math.min(3600, Number(staleSendingSec || 0) || 0));
  const r = await pool.query(
    `update broadcast_sent_log
        set status = 'delivery_unknown',
            retry_after_until = null,
            non_retryable = true,
            delivery_unknown_at = coalesce(delivery_unknown_at, now()),
            last_error = coalesce(nullif(last_error, ''), 'stale_sending_outcome_unknown')
      where broadcast_id = $1
        and status = 'sending'
        and last_attempt_at is not null
        and last_attempt_at < now() - ($2 || ' seconds')::interval
      returning broadcast_id, user_id, delivery_attempt_id`,
    [Number(broadcastId), String(stale)]
  );
  return r.rows || [];
}

// Atomically claim a delivery. Stale `sending` is first quarantined as unknown;
// it is never automatically reclaimed.
export async function claimBroadcastDelivery(broadcastId, userId, staleSendingSec = 60) {
  const stale = Math.max(10, Math.min(3600, Number(staleSendingSec || 0) || 0));
  const r = await pool.query(
    `with ins as (
       insert into broadcast_sent_log (broadcast_id, user_id, status, retry_after_until, non_retryable)
       values ($1, $2, 'queued', null, false)
       on conflict do nothing
     ),
     quarantine_stale as (
       update broadcast_sent_log
          set status = 'delivery_unknown',
              retry_after_until = null,
              non_retryable = true,
              delivery_unknown_at = coalesce(delivery_unknown_at, now()),
              last_error = coalesce(nullif(last_error, ''), 'stale_sending_outcome_unknown')
        where broadcast_id = $1
          and user_id = $2
          and status = 'sending'
          and last_attempt_at is not null
          and last_attempt_at < now() - ($3 || ' seconds')::interval
        returning 1
     ),
     claim as (
       update broadcast_sent_log
          set status = 'sending',
              attempts = attempts + 1,
              last_attempt_at = now(),
              delivery_attempt_id = gen_random_uuid(),
              delivery_unknown_at = null,
              telegram_message_ids = '[]'::jsonb,
              resolved_at = null,
              resolved_by_tg_id = null,
              resolution_note = null,
              last_error = null
        where broadcast_id = $1
          and user_id = $2
          and non_retryable = false
          and status in ('queued','retry','deferred','quarantined')
          and (retry_after_until is null or retry_after_until <= now())
        returning *
     )
     select * from claim`,
    [Number(broadcastId), Number(userId), String(stale)]
  );
  return r.rows[0] || null;
}

function normalizeDeliveryAttemptId(value) {
  const id = String(value || '').trim();
  return id || null;
}

export async function getBroadcastDeliveryReceipt(broadcastId, userId, deliveryAttemptId) {
  const attemptId = normalizeDeliveryAttemptId(deliveryAttemptId);
  if (!attemptId) return null;
  const r = await pool.query(
    `select *
       from broadcast_sent_log
      where broadcast_id = $1
        and user_id = $2
        and delivery_attempt_id = $3::uuid
      limit 1`,
    [Number(broadcastId), Number(userId), attemptId]
  );
  return r.rows[0] || null;
}

export async function markBroadcastDeliverySent(broadcastId, userId, deliveryAttemptId, telegramMessageIds = []) {
  const attemptId = normalizeDeliveryAttemptId(deliveryAttemptId);
  if (!attemptId) return null;
  const ids = Array.isArray(telegramMessageIds)
    ? telegramMessageIds.map((x) => Number(x)).filter((x) => Number.isSafeInteger(x) && x > 0).slice(0, 20)
    : [];
  const r = await pool.query(
    `update broadcast_sent_log
        set status = 'sent',
            retry_after_until = null,
            non_retryable = true,
            last_error = null,
            sent_at = now(),
            telegram_message_ids = $4::jsonb,
            delivery_unknown_at = null,
            resolved_at = null,
            resolved_by_tg_id = null,
            resolution_note = null
      where broadcast_id = $1
        and user_id = $2
        and delivery_attempt_id = $3::uuid
        and status in ('sending','delivery_unknown')
      returning *`,
    [Number(broadcastId), Number(userId), attemptId, JSON.stringify(ids)]
  );
  return r.rows[0] || null;
}

export async function markBroadcastDeliveryUnknown(
  broadcastId,
  userId,
  deliveryAttemptId,
  errorText = '',
  telegramMessageIds = []
) {
  const attemptId = normalizeDeliveryAttemptId(deliveryAttemptId);
  if (!attemptId) return null;
  const ids = Array.isArray(telegramMessageIds)
    ? telegramMessageIds.map((x) => Number(x)).filter((x) => Number.isSafeInteger(x) && x > 0).slice(0, 20)
    : [];
  const r = await pool.query(
    `update broadcast_sent_log
        set status = 'delivery_unknown',
            retry_after_until = null,
            non_retryable = true,
            last_error = $4,
            delivery_unknown_at = coalesce(delivery_unknown_at, now()),
            telegram_message_ids = case
              when jsonb_array_length($5::jsonb) > 0 then $5::jsonb
              else telegram_message_ids
            end,
            sent_at = now()
      where broadcast_id = $1
        and user_id = $2
        and delivery_attempt_id = $3::uuid
        and status in ('sending','delivery_unknown')
      returning *`,
    [
      Number(broadcastId),
      Number(userId),
      attemptId,
      String(errorText || 'delivery_outcome_unknown').slice(0, 500),
      JSON.stringify(ids),
    ]
  );
  return r.rows[0] || null;
}

export async function markBroadcastDeliveryBlocked(broadcastId, userId, errorText = '', deliveryAttemptId = null) {
  const attemptId = normalizeDeliveryAttemptId(deliveryAttemptId);
  const r = await pool.query(
    `update broadcast_sent_log
        set status = 'blocked',
            retry_after_until = null,
            non_retryable = true,
            last_error = $3,
            sent_at = now()
      where broadcast_id = $1
        and user_id = $2
        and (
          ($4::uuid is not null and delivery_attempt_id = $4::uuid and status = 'sending')
          or ($4::uuid is null and status in ('queued','retry','deferred','quarantined','blocked','failed'))
        )
      returning *`,
    [Number(broadcastId), Number(userId), String(errorText || '').slice(0, 500), attemptId]
  );
  return r.rows[0] || null;
}

export async function markBroadcastDeliveryFailedNonRetryable(broadcastId, userId, errorText = '', deliveryAttemptId = null) {
  const attemptId = normalizeDeliveryAttemptId(deliveryAttemptId);
  const r = await pool.query(
    `update broadcast_sent_log
        set status = 'failed',
            retry_after_until = null,
            non_retryable = true,
            last_error = $3,
            sent_at = now()
      where broadcast_id = $1
        and user_id = $2
        and (
          ($4::uuid is not null and delivery_attempt_id = $4::uuid and status = 'sending')
          or ($4::uuid is null and status in ('queued','retry','deferred','quarantined','failed'))
        )
      returning *`,
    [Number(broadcastId), Number(userId), String(errorText || '').slice(0, 500), attemptId]
  );
  return r.rows[0] || null;
}

export async function markBroadcastDeliveryRetry(
  broadcastId,
  userId,
  retryAfterSec,
  errorText = '',
  deliveryAttemptId = null
) {
  const sec = Math.max(1, Math.min(24 * 3600, Number(retryAfterSec || 0) || 0));
  const attemptId = normalizeDeliveryAttemptId(deliveryAttemptId);
  const r = await pool.query(
    `update broadcast_sent_log
        set status = 'retry',
            retry_after_until = now() + ($3 || ' seconds')::interval,
            non_retryable = false,
            last_error = $4,
            sent_at = now()
      where broadcast_id = $1
        and user_id = $2
        and (
          ($5::uuid is not null and delivery_attempt_id = $5::uuid and status = 'sending')
          or ($5::uuid is null and status in ('queued','retry','deferred','quarantined'))
        )
      returning *`,
    [Number(broadcastId), Number(userId), String(sec), String(errorText || '').slice(0, 500), attemptId]
  );
  return r.rows[0] || null;
}

export async function markBroadcastDeliveryDeferred(
  broadcastId,
  userId,
  retryAfterSec,
  deliveryAttemptId,
  errorText = 'telegram_429'
) {
  const sec = Math.max(1, Math.min(3600, Number(retryAfterSec || 0) || 0));
  const attemptId = normalizeDeliveryAttemptId(deliveryAttemptId);
  if (!attemptId) return null;
  const r = await pool.query(
    `update broadcast_sent_log
        set status = 'deferred',
            retry_after_until = now() + ($3 || ' seconds')::interval,
            non_retryable = false,
            last_error = $5,
            sent_at = now()
      where broadcast_id = $1
        and user_id = $2
        and delivery_attempt_id = $4::uuid
        and status = 'sending'
      returning *`,
    [Number(broadcastId), Number(userId), String(sec), attemptId, String(errorText || '').slice(0, 500)]
  );
  return r.rows[0] || null;
}

export async function countBroadcastPendingDeliveries(broadcastId) {
  const r = await pool.query(
    `select count(*)::int as n
       from broadcast_sent_log
      where broadcast_id = $1
        and status in ('queued','sending','retry','deferred','quarantined')`,
    [Number(broadcastId)]
  );
  return Number(r.rows[0]?.n || 0) || 0;
}

export async function countBroadcastDeliveryStats(broadcastId) {
  const r = await pool.query(
    `select
        count(*) filter (where status = 'sent')::int as sent,
        count(*) filter (where status = 'failed')::int as failed,
        count(*) filter (where status = 'blocked')::int as blocked,
        count(*) filter (where status = 'delivery_unknown')::int as delivery_unknown,
        count(*) filter (where status = 'blocked' and last_error like 'hard_skip:%')::int as hard_skipped,
        count(*) filter (where status = 'retry')::int as retry,
        count(*) filter (where status = 'deferred')::int as deferred,
        count(*) filter (where status = 'quarantined')::int as quarantined,
        count(*) filter (where status = 'queued')::int as queued,
        count(*) filter (where status = 'sending')::int as sending,
        count(*) filter (where status in ('queued','sending','retry','deferred','quarantined'))::int as pending
     from broadcast_sent_log
     where broadcast_id = $1`,
    [Number(broadcastId)]
  );
  const row = r.rows[0] || {};
  return {
    sent: Number(row.sent || 0) || 0,
    failed: Number(row.failed || 0) || 0,
    blocked: Number(row.blocked || 0) || 0,
    delivery_unknown: Number(row.delivery_unknown || 0) || 0,
    hard_skipped: Number(row.hard_skipped || 0) || 0,
    retry: Number(row.retry || 0) || 0,
    deferred: Number(row.deferred || 0) || 0,
    quarantined: Number(row.quarantined || 0) || 0,
    queued: Number(row.queued || 0) || 0,
    sending: Number(row.sending || 0) || 0,
    pending: Number(row.pending || 0) || 0,
  };
}

export async function listBroadcastPostRunReasonRows(broadcastId, limit = 50) {
  const lim = Math.max(1, Math.min(100, Number(limit) || 50));
  const r = await pool.query(
    `select status, coalesce(last_error, '') as last_error, count(*)::int as n
       from broadcast_sent_log
      where broadcast_id = $1
        and status in ('failed','blocked','retry','deferred','quarantined','delivery_unknown')
      group by status, coalesce(last_error, '')
      order by count(*) desc, status asc
      limit $2`,
    [Number(broadcastId), lim]
  );
  return r.rows || [];
}

export async function listBroadcastBlockedDeliveries(broadcastId, limit = 20, offset = 0, kind = 'all') {
  const lim = Math.max(1, Math.min(50, Number(limit) || 20));
  const off = Math.max(0, Number(offset) || 0);
  const knd = String(kind || 'all').toLowerCase();
  const where = ["sl.broadcast_id = $1", "sl.status = 'blocked'"];
  if (knd === 'hard') where.push(`sl.last_error like 'hard_skip:%'`);
  const r = await pool.query(
    `select sl.user_id, u.tg_id, sl.last_error, sl.sent_at
       from broadcast_sent_log sl
       join users u on u.id = sl.user_id
      where ${where.join(' and ')}
      order by sl.sent_at desc nulls last, sl.user_id desc
      limit $2 offset $3`,
    [Number(broadcastId), lim, off]
  );
  return r.rows || [];
}

export async function listBroadcastUnknownDeliveries(limit = 50, broadcastId = null) {
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  const bid = Number(broadcastId || 0) || 0;
  const r = await pool.query(
    `select
        sl.broadcast_id,
        sl.user_id,
        u.tg_id,
        u.tg_username,
        sl.attempts,
        sl.last_attempt_at,
        sl.delivery_unknown_at,
        sl.last_error,
        sl.telegram_message_ids,
        sl.delivery_attempt_id
       from broadcast_sent_log sl
       join users u on u.id = sl.user_id
      where sl.status = 'delivery_unknown'
        and ($1::bigint = 0 or sl.broadcast_id = $1)
      order by sl.delivery_unknown_at desc nulls last, sl.broadcast_id desc, sl.user_id desc
      limit $2`,
    [bid, lim]
  );
  return r.rows || [];
}

export async function resolveBroadcastUnknownDelivery({
  broadcastId,
  userId,
  resolution,
  actorTgId,
  note = '',
}) {
  const bid = Number(broadcastId || 0) || 0;
  const uid = Number(userId || 0) || 0;
  const actor = Number(actorTgId || 0) || 0;
  const outcome = String(resolution || '').trim().toLowerCase();
  if (!bid || !uid || !actor) return null;
  if (!['sent','failed'].includes(outcome)) return null;
  const r = await pool.query(
    `update broadcast_sent_log
        set status = $3,
            non_retryable = true,
            retry_after_until = null,
            resolved_at = now(),
            resolved_by_tg_id = $4,
            resolution_note = $5,
            sent_at = case when $3 = 'sent' then now() else sent_at end,
            last_error = case when $3 = 'failed' then coalesce(nullif($5, ''), last_error) else last_error end
      where broadcast_id = $1
        and user_id = $2
        and status = 'delivery_unknown'
      returning *`,
    [bid, uid, outcome, actor, String(note || '').slice(0, 500)]
  );
  return r.rows[0] || null;
}

// Broadcast per-recipient 429 deferral before the send state machine is claimed.
// Runtime send paths should use markBroadcastDeliveryDeferred with an attempt id.
export async function logBroadcastDeferred(broadcastId, userId, retryAfterSec) {
  const sec = Math.max(1, Math.min(3600, Number(retryAfterSec || 0) || 0));
  const r = await pool.query(
    `insert into broadcast_sent_log (broadcast_id, user_id, status, retry_after_until)
     values ($1, $2, 'deferred', now() + ($3 || ' seconds')::interval)
     on conflict (broadcast_id, user_id)
     do update set
       status = 'deferred',
       retry_after_until = now() + ($3 || ' seconds')::interval,
       non_retryable = false,
       last_error = null,
       sent_at = now()
     where broadcast_sent_log.status in ('queued','retry','deferred','quarantined')
     returning *`,
    [Number(broadcastId), Number(userId), String(sec)]
  );
  return r.rows[0] || null;
}

// Broadcast quarantine for recipients that keep hitting 429 repeatedly.
export async function logBroadcastQuarantine(broadcastId, userId, quarantineSec) {
  const sec = Math.max(60, Math.min(86400, Number(quarantineSec || 0) || 0));
  const r = await pool.query(
    `insert into broadcast_sent_log (broadcast_id, user_id, status, retry_after_until)
     values ($1, $2, 'quarantined', now() + ($3 || ' seconds')::interval)
     on conflict (broadcast_id, user_id)
     do update set
       status = 'quarantined',
       retry_after_until = greatest(
         coalesce(broadcast_sent_log.retry_after_until, now()),
         now() + ($3 || ' seconds')::interval
       ),
       non_retryable = false,
       last_error = null,
       sent_at = now()
     where broadcast_sent_log.status in ('deferred','quarantined')
     returning *`,
    [Number(broadcastId), Number(userId), String(sec)]
  );
  return r.rows[0] || null;
}

export async function getNextBroadcastDeferredRetryMs(broadcastId) {
  const r = await pool.query(
    `select extract(epoch from min(retry_after_until)) * 1000 as ms
     from broadcast_sent_log
     where broadcast_id = $1
       and status in ('deferred','quarantined')
       and retry_after_until is not null
       and retry_after_until > now()`,
    [Number(broadcastId)]
  );
  const ms = Number(r.rows[0]?.ms || 0);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
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
  const where = [
    'u.id > $1',
    'not exists (select 1 from broadcast_sent_log sl where sl.broadcast_id = $3 and sl.user_id = u.id)'
  ];
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
  // 1) Fresh recipients (forward-only cursor, excludes any status in broadcast_sent_log).
  const fresh = await pool.query(
    `select u.id as user_id, u.tg_id
     from users u
     where ${where.join(' and ')}
     order by u.id
     limit $2`,
    [Number(lastUserId), Number(batchSize), Number(broadcastId)]
  );

  const rows = fresh.rows || [];
  if (rows.length >= Number(batchSize)) return rows;

  // 2) If we have remaining capacity, also process due deferred recipients (retry_after has elapsed).
  // Important: deferred recipients can have user_id <= lastUserId, so caller must treat cursor as monotonic (max).
  const remaining = Math.max(0, Number(batchSize) - rows.length);
  if (!remaining) return rows;

  const deferred = await pool.query(
    `select sl.user_id, u.tg_id
     from broadcast_sent_log sl
     join users u on u.id = sl.user_id
     where sl.broadcast_id = $1
       and sl.status in ('deferred','quarantined')
       and sl.retry_after_until is not null
       and sl.retry_after_until <= now()
     order by sl.user_id
     limit $2`,
    [Number(broadcastId), Number(remaining)]
  );

  return rows.concat(deferred.rows || []);
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

  const txIsolation = 'repeatable_read';
  let snapshotTs = null;
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
  workspaceOrOptions = {},
  legacyWinnersCount = null,
  legacyEndsAtIso = null,
  legacyOptions = {}
) {
  // Backward-compatible argument normalization for rolling deploys. New callers must
  // pass the object form; locked DB row remains the canonical source for count/seed.
  const objectForm = workspaceOrOptions && typeof workspaceOrOptions === 'object' && !Array.isArray(workspaceOrOptions);
  const opts = objectForm
    ? workspaceOrOptions
    : {
        ...legacyOptions,
        expectedWorkspaceId: Number(workspaceOrOptions) || null,
        legacyWinnersCount,
        legacyEndsAtIso,
      };

  return drawAndFinalizeGiveawayWinnersAtomicCore({
    pool,
    giveawayId,
    expectedWorkspaceId: opts.expectedWorkspaceId ?? opts.workspaceId ?? null,
    actorUserId: opts.actorUserId ?? null,
    source: opts.source ?? 'unknown',
    statementTimeoutMs: getHeavyTxStatementTimeoutMs(opts),
  });
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

// =====================================================
// Atomic cron guards (prevent double-processing on lock expiry)
// =====================================================

/**
 * Atomically transition a giveaway to ENDED only if it's still in an endable status.
 * Returns true if the row was updated; false means another tick already ended it.
 */
export async function atomicEndGiveaway(giveawayId) {
  const r = await pool.query(
    `UPDATE giveaways
     SET status = 'ENDED', updated_at = now()
     WHERE id = $1 AND status IN ('ACTIVE','PAUSED','PUBLISHED','RUNNING')
     RETURNING id`,
    [Number(giveawayId)]
  );
  return r.rowCount > 0;
}

/**
 * Atomically claim a giveaway for results publishing.
 * Sets status + results_message_id only if still WINNERS_DRAWN with no results yet.
 * Returns true if claimed; false means another tick already published.
 */


/**
 * Atomically claim a giveaway for results publishing (reserve-before-send).
 * We mark the row as "claimed" by setting results_message_id=0 while still WINNERS_DRAWN.
 * This prevents repeated sends if the function dies after TG-send but before DB finalize.
 */
export async function atomicClaimGiveawayResultsPublishing(giveawayId) {
  const r = await pool.query(
    `UPDATE giveaways
     SET results_message_id = 0,
         updated_at = now()
     WHERE id = $1
       AND status = 'WINNERS_DRAWN'
       AND results_message_id IS NULL
     RETURNING id`,
    [Number(giveawayId)]
  );
  return r.rowCount > 0;
}

/**
 * Release a claim (allow retry) if publish attempt failed before a message was produced.
 */
export async function atomicReleaseGiveawayResultsClaim(giveawayId) {
  const r = await pool.query(
    `UPDATE giveaways
     SET results_message_id = NULL,
         updated_at = now()
     WHERE id = $1
       AND status = 'WINNERS_DRAWN'
       AND results_message_id = 0
     RETURNING id`,
    [Number(giveawayId)]
  );
  return r.rowCount > 0;
}

/**
 * Finalize results publishing from a claimed state (results_message_id=0).
 * Sets status + message id only if still WINNERS_DRAWN and claim is held.
 */
export async function atomicFinalizeGiveawayResultsPublish(giveawayId, messageId) {
  const r = await pool.query(
    `UPDATE giveaways
     SET status = 'RESULTS_PUBLISHED',
         results_message_id = $2,
         results_published_at = now(),
         updated_at = now()
     WHERE id = $1
       AND status = 'WINNERS_DRAWN'
       AND results_message_id = 0
     RETURNING id`,
    [Number(giveawayId), Number(messageId)]
  );
  return r.rowCount > 0;
}

export async function atomicPublishGiveawayResults(giveawayId, messageId) {
  const r = await pool.query(
    `UPDATE giveaways
     SET status = 'RESULTS_PUBLISHED',
         results_message_id = $2,
         results_published_at = now(),
         updated_at = now()
     WHERE id = $1
       AND status = 'WINNERS_DRAWN'
       AND results_message_id IS NULL
     RETURNING id`,
    [Number(giveawayId), messageId]
  );
  return r.rowCount > 0;
}

/**
 * Atomically transition a broadcast status (e.g. PENDING→RUNNING, RUNNING→DONE).
 * Returns true if the row was updated; false means status already changed.
 */
const BROADCAST_TRANSITION_PATCH_FIELDS = new Set([
  'started_at',
  'finished_at',
  'sent_count',
  'failed_count',
]);

export async function atomicTransitionBroadcast(id, fromStatus, toStatus, extraFields = {}) {
  const built = buildAllowedPatch(extraFields, BROADCAST_TRANSITION_PATCH_FIELDS, {
    label: 'broadcast_transition_patch',
    parameterOffset: 3,
  });
  const sets = ['status = $2', 'updated_at = now()', ...built.sets];
  const params = [Number(id), toStatus, ...built.values, fromStatus];
  const fromStatusParam = params.length;
  const r = await pool.query(
    `UPDATE broadcasts SET ${sets.join(', ')} WHERE id = $1 AND status = $${fromStatusParam} RETURNING id`,
    params
  );
  return r.rowCount > 0;
}



// END MOVED QUERY BODY: broadcastsRepository
