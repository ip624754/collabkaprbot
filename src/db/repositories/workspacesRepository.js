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


// BEGIN MOVED QUERY BODY: workspacesRepository
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
            coalesce(s.channel_connected, true) as channel_connected,
            s.channel_disconnected_at,
            s.plan, s.pro_until, s.pro_pinned_offer_id,
            s.profile_title, s.profile_niche, s.profile_contact, s.profile_geo,
            s.profile_contacts, s.profile_contacts_v,
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
            coalesce(s.channel_connected, true) as channel_connected,
            s.channel_disconnected_at,
            s.plan, s.pro_until, s.pro_pinned_offer_id,
            s.profile_title, s.profile_niche, s.profile_contact, s.profile_geo,
            s.profile_contacts, s.profile_contacts_v,
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
            coalesce(s.channel_connected, true) as channel_connected,
            s.channel_disconnected_at,
            s.plan, s.pro_until, s.pro_pinned_offer_id,
            s.profile_title, s.profile_niche, s.profile_contact, s.profile_geo,
            s.profile_contacts, s.profile_contacts_v,
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
            coalesce(s.channel_connected, true) as channel_connected,
            s.channel_disconnected_at,
            s.plan, s.pro_until, s.pro_pinned_offer_id,
            s.profile_title, s.profile_niche, s.profile_contact, s.profile_geo,
            s.profile_contacts, s.profile_contacts_v,
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
const WORKSPACE_SETTING_PATCH_FIELDS = new Set([
  'profile_title',
  'profile_niche',
  'profile_contact',
  'profile_geo',
  'profile_ig',
  'profile_about',
  'profile_portfolio_urls',
  'profile_contacts',
  'profile_contacts_v',
  'profile_mode',
  'profile_verticals',
  'profile_formats',
  'network_enabled',
  'curator_enabled',
]);

export async function setWorkspaceSetting(workspaceId, patch) {
  const built = buildAllowedPatch(patch, WORKSPACE_SETTING_PATCH_FIELDS, {
    label: 'workspace_setting_patch',
  });
  if (!built.keys.length) return false;
  const result = await pool.query(
    `update workspace_settings
        set ${built.sets.join(', ')}, updated_at=now()
      where workspace_id=$1
      returning workspace_id`,
    [Number(workspaceId), ...built.values]
  );
  requireExactlyOneAffectedRow(result, 'workspace_setting_update');
  return true;
}


export async function setWorkspaceChannelConnection(workspaceId, connected) {
  const wsId = Number(workspaceId || 0);
  if (!wsId) return;
  await ensureWorkspaceSettings(wsId);
  if (connected) {
    await pool.query(
      `update workspace_settings
          set channel_connected=true,
              channel_disconnected_at=null,
              updated_at=now()
        where workspace_id=$1`,
      [wsId]
    );
    return;
  }
  await pool.query(
    `update workspace_settings
        set channel_connected=false,
            channel_disconnected_at=now(),
            network_enabled=false,
            curator_enabled=false,
            updated_at=now()
      where workspace_id=$1`,
    [wsId]
  );
}

// IG verification: list workspaces with pending comment-code (DB truth; Redis is only an accelerator).
export async function listIgVerifyPendingWorkspaces(limit = 200) {
  const lim = Math.max(1, Math.min(Number(limit || 0) || 200, 1000));
  const r = await pool.query(
    `select ws.id as workspace_id, ws.owner_user_id,
            s.profile_contacts
     from workspaces ws
     join workspace_settings s on s.workspace_id = ws.id
     where (s.profile_contacts->'ig'->'pending'->>'code') is not null
       and coalesce((s.profile_contacts->'ig'->>'verified')::boolean, false) = false
       and (s.profile_contacts->'ig'->'pending'->>'expires_at')::timestamptz > now()
     order by ws.id asc
     limit $1`,
    [lim]
  );
  return r.rows || [];
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

    await Promise.all([
      incrWithExpireOnFirst(totalKey, ttlSec),
      incrWithExpireOnFirst(pKey, ttlSec),
    ]);
  } catch {
    // metrics must never break bot UX
  }
}


function auditBufferListKey() {
  return rk(['audit', 'buffer', 'ws']);
}

function auditBufferInflightKey() {
  return rk(['audit', 'buffer', 'ws', 'inflight']);
}

function auditBufferInflightSinceKey() {
  return rk(['audit', 'buffer', 'ws', 'inflight_since']);
}

function auditBufferFlushLockKey() {
  return rk(['audit', 'buffer', 'ws', 'flush_lock']);
}

function auditBufferRequeueCooldownKey() {
  return rk(['audit', 'buffer', 'ws', 'requeue_cooldown']);
}

async function incrAuditBufferCounter(kind, delta = 1) {
  // Redis-only metric (no DB). Keep cardinality low: total, per-day (UTC).
  try {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD (UTC)
    const ttlSec = 35 * 86400;
    const key = rk(['audit', 'buffer', kind, day]);
    const d = Number(delta) || 1;

    // Atomic INCRBY + EXPIRE-on-first (prevents keys without TTL).
    const script = `
      local v = redis.call('INCRBY', KEYS[1], tonumber(ARGV[1]))
      if v == tonumber(ARGV[1]) then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2])) end
      return v
    `;
    await redis.eval(script, [key], [String(d), String(ttlSec)]);
  } catch {
    // metrics must never break bot UX
  }
}

async function enqueueWorkspaceAuditBuffered(wsId, actorUserId, act, payload, reason = 'throttle') {
  // Best-effort buffering: must never break bot UX.
  if (!CFG.AUDIT_BUFFER_ENABLED) return false;

  const key = auditBufferListKey();
  const item = {
    kind: 'ws',
    wsId: Number(wsId) || 0,
    actorUserId: actorUserId ? Number(actorUserId) : null,
    action: String(act || '').trim(),
    payload: payload && typeof payload === 'object' ? payload : {},
    reason: String(reason || 'throttle').slice(0, 64),
    ts: Date.now()
  };

  if (!item.wsId || !item.action) return false;

  try {
    const maxLen = Number(CFG.AUDIT_BUFFER_MAX_LEN) || 5000;
    const ttlSec = Number(CFG.AUDIT_BUFFER_TTL_SEC) || (7 * 86400);

    // Atomic-ish: RPUSH + EXPIRE + LTRIM in one Lua to keep list bounded.
    const script = `
      redis.call('RPUSH', KEYS[1], ARGV[1])
      redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
      redis.call('LTRIM', KEYS[1], -tonumber(ARGV[3]), -1)
      return redis.call('LLEN', KEYS[1])
    `;
    await redis.eval(script, [key], [JSON.stringify(item), String(ttlSec), String(maxLen)]);

    await incrAuditBufferCounter('enqueued', 1);
    return true;
  } catch {
    return false;
  }
}

// Flush buffered workspace audit events from Redis to Postgres in batches.
// Intended to be called from a cron endpoint (short, bounded runtime).
export async function flushWorkspaceAuditBuffer({ batchSize, maxMs } = {}) {
  if (!CFG.AUDIT_DB_ENABLED) return { ok: false, skipped: 'audit_db_disabled' };
  if (!CFG.AUDIT_BUFFER_ENABLED) return { ok: false, skipped: 'audit_buffer_disabled' };

  const qKey = auditBufferListKey();
  const inflightKey = auditBufferInflightKey();
  const sinceKey = auditBufferInflightSinceKey();
  const lockKey = auditBufferFlushLockKey();
  const cooldownKey = auditBufferRequeueCooldownKey();

  const batch = Math.max(1, Math.min(Number(batchSize) || Number(CFG.AUDIT_BUFFER_FLUSH_BATCH) || 250, 1000));
  const maxTimeMs = Math.max(100, Math.min(Number(maxMs) || Number(CFG.AUDIT_BUFFER_FLUSH_MAX_MS) || 4500, 9000));

  const lockTtlSec = Math.max(5, Math.min(Number(CFG.AUDIT_BUFFER_FLUSH_LOCK_TTL_SEC) || 15, 60));
  const inflightTimeoutSec = Math.max(30, Math.min(Number(CFG.AUDIT_BUFFER_INFLIGHT_TIMEOUT_SEC) || 180, 1800));
  const cooldownSec = Math.max(0, Math.min(Number(CFG.AUDIT_BUFFER_REQUEUE_COOLDOWN_SEC) || 0, 1800));

  const startedAt = Date.now();
  const nowSec = () => Math.floor(Date.now() / 1000);

  const lock = await acquireLock(lockKey, lockTtlSec);
  if (!lock) return { ok: false, skipped: 'flush_locked' };

  // Lua: if inflight is stuck (or since is missing), move everything back to queue head (preserve order).
  const requeueLua = `
    local q = KEYS[1]
    local infl = KEYS[2]
    local sinceK = KEYS[3]
    local now = tonumber(ARGV[1])
    local timeout = tonumber(ARGV[2])

    local len = redis.call('LLEN', infl)
    if len <= 0 then redis.call('DEL', sinceK); return {0, 0} end

    local since = tonumber(redis.call('GET', sinceK) or '0')
    local age = 0
    if since > 0 then age = now - since end

    -- If since is missing OR age exceeds timeout => treat as stuck and requeue.
    if (since > 0 and age < timeout) then
      return {0, age}
    end

    local moved = 0
    while true do
      local v = redis.call('RPOP', infl)
      if not v then break end
      redis.call('LPUSH', q, v)
      moved = moved + 1
    end
    redis.call('DEL', sinceK)
    return {moved, age}
  `;

  // Lua: move up to N items from queue -> inflight (sets since only when inflight was empty).
  const extractLua = `
    local q = KEYS[1]
    local infl = KEYS[2]
    local sinceK = KEYS[3]
    local n = tonumber(ARGV[1])
    local now = tonumber(ARGV[2])

    local inflLen = redis.call('LLEN', infl)

    local out = {}
    for i = 1, n do
      local v = redis.call('LPOP', q)
      if not v then break end
      redis.call('RPUSH', infl, v)
      out[#out + 1] = v
    end

    if inflLen == 0 and #out > 0 then
      redis.call('SET', sinceK, now)
    end

    return out
  `;

  // Lua: ack N items from inflight head (keeps since while inflight non-empty).
  const ackLua = `
    local infl = KEYS[1]
    local sinceK = KEYS[2]
    local n = tonumber(ARGV[1])
    if n <= 0 then return redis.call('LLEN', infl) end
    redis.call('LTRIM', infl, n, -1)
    local rem = redis.call('LLEN', infl)
    if rem <= 0 then
      redis.call('DEL', sinceK)
    end
    return rem
  `;

  let batches = 0;
  let flushed = 0;
  let dropped = 0;
  let requeued = 0;
  let stuck_age_sec = null;
  let cooldown_ttl_sec = null;
  let db_failed = false;

  try {
    // If we recently requeued (or DB failed), do not hammer Postgres every minute.
    if (cooldownSec > 0) {
      try {
        const ttl = await redis.ttl(cooldownKey);
        cooldown_ttl_sec = Number(ttl);
        if (Number.isFinite(cooldown_ttl_sec) && cooldown_ttl_sec > 0) {
          return { ok: false, skipped: 'requeue_cooldown', cooldown_ttl_sec };
        }
      } catch {
        cooldown_ttl_sec = null;
      }
    }

    // 0) If previous run crashed after extracting, inflight may have items.
    // Requeue only if stuck for too long; otherwise continue processing inflight first.
    try {
      const out = await redis.eval(requeueLua, [qKey, inflightKey, sinceKey], [String(nowSec()), String(inflightTimeoutSec)]);
      if (Array.isArray(out)) {
        requeued += Number(out[0] || 0);
        stuck_age_sec = Number(out[1] || 0);
      }
    } catch {
      // ignore
    }

    // If we had to requeue, set a short cooldown so we don't keep re-extracting and failing on DB outage.
    if (requeued > 0 && cooldownSec > 0) {
      try {
        await redis.set(cooldownKey, '1', { ex: Number(cooldownSec) });
      } catch {
        // ignore
      }
    }

    while ((Date.now() - startedAt) < maxTimeMs) {
      let items = [];

      let inflightLen = 0;
      try {
        inflightLen = Number(await redis.llen(inflightKey)) || 0;
      } catch {
        break;
      }

      if (inflightLen > 0) {
        // Continue processing existing inflight (safe: nobody pushes to inflight except this locked worker).
        try {
          items = await redis.lrange(inflightKey, 0, batch - 1);
        } catch {
          break;
        }
      } else {
        // Move a fresh batch from queue -> inflight atomically.
        try {
          items = await redis.eval(extractLua, [qKey, inflightKey, sinceKey], [String(batch), String(nowSec())]);
        } catch {
          break;
        }
      }

      if (!Array.isArray(items) || items.length === 0) break;

      // Parse & validate
      const rows = [];
      for (const it of items) {
        let obj = it;
        try {
          if (typeof it === 'string') obj = JSON.parse(it);
        } catch {
          obj = null;
        }
        if (!obj || typeof obj !== 'object') { dropped += 1; continue; }

        const wsId2 = Number(obj.wsId || obj.workspace_id) || 0;
        const actorUserId2 =
          obj.actorUserId === null || obj.actorUserId === undefined
            ? null
            : (Number(obj.actorUserId || obj.actor_user_id) || null);
        const action2 = String(obj.action || '').trim();
        const payload2 = obj.payload && typeof obj.payload === 'object' ? obj.payload : {};

        if (!wsId2 || !action2) { dropped += 1; continue; }
        rows.push({ workspace_id: wsId2, actor_user_id: actorUserId2, action: action2, payload: payload2 });
      }

      // Insert batch (best-effort; never crash UX)
      if (rows.length > 0) {
        try {
          await pool.query(
            `insert into workspace_audit (workspace_id, actor_user_id, action, payload)
             select workspace_id, actor_user_id, action, payload::jsonb
             from jsonb_to_recordset($1::jsonb)
               as x(workspace_id int, actor_user_id int, action text, payload jsonb)`,
            [JSON.stringify(rows)]
          );
          flushed += rows.length;
        } catch {
          // DB error: keep items in inflight and exit (lossless).
          db_failed = true;
          break;
        }
      }

      // Ack processed items (even if some were dropped as invalid) so inflight cannot get stuck.
      try {
        await redis.eval(ackLua, [inflightKey, sinceKey], [String(items.length)]);
      } catch {
        // If we cannot ack, we risk duplicates, but that's still better than losing data.
        break;
      }

      batches += 1;
    }
  } finally {
    // Release lock (token-safe). Must never crash.
    try { await releaseLock(lockKey, lock.token); } catch {}
  }

  // If DB failed during flush, set cooldown to avoid hammering.
  if (db_failed && cooldownSec > 0) {
    try {
      await redis.set(cooldownKey, '1', { ex: Number(cooldownSec) });
    } catch {
      // ignore
    }
  }

  // Metrics + last-flush breadcrumbs (Redis-only)
  try {
    if (flushed > 0) await incrAuditBufferCounter('flushed', flushed);
    if (requeued > 0) await incrAuditBufferCounter('requeued', requeued);
  } catch {}

  let queue_len = null;
  let inflight_len = null;
  let remaining = null;
  try {
    const [qL, iL] = await Promise.all([redis.llen(qKey), redis.llen(inflightKey)]);
    queue_len = Number(qL) || 0;
    inflight_len = Number(iL) || 0;
    remaining = queue_len + inflight_len;
  } catch {
    remaining = null;
  }

  try {
    const lastKey = rk(['audit', 'buffer', 'last_flush']);
    await redis.set(lastKey, {
      last_at: new Date().toISOString(),
      flushed,
      dropped,
      requeued,
      stuck_age_sec,
      batches,
      duration_ms: Date.now() - startedAt,
      queue_len,
      inflight_len,
      remaining
    }, { ex: 14 * 86400 });
  } catch {
    // ignore
  }

  return {
    ok: true,
    flushed,
    dropped,
    requeued,
    stuck_age_sec,
    batches,
    duration_ms: Date.now() - startedAt,
    queue_len,
    inflight_len,
    remaining
  };
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
          // Best-effort: buffer suppressed audit events in Redis for later batch flush.
          await enqueueWorkspaceAuditBuffered(wsId, actorUserId, act, payload, `throttle:${sanitizeAuditPrefix(hit)}`);
          return null;
        }
      } catch {
        // Fail-closed for Neon: if Redis rate limiter is unavailable, avoid DB writes.
        // Best-effort: try buffer in Redis (may fail if Redis is down).
        await enqueueWorkspaceAuditBuffered(wsId, actorUserId, act, payload, 'rate_limiter_unavailable');
        return null;
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
  } catch (e) {
    // Missing table/migration or any DB error should not break bot UX.
    // If DB is temporarily unavailable, best-effort buffer in Redis for later batch flush.
    const code = e && typeof e === 'object' ? e.code : null;
    const msg = String(e && e.message ? e.message : '');
    const missingTable =
      code === '42P01' ||
      (msg.includes('workspace_audit') && msg.toLowerCase().includes('does not exist'));

    if (!missingTable && CFG.AUDIT_BUFFER_ON_DB_ERROR) {
      await enqueueWorkspaceAuditBuffered(wsId, actorUserId, act, payload, 'db_error');
    }

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

// END MOVED QUERY BODY: workspacesRepository
