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

import { isMissingBarterOffersMetaColumnError, listBarterOffersForOwnerWorkspace } from './bartersRepository.js';

// BEGIN MOVED QUERY BODY: applicationsRepository
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

// Safe getter: returns lead only if actor has access (owner/curator/brand/brand-manager).
// This prevents "fetch by id then check" footguns in bot logic.
export async function getBrandLeadForActor(leadId, actorUserId) {
  const id = Number(leadId || 0);
  const uId = Number(actorUserId || 0);
  if (!id || !uId) return null;

  const r = await pool.query(
    `select
        l.*,
        ws.title as workspace_title,
        ws.channel_username as workspace_username,
        ws.owner_user_id as workspace_owner_user_id
     from brand_leads l
     join workspaces ws on ws.id = l.workspace_id
     left join workspace_settings ss on ss.workspace_id = ws.id
     where l.id = $1
       and not (coalesce(l.deleted_by_user_ids, '[]'::jsonb) @> to_jsonb($2::bigint))
       and (
         ws.owner_user_id = $2
         or l.brand_user_id = $2
         or exists (
           select 1 from brand_managers bm
            where bm.brand_user_id = l.brand_user_id
              and bm.manager_user_id = $2
         )
         or (
           coalesce(ss.curator_enabled, false) = true
           and exists (
             select 1 from workspace_curators c
              where c.workspace_id = ws.id
                and c.user_id = $2
           )
         )
       )
     limit 1`,
    [id, uId]
  );
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

  // Lead notes support lightweight tags via "#tag" syntax (e.g. #brief, #urgent).
  // We store tags explicitly so the UI and future filters do not need to parse text.
  const extractTags = (s) => {
    const str = String(s || '');
    const re = /#([a-zA-Z0-9_А-Яа-я]{2,24})/g;
    const out = [];
    let m;
    while ((m = re.exec(str))) {
      const tag = String(m[1] || '').trim().toLowerCase();
      if (!tag) continue;
      if (!out.includes(tag)) out.push(tag);
      if (out.length >= 8) break;
    }
    return out;
  };

  const optTagsRaw = (opts && typeof opts === 'object' && Array.isArray(opts.tags)) ? opts.tags : [];
  const optTags = optTagsRaw
    .map((x) => String(x || '').trim().replace(/^#/, '').toLowerCase())
    .filter(Boolean)
    .slice(0, 8);

  const tags = Array.from(new Set([ ...extractTags(safeText), ...optTags ])).slice(0, 8);
  const tagsJson = JSON.stringify(tags);

  const roleRaw = opts && typeof opts === 'object' ? String(opts.role || '').trim() : '';
  const role = roleRaw ? roleRaw.toLowerCase() : null;
  const r = await pool.query(
    `update brand_leads
     set meta = jsonb_set(
       jsonb_set(
         coalesce(meta, '{}'::jsonb),
         '{curator_notes}',
         (coalesce(coalesce(meta, '{}'::jsonb)->'curator_notes', '[]'::jsonb) ||
          jsonb_build_array(
            jsonb_build_object(
              'by', $2::int,
              'at', now(),
              'text', $3::text,
              'role', $4::text,
              'tags', coalesce($5::jsonb, '[]'::jsonb)
            )
          )
         ),
         true
       ),
       '{tags}',
       (
         select to_jsonb(array(
           select distinct tag
           from (
             select jsonb_array_elements_text(
               case
                 when jsonb_typeof(coalesce(meta, '{}'::jsonb)->'tags') = 'array' then (coalesce(meta, '{}'::jsonb)->'tags')
                 else '[]'::jsonb
               end
             ) as tag
             union all
             select jsonb_array_elements_text(coalesce($5::jsonb, '[]'::jsonb)) as tag
           ) s
           where coalesce(tag, '') <> ''
           limit 32
         ))
       ),
       true
     ),
     updated_at = now()
     where id = $1
     returning meta`,
    [id, by, safeText, role, tagsJson]
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

// Safe getter: returns application only if actor is brand owner/manager or the creator.
export async function getBrandApplicationForActor(appId, actorUserId) {
  const id = Number(appId || 0);
  const uId = Number(actorUserId || 0);
  if (!id || !uId) return null;

  const r = await pool.query(
    `select a.*
       from brand_applications a
      where a.id = $1
        and not (coalesce(a.deleted_by_user_ids, '[]'::jsonb) @> to_jsonb($2::bigint))
        and (
          a.creator_user_id = $2
          or a.brand_user_id = $2
          or exists (
            select 1 from brand_managers bm
             where bm.brand_user_id = a.brand_user_id
               and bm.manager_user_id = $2
          )
        )
      limit 1`,
    [id, uId]
  );
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
  const st = String(status || '').trim();
  // Server-side guard (STEP317): until ✅ Принять we never allow moving to in_progress/closed.
  // Allowed anytime: spam. Allowed after accept: in_progress/closed.
  const r = await pool.query(
    `update brand_applications
       set status=$2, updated_at=now()
     where id=$1
       and (
         ($2 = 'spam')
         or ($2 in ('in_progress','closed') and coalesce(status,'new') <> 'new')
       )
     returning *`,
    [Number(appId), st]
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
       and coalesce(status,'new') <> 'new'
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
                      'accepted_by_user_id', $2::bigint,
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

// Accept brand application AND charge Brand Pass credits exactly-once.
// - If already accepted (status != 'new') -> {status:'already_accepted'}
// - If insufficient credits -> {status:'insufficient_credits'}
// - If accepted now -> {status:'accepted'}
export async function acceptBrandApplicationWithCharge(appId, acceptedByUserId, brandUserId, cost = 1, opts = {}) {
  const aid = Number(appId);
  const uid = Number(brandUserId);
  const c = Math.max(0, Math.floor(Number(cost) || 0));

  let left = null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');

    // Degradation hardening: keep Neon safe when Redis is down / click storms happen.
    const stm = Math.floor(Number(opts?.statementTimeoutMs || 0));
    if (Number.isFinite(stm) && stm > 0) {
      // Transaction-scoped: affects waits on row locks too.
      await txSetLocalStatementTimeout(client, stm);
    }

    // Fast concurrency guard: if another accept is already in-flight, return quickly (no queue of waiting locks).
    const lockRes = await client.query(
      'SELECT pg_try_advisory_xact_lock($1::int, $2::int) AS ok',
      [aid, uid]
    );
    if (!lockRes.rows?.[0]?.ok) {
      await client.query('ROLLBACK');
      return { status: 'busy' };
    }

    const appRes = await client.query(
      `select id, coalesce(status,'new') as status
       from brand_applications
       where id=$1
       for update`,
      [aid]
    );

    if (!appRes.rows.length) {
      await client.query('ROLLBACK');
      return { status: 'missing' };
    }

    const st = String(appRes.rows[0]?.status || 'new');
    if (st !== 'new') {
      await client.query('COMMIT');
      return { status: 'already_accepted' };
    }

    // Spend credits (atomic). If free -> skip.
    if (c > 0) {
      try {
        const spend = await client.query(
          `update users
             set brand_credits = brand_credits - $2,
                 brand_credits_spent = brand_credits_spent + $2,
                 brand_credits_gifted = greatest(0, brand_credits_gifted - $2),
                 updated_at=now()
           where id=$1 and brand_credits >= $2
           returning brand_credits`,
          [uid, c]
        );
        if (!spend.rows.length) {
          await client.query('ROLLBACK');
          return { status: 'insufficient_credits' };
        }
        left = Number(spend.rows[0]?.brand_credits ?? 0);
      } catch (e) {
        // Rolling upgrade safety: brand_credits_gifted may be missing.
        if (e && e.code === '42703') {
          const spend = await client.query(
            `update users
               set brand_credits = brand_credits - $2,
                   brand_credits_spent = brand_credits_spent + $2,
                   updated_at=now()
             where id=$1 and brand_credits >= $2
             returning brand_credits`,
            [uid, c]
          );
          if (!spend.rows.length) {
            await client.query('ROLLBACK');
            return { status: 'insufficient_credits' };
          }
          left = Number(spend.rows[0]?.brand_credits ?? 0);
        } else {
          throw e;
        }
      }
    }

    // Mark accepted (status=in_progress + meta.deal)
    await client.query(
      `update brand_applications
         set status='in_progress',
             meta = jsonb_set(
               jsonb_set(
                 jsonb_set(
                   coalesce(meta,'{}'::jsonb),
                   '{deal}',
                   coalesce(coalesce(meta,'{}'::jsonb)->'deal','{}'::jsonb)
                     || jsonb_build_object(
                          'accepted_by_user_id', $2::bigint,
                          'accepted_at', now(),
                          'charged_cost', $3::int,
                          'charged_at', now()
                        ),
                   true
                 ),
                 '{deal_stage}',
                 to_jsonb(coalesce(nullif(coalesce(meta->>'deal_stage',''),''), 'negotiation')),
                 true
               ),
               '{updated_by}',
               to_jsonb($2::bigint),
               true
             ),
             updated_at=now()
       where id=$1 and coalesce(status,'new')='new'`,
      [aid, acceptedByUserId ? Number(acceptedByUserId) : null, c]
    );

    await client.query('COMMIT');
    return { status: 'accepted', left };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

// List accepted brand deals only (accepted_by_user_id + deal_stage are authoritative).
export async function countBrandDealsByStage(brandUserId, acceptedByUserId = null) {
  const params = [Number(brandUserId)];
  let where = `brand_user_id=$1 and coalesce(meta->'deal'->>'accepted_by_user_id','') <> '' and coalesce(meta->>'deal_stage','') <> ''`;

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

  let where = `brand_user_id=$1 and coalesce(meta->'deal'->>'accepted_by_user_id','') <> ''`;

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

  let where = `brand_user_id=$1 and coalesce(meta->'deal'->>'accepted_by_user_id','') <> ''`;

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

  let where = `brand_user_id=$1 and coalesce(meta->'deal'->>'accepted_by_user_id','') <> ''`;

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
           || jsonb_build_object('set_by_user_id',$3::bigint,'set_at',now()),
         true
       ),
       updated_at=now()
     where id=$1
       and coalesce(meta->'deal'->>'accepted_by_user_id','') <> ''
       and coalesce(meta->>'deal_stage','') <> ''
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


// END MOVED QUERY BODY: applicationsRepository
