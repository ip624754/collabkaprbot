import {
  GW_DRAW_ALGO_VERSION_SQL,
  GW_DRAW_SEED_VERSION_SQL,
  GW_POOL_HASH_METHOD_SQL,
  GW_WINNERS_HASH_METHOD_SQL,
} from '../lib/gwRepro.js';

const DRAW_TX_ISOLATION = 'repeatable_read';
const DRAW_SOURCE_ALLOWLIST = new Set(['manual', 'cron', 'admin', 'recovery', 'unknown']);
const ENDABLE_STATUSES = new Set(['ACTIVE', 'PAUSED', 'PUBLISHED', 'RUNNING']);

function toPositiveInt(value, fallback = 0) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function normalizeSource(value) {
  const source = String(value || 'unknown').trim().toLowerCase();
  return DRAW_SOURCE_ALLOWLIST.has(source) ? source : 'unknown';
}

function toIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function sanitizeStatementTimeoutMs(raw) {
  const v = Math.floor(Number(raw));
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v < 1000) return 1000;
  if (v > 600000) return 600000;
  return v;
}

async function setLocalStatementTimeout(client, rawMs) {
  const ms = sanitizeStatementTimeoutMs(rawMs);
  if (!ms) return;
  // Safe interpolation: ms is a bounded integer. Avoid a failed set_config call,
  // because any SQL error would abort the surrounding PostgreSQL transaction.
  await client.query(`SET LOCAL statement_timeout TO ${ms}`);
}

async function rollbackQuietly(client) {
  try {
    await client.query('ROLLBACK');
  } catch {
    // best effort only
  }
}

async function readWinnerIds(client, giveawayId) {
  const r = await client.query(
    `SELECT user_id
       FROM giveaway_winners
      WHERE giveaway_id = $1
      ORDER BY place ASC`,
    [giveawayId]
  );
  return (r.rows || []).map((row) => Number(row.user_id)).filter(Number.isFinite);
}

async function pickDeterministic(client, { giveawayId, seed, limit, eligible }) {
  const requested = Math.max(1, toPositiveInt(limit, 1));
  const eligibilityClause = eligible ? 'AND is_eligible = TRUE' : 'AND is_eligible = FALSE';

  try {
    const r = await client.query(
      `SELECT user_id
         FROM giveaway_entries
        WHERE giveaway_id = $1
          ${eligibilityClause}
        ORDER BY encode(digest($2 || ':' || user_id::text, 'sha256'), 'hex'), user_id
        LIMIT $3`,
      [giveawayId, seed, requested]
    );
    return { rows: r.rows || [], method: 'sha256' };
  } catch (error) {
    const code = error?.code || null;
    const message = String(error?.message || '');
    const missingDigest = code === '42883' || message.includes('function digest');
    if (!missingDigest) throw error;

    const r = await client.query(
      `SELECT user_id
         FROM giveaway_entries
        WHERE giveaway_id = $1
          ${eligibilityClause}
        ORDER BY md5($2 || ':' || user_id::text), user_id
        LIMIT $3`,
      [giveawayId, seed, requested]
    );
    return { rows: r.rows || [], method: 'md5_fallback' };
  }
}

async function computePoolMetadata(client, giveawayId, eligible) {
  const eligibilityClause = eligible ? 'AND is_eligible = TRUE' : '';
  const r = await client.query(
    `SELECT
       md5(string_agg(md5(user_id::text), '' ORDER BY user_id)) AS h,
       count(*)::int AS cnt,
       max(joined_at) AS max_joined_at
     FROM giveaway_entries
     WHERE giveaway_id = $1
       ${eligibilityClause}`,
    [giveawayId]
  );
  const row = r.rows?.[0] || {};
  return {
    h: row.h || null,
    cnt: Number(row.cnt || 0),
    max_joined_at: toIso(row.max_joined_at),
  };
}

async function computeWinnersHash(client, giveawayId) {
  const r = await client.query(
    `SELECT md5(string_agg((place::text || ':' || user_id::text), ',' ORDER BY place)) AS h
       FROM giveaway_winners
      WHERE giveaway_id = $1`,
    [giveawayId]
  );
  return r.rows?.[0]?.h || null;
}

async function insertAudit(client, {
  giveawayId,
  workspaceId,
  actorUserId,
  action,
  payload,
}) {
  await client.query(
    `INSERT INTO giveaway_audit (giveaway_id, workspace_id, actor_user_id, action, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      giveawayId,
      workspaceId,
      actorUserId ? Number(actorUserId) : null,
      action,
      JSON.stringify(payload || {}),
    ]
  );
}

/**
 * Canonical giveaway draw transaction.
 *
 * This service is the only runtime path allowed to select winners, persist them,
 * transition the giveaway to WINNERS_DRAWN and write the draw audit receipt.
 */
export async function drawAndFinalizeGiveawayWinnersAtomicCore({
  pool,
  giveawayId,
  expectedWorkspaceId = null,
  actorUserId = null,
  source = 'unknown',
  statementTimeoutMs = 15000,
} = {}) {
  if (!pool || typeof pool.connect !== 'function') throw new Error('pool.connect required');

  const gid = toPositiveInt(giveawayId, 0);
  if (!gid) throw new Error('valid giveawayId required');

  const normalizedSource = normalizeSource(source);
  const expectedWsid = toPositiveInt(expectedWorkspaceId, 0) || null;
  const client = await pool.connect();

  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await setLocalStatementTimeout(client, statementTimeoutMs);

    const lockRes = await client.query(
      'SELECT pg_try_advisory_xact_lock($1) AS ok',
      [gid]
    );
    if (!lockRes.rows?.[0]?.ok) {
      await rollbackQuietly(client);
      return { status: 'locked' };
    }

    const gwRes = await client.query(
      `SELECT
         id,
         workspace_id,
         status,
         winners_drawn_at,
         winners_count,
         ends_at,
         created_at,
         (ends_at IS NOT NULL AND ends_at <= transaction_timestamp()) AS deadline_passed
       FROM giveaways
       WHERE id = $1
       FOR UPDATE`,
      [gid]
    );

    if (!gwRes.rowCount) {
      await rollbackQuietly(client);
      return { status: 'missing' };
    }

    const giveaway = gwRes.rows[0];
    const workspaceId = toPositiveInt(giveaway.workspace_id, 0);
    if (!workspaceId) throw new Error('giveaway workspace_id invalid');

    if (expectedWsid && expectedWsid !== workspaceId) {
      await rollbackQuietly(client);
      return { status: 'workspace_mismatch' };
    }

    const rawStatus = String(giveaway.status || '').toUpperCase();
    if (
      giveaway.winners_drawn_at ||
      rawStatus === 'WINNERS_DRAWN' ||
      rawStatus === 'RESULTS_PUBLISHED'
    ) {
      const winnerIds = await readWinnerIds(client, gid);
      await rollbackQuietly(client);
      return { status: 'already_drawn', winnersUserIds: winnerIds };
    }

    const snapshotRes = await client.query(
      `SELECT to_char(
         (transaction_timestamp() at time zone 'utc'),
         'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
       ) AS ts`
    );
    const snapshotTs = snapshotRes.rows?.[0]?.ts || null;

    let effectiveStatus = rawStatus;
    if (effectiveStatus !== 'ENDED') {
      const canLazyEnd = ENDABLE_STATUSES.has(effectiveStatus) && giveaway.deadline_passed === true;
      if (!canLazyEnd) {
        await rollbackQuietly(client);
        return { status: 'wrong_status', status_value: giveaway.status };
      }

      const endedRes = await client.query(
        `UPDATE giveaways
            SET status = 'ENDED', updated_at = NOW()
          WHERE id = $1
            AND status IN ('ACTIVE','PAUSED','PUBLISHED','RUNNING')
            AND ends_at IS NOT NULL
            AND ends_at <= transaction_timestamp()
        RETURNING id`,
        [gid]
      );
      if (!endedRes.rowCount) {
        await rollbackQuietly(client);
        return { status: 'wrong_status', status_value: giveaway.status };
      }

      await insertAudit(client, {
        giveawayId: gid,
        workspaceId,
        actorUserId,
        action: 'gw.ended_lazy',
        payload: {
          source: normalizedSource,
          by_time: true,
          same_transaction_as_draw: true,
          tx_isolation: DRAW_TX_ISOLATION,
          snapshot_ts: snapshotTs,
        },
      });
    }

    const requested = Math.max(1, toPositiveInt(giveaway.winners_count, 1));
    const endsAtIso = toIso(giveaway.ends_at);
    const createdAtIso = toIso(giveaway.created_at);
    const seedIso = endsAtIso || createdAtIso;
    if (!seedIso) throw new Error('giveaway has no durable seed timestamp');

    const seedSource = endsAtIso ? 'ends_at' : 'created_at';
    const seed = `${gid}:${seedIso}`;

    const eligiblePool = await computePoolMetadata(client, gid, true);
    const entriesPool = await computePoolMetadata(client, gid, false);

    const pickedEligible = await pickDeterministic(client, {
      giveawayId: gid,
      seed,
      limit: requested,
      eligible: true,
    });

    const eligibleWinnerIds = (pickedEligible.rows || [])
      .map((row) => Number(row.user_id))
      .filter(Number.isFinite);

    const winnersUserIds = [...eligibleWinnerIds];
    let method = pickedEligible.method;
    let topupWinnerIds = [];

    if (winnersUserIds.length < requested) {
      const pickedTopup = await pickDeterministic(client, {
        giveawayId: gid,
        seed,
        limit: requested - winnersUserIds.length,
        eligible: false,
      });
      topupWinnerIds = (pickedTopup.rows || [])
        .map((row) => Number(row.user_id))
        .filter(Number.isFinite);
      winnersUserIds.push(...topupWinnerIds);
      if (method !== 'sha256') method = pickedTopup.method;
    }

    let usedPool = 'eligible';
    if (eligibleWinnerIds.length === 0 && topupWinnerIds.length > 0) usedPool = 'all_entries';
    else if (topupWinnerIds.length > 0) usedPool = 'eligible_topup';

    if (!winnersUserIds.length) {
      await insertAudit(client, {
        giveawayId: gid,
        workspaceId,
        actorUserId,
        action: 'gw.winners_drawn_skipped',
        payload: {
          reason: 'no_entries',
          source: normalizedSource,
          tx_isolation: DRAW_TX_ISOLATION,
          snapshot_ts: snapshotTs,
          seed,
          seed_source: seedSource,
          seed_version: GW_DRAW_SEED_VERSION_SQL,
          algo_version: GW_DRAW_ALGO_VERSION_SQL,
          ends_at_iso_used: endsAtIso,
          created_at_iso_used: createdAtIso,
          method,
          requested_winners: requested,
          eligible_count: eligiblePool.cnt,
          entries_pool_count: entriesPool.cnt,
        },
      });
      await client.query('COMMIT');
      return { status: 'no_entries', seed, method, requested_winners: requested };
    }

    await client.query('DELETE FROM giveaway_winners WHERE giveaway_id = $1', [gid]);
    await client.query(
      `INSERT INTO giveaway_winners (giveaway_id, user_id, place)
       SELECT $1, picked.user_id, picked.ordinality::int
       FROM unnest($2::bigint[]) WITH ORDINALITY AS picked(user_id, ordinality)
       ORDER BY picked.ordinality`,
      [gid, winnersUserIds]
    );

    const markRes = await client.query(
      `UPDATE giveaways
          SET status = 'WINNERS_DRAWN',
              winners_drawn_at = NOW(),
              updated_at = NOW()
        WHERE id = $1
          AND status = 'ENDED'
          AND winners_drawn_at IS NULL
      RETURNING id`,
      [gid]
    );

    if (!markRes.rowCount) {
      await rollbackQuietly(client);
      return { status: 'already_drawn' };
    }

    const winnersHash = await computeWinnersHash(client, gid);
    const poolHashValue = usedPool === 'eligible' ? eligiblePool.h : entriesPool.h;
    const poolCountValue = usedPool === 'eligible' ? eligiblePool.cnt : entriesPool.cnt;
    const poolCutoffJoinedAt = usedPool === 'eligible'
      ? eligiblePool.max_joined_at
      : entriesPool.max_joined_at;

    await insertAudit(client, {
      giveawayId: gid,
      workspaceId,
      actorUserId,
      action: 'gw.winners_drawn',
      payload: {
        source: normalizedSource,
        tx_isolation: DRAW_TX_ISOLATION,
        snapshot_ts: snapshotTs,
        seed,
        seed_source: seedSource,
        seed_version: GW_DRAW_SEED_VERSION_SQL,
        algo_version: GW_DRAW_ALGO_VERSION_SQL,
        ends_at_iso_used: endsAtIso,
        created_at_iso_used: createdAtIso,
        method,
        winners: winnersUserIds.length,
        eligible_winners: eligibleWinnerIds.length,
        topup_winners: topupWinnerIds.length,
        used_pool: usedPool,
        requested_winners: requested,
        pool_hash: poolHashValue,
        pool_hash_method: GW_POOL_HASH_METHOD_SQL,
        pool_count: poolCountValue,
        pool_cutoff_joined_at: poolCutoffJoinedAt,
        eligible_max_joined_at: eligiblePool.max_joined_at,
        entries_max_joined_at: entriesPool.max_joined_at,
        eligible_pool_hash: eligiblePool.h,
        eligible_count: eligiblePool.cnt,
        entries_pool_hash: entriesPool.h,
        entries_pool_count: entriesPool.cnt,
        winners_hash: winnersHash,
        winners_hash_method: GW_WINNERS_HASH_METHOD_SQL,
      },
    });

    await client.query('COMMIT');
    return {
      status: 'drawn',
      source: normalizedSource,
      seed,
      seed_source: seedSource,
      method,
      used_pool: usedPool,
      winnersUserIds,
      eligible_winners: eligibleWinnerIds.length,
      topup_winners: topupWinnerIds.length,
      requested_winners: requested,
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

/** Transactional sponsor replacement: no observable delete-without-reinsert state. */
export async function replaceGiveawaySponsorsAtomicCore({
  pool,
  giveawayId,
  sponsorTexts,
  statementTimeoutMs = 15000,
} = {}) {
  if (!pool || typeof pool.connect !== 'function') throw new Error('pool.connect required');
  const gid = toPositiveInt(giveawayId, 0);
  if (!gid) throw new Error('valid giveawayId required');

  const sponsors = Array.isArray(sponsorTexts)
    ? sponsorTexts.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setLocalStatementTimeout(client, statementTimeoutMs);

    const lockRes = await client.query(
      'SELECT id FROM giveaways WHERE id = $1 FOR UPDATE',
      [gid]
    );
    if (!lockRes.rowCount) {
      await rollbackQuietly(client);
      return { status: 'missing', count: 0 };
    }

    await client.query('DELETE FROM giveaway_sponsors WHERE giveaway_id = $1', [gid]);
    if (sponsors.length) {
      await client.query(
        `INSERT INTO giveaway_sponsors (giveaway_id, position, sponsor_text)
         SELECT $1, item.ordinality::int, item.sponsor_text
         FROM unnest($2::text[]) WITH ORDINALITY AS item(sponsor_text, ordinality)
         ORDER BY item.ordinality`,
        [gid, sponsors]
      );
    }

    await client.query('COMMIT');
    return { status: 'replaced', count: sponsors.length };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}
