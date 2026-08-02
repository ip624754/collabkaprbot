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

import { drawAndFinalizeGiveawayWinnersAtomic } from './broadcastsRepository.js';

// BEGIN MOVED QUERY BODY: giveawaysRepository
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

const GIVEAWAY_PATCH_FIELDS = new Set([
  'prize_value_text',
  'winners_count',
  'ends_at',
  'status',
  'published_chat_id',
  'published_message_id',
]);

export async function updateGiveaway(giveawayId, patch) {
  const built = buildAllowedPatch(patch, GIVEAWAY_PATCH_FIELDS, {
    label: 'giveaway_patch',
  });
  if (!built.keys.length) return false;
  const result = await pool.query(
    `update giveaways
        set ${built.sets.join(', ')}, updated_at=now()
      where id=$1
      returning id`,
    [Number(giveawayId), ...built.values]
  );
  requireExactlyOneAffectedRow(result, 'giveaway_update');
  return true;
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
export async function replaceGiveawaySponsors(giveawayId, sponsorTexts, opts = {}) {
  return replaceGiveawaySponsorsAtomicCore({
    pool,
    giveawayId,
    sponsorTexts,
    statementTimeoutMs: getHeavyTxStatementTimeoutMs(opts),
  });
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
// Deprecated maintenance helper. Runtime draw paths MUST use
// drawAndFinalizeGiveawayWinnersAtomic(), which owns winner selection, status and audit.
export async function setWinners(giveawayId, winners, opts = {}) {
  const gid = Number(giveawayId);
  const normalized = Array.isArray(winners)
    ? winners
        .map((w) => ({
          userId: Number(w?.user_id ?? w?.userId),
          place: Number(w?.place),
        }))
        .filter((w) => Number.isFinite(w.userId) && Number.isFinite(w.place) && w.place > 0)
        .sort((a, b) => a.place - b.place)
    : [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stm = getHeavyTxStatementTimeoutMs(opts);
    if (stm) await txSetLocalStatementTimeout(client, stm);
    await client.query('SELECT id FROM giveaways WHERE id=$1 FOR UPDATE', [gid]);
    await client.query('DELETE FROM giveaway_winners WHERE giveaway_id=$1', [gid]);
    if (normalized.length) {
      await client.query(
        `INSERT INTO giveaway_winners (giveaway_id, user_id, place)
         SELECT $1, row_data.user_id, row_data.place
         FROM jsonb_to_recordset($2::jsonb) AS row_data(user_id bigint, place int)
         ORDER BY row_data.place`,
        [gid, JSON.stringify(normalized.map((w) => ({ user_id: w.userId, place: w.place })))]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
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
       and (results_message_id is null or results_message_id = 0)
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

// END MOVED QUERY BODY: giveawaysRepository
