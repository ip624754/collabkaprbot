import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  drawAndFinalizeGiveawayWinnersAtomicCore,
  replaceGiveawaySponsorsAtomicCore,
} from '../src/db/giveawayAtomicCore.js';

function clone(value) {
  return structuredClone(value);
}

function sqlKey(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function digest(method, value) {
  return crypto.createHash(method).update(String(value)).digest('hex');
}

function makeState({ giveaway, entries = [], winners = [], sponsors = [] }) {
  return {
    giveaways: new Map([[Number(giveaway.id), clone(giveaway)]]),
    entries: new Map([[Number(giveaway.id), clone(entries)]]),
    winners: new Map([[Number(giveaway.id), clone(winners)]]),
    sponsors: new Map([[Number(giveaway.id), clone(sponsors)]]),
    audits: [],
  };
}

class FakePool {
  constructor(state) {
    this.state = clone(state);
    this.advisoryLocks = new Set();
    this.failAt = '';
  }

  async connect() {
    return new FakeClient(this);
  }
}

class FakeClient {
  constructor(pool) {
    this.pool = pool;
    this.tx = null;
    this.lockedGid = null;
  }

  async query(sql, params = []) {
    const q = sqlKey(sql);

    if (q.startsWith('begin')) {
      this.tx = clone(this.pool.state);
      return { rowCount: 0, rows: [] };
    }
    if (q === 'rollback') {
      this._unlock();
      this.tx = null;
      return { rowCount: 0, rows: [] };
    }
    if (q === 'commit') {
      if (this.pool.failAt === 'commit') throw new Error('commit failed');
      this.pool.state = this.tx;
      this._unlock();
      this.tx = null;
      return { rowCount: 0, rows: [] };
    }
    if (q.startsWith("select set_config('statement_timeout'")) {
      return { rowCount: 1, rows: [{ set_config: String(params[0]) }] };
    }
    if (q.startsWith('set local statement_timeout')) {
      return { rowCount: 0, rows: [] };
    }

    if (!this.tx) throw new Error(`query outside transaction: ${q}`);

    if (q.startsWith('select pg_try_advisory_xact_lock')) {
      const gid = Number(params[0]);
      if (this.pool.advisoryLocks.has(gid)) return { rowCount: 1, rows: [{ ok: false }] };
      this.pool.advisoryLocks.add(gid);
      this.lockedGid = gid;
      return { rowCount: 1, rows: [{ ok: true }] };
    }

    if (q.includes('from giveaways') && q.includes('deadline_passed') && q.endsWith('for update')) {
      const row = this.tx.giveaways.get(Number(params[0]));
      return row ? { rowCount: 1, rows: [clone(row)] } : { rowCount: 0, rows: [] };
    }

    if (q.startsWith('select id from giveaways where id = $1 for update') || q.startsWith('select id from giveaways where id=$1 for update')) {
      const row = this.tx.giveaways.get(Number(params[0]));
      return row ? { rowCount: 1, rows: [{ id: row.id }] } : { rowCount: 0, rows: [] };
    }

    if (q.startsWith('select to_char(')) {
      return { rowCount: 1, rows: [{ ts: '2026-07-20T10:00:00.000Z' }] };
    }

    if (q.startsWith("update giveaways set status = 'ended'")) {
      const row = this.tx.giveaways.get(Number(params[0]));
      if (!row || !row.deadline_passed || !['ACTIVE', 'PAUSED', 'PUBLISHED', 'RUNNING'].includes(String(row.status).toUpperCase())) {
        return { rowCount: 0, rows: [] };
      }
      row.status = 'ENDED';
      return { rowCount: 1, rows: [{ id: row.id }] };
    }

    if (q.startsWith('select md5(string_agg(md5(user_id::text)')) {
      const gid = Number(params[0]);
      const eligibleOnly = q.includes('and is_eligible = true');
      const rows = (this.tx.entries.get(gid) || []).filter((entry) => !eligibleOnly || entry.is_eligible === true);
      const ids = rows.map((entry) => Number(entry.user_id)).sort((a, b) => a - b);
      const hash = ids.length ? digest('md5', ids.map((id) => digest('md5', String(id))).join('')) : null;
      const joined = rows.map((entry) => entry.joined_at).filter(Boolean).sort();
      return {
        rowCount: 1,
        rows: [{ h: hash, cnt: ids.length, max_joined_at: joined.at(-1) || null }],
      };
    }

    if (q.startsWith('select user_id from giveaway_entries')) {
      const gid = Number(params[0]);
      const seed = String(params[1]);
      const limit = Number(params[2]);
      const eligible = q.includes('and is_eligible = true');
      const ineligible = q.includes('and is_eligible = false');
      const method = q.includes("digest($2 || ':' || user_id::text, 'sha256')") ? 'sha256' : 'md5';
      let rows = clone(this.tx.entries.get(gid) || []);
      if (eligible) rows = rows.filter((entry) => entry.is_eligible === true);
      if (ineligible) rows = rows.filter((entry) => entry.is_eligible === false);
      rows.sort((a, b) => {
        const ah = digest(method, `${seed}:${a.user_id}`);
        const bh = digest(method, `${seed}:${b.user_id}`);
        return ah.localeCompare(bh) || Number(a.user_id) - Number(b.user_id);
      });
      return { rowCount: Math.min(rows.length, limit), rows: rows.slice(0, limit).map((entry) => ({ user_id: entry.user_id })) };
    }

    if (q.startsWith('select user_id from giveaway_winners')) {
      const gid = Number(params[0]);
      const rows = clone(this.tx.winners.get(gid) || []).sort((a, b) => a.place - b.place);
      return { rowCount: rows.length, rows: rows.map((row) => ({ user_id: row.user_id })) };
    }

    if (q.startsWith('delete from giveaway_winners')) {
      this.tx.winners.set(Number(params[0]), []);
      return { rowCount: 1, rows: [] };
    }

    if (q.startsWith('insert into giveaway_winners')) {
      const gid = Number(params[0]);
      const ids = clone(params[1] || []);
      this.tx.winners.set(gid, ids.map((userId, index) => ({ user_id: Number(userId), place: index + 1 })));
      if (this.pool.failAt === 'after_winner_insert') throw new Error('failure after winner insert');
      return { rowCount: ids.length, rows: [] };
    }

    if (q.startsWith("update giveaways set status = 'winners_drawn'")) {
      if (this.pool.failAt === 'before_status_update') throw new Error('failure before status update');
      const row = this.tx.giveaways.get(Number(params[0]));
      if (!row || String(row.status).toUpperCase() !== 'ENDED' || row.winners_drawn_at) {
        return { rowCount: 0, rows: [] };
      }
      row.status = 'WINNERS_DRAWN';
      row.winners_drawn_at = '2026-07-20T10:00:00.000Z';
      return { rowCount: 1, rows: [{ id: row.id }] };
    }

    if (q.startsWith("select md5(string_agg((place::text || ':' || user_id::text)")) {
      const gid = Number(params[0]);
      const rows = clone(this.tx.winners.get(gid) || []).sort((a, b) => a.place - b.place);
      const value = rows.map((row) => `${row.place}:${row.user_id}`).join(',');
      return { rowCount: 1, rows: [{ h: value ? digest('md5', value) : null }] };
    }

    if (q.startsWith('insert into giveaway_audit')) {
      const payload = JSON.parse(String(params[4] || '{}'));
      if (this.pool.failAt === 'audit' && params[3] === 'gw.winners_drawn') throw new Error('audit failed');
      this.tx.audits.push({
        giveaway_id: Number(params[0]),
        workspace_id: Number(params[1]),
        actor_user_id: params[2] == null ? null : Number(params[2]),
        action: String(params[3]),
        payload,
      });
      return { rowCount: 1, rows: [] };
    }

    if (q.startsWith('delete from giveaway_sponsors')) {
      this.tx.sponsors.set(Number(params[0]), []);
      if (this.pool.failAt === 'sponsor_after_delete') throw new Error('sponsor delete interruption');
      return { rowCount: 1, rows: [] };
    }

    if (q.startsWith('insert into giveaway_sponsors')) {
      if (this.pool.failAt === 'sponsor_insert') throw new Error('sponsor insert failed');
      const gid = Number(params[0]);
      const sponsors = clone(params[1] || []);
      this.tx.sponsors.set(gid, sponsors.map((text, index) => ({ position: index + 1, sponsor_text: text })));
      return { rowCount: sponsors.length, rows: [] };
    }

    throw new Error(`unsupported fake SQL: ${q}`);
  }

  release() {
    this._unlock();
  }

  _unlock() {
    if (this.lockedGid != null) this.pool.advisoryLocks.delete(this.lockedGid);
    this.lockedGid = null;
  }
}

function baseGiveaway(overrides = {}) {
  return {
    id: 42,
    workspace_id: 7,
    status: 'ENDED',
    winners_drawn_at: null,
    winners_count: 3,
    ends_at: '2026-07-20T09:00:00.000Z',
    created_at: '2026-07-19T09:00:00.000Z',
    deadline_passed: true,
    ...overrides,
  };
}

function entry(userId, eligible, joinedOffset = 0) {
  return {
    user_id: userId,
    is_eligible: eligible,
    joined_at: new Date(Date.parse('2026-07-19T10:00:00.000Z') + joinedOffset).toISOString(),
  };
}

async function draw(pool, options = {}) {
  return drawAndFinalizeGiveawayWinnersAtomicCore({
    pool,
    giveawayId: 42,
    expectedWorkspaceId: 7,
    actorUserId: options.actorUserId ?? null,
    source: options.source || 'cron',
    statementTimeoutMs: 5000,
  });
}

let assertions = 0;
function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}
function equal(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

// eligible first + deterministic top-up
{
  const pool = new FakePool(makeState({
    giveaway: baseGiveaway({ winners_count: 4 }),
    entries: [entry(1, true), entry(2, true), entry(3, false), entry(4, false), entry(5, false)],
  }));
  const result = await draw(pool, { source: 'manual', actorUserId: 91 });
  equal(result.status, 'drawn', 'top-up draw succeeds');
  equal(result.used_pool, 'eligible_topup', 'top-up pool is explicit');
  equal(result.eligible_winners, 2, 'all eligible participants are selected first');
  equal(result.topup_winners, 2, 'remaining places are topped up');
  equal(result.winnersUserIds.length, 4, 'requested winner count is filled');
  check(result.winnersUserIds.slice(0, 2).every((id) => [1, 2].includes(id)), 'eligible winners occupy first places');
  const audit = pool.state.audits.find((row) => row.action === 'gw.winners_drawn');
  equal(audit.actor_user_id, 91, 'manual actor is committed with draw audit');
  equal(audit.payload.source, 'manual', 'manual source is committed with draw audit');
  equal(audit.payload.topup_winners, 2, 'audit records top-up count');
}

// zero eligible -> all entries
{
  const pool = new FakePool(makeState({
    giveaway: baseGiveaway({ winners_count: 2 }),
    entries: [entry(11, false), entry(12, false), entry(13, false)],
  }));
  const result = await draw(pool);
  equal(result.status, 'drawn', 'zero-eligible draw succeeds');
  equal(result.used_pool, 'all_entries', 'zero eligible uses all entries');
  equal(result.eligible_winners, 0, 'zero eligible winners recorded');
  equal(result.topup_winners, 2, 'all winners are fallback winners');
}

// insufficient total participants -> deterministic underfill, no duplicates
{
  const pool = new FakePool(makeState({
    giveaway: baseGiveaway({ winners_count: 5 }),
    entries: [entry(21, true), entry(22, false)],
  }));
  const result = await draw(pool);
  equal(result.status, 'drawn', 'underfilled draw still succeeds');
  equal(result.winnersUserIds.length, 2, 'all available participants are selected');
  equal(new Set(result.winnersUserIds).size, 2, 'winner list has no duplicates');
  equal(pool.state.winners.get(42).length, 2, 'durable winners match available pool');
}

// advisory lock contention
{
  const pool = new FakePool(makeState({ giveaway: baseGiveaway(), entries: [entry(31, true)] }));
  pool.advisoryLocks.add(42);
  const result = await draw(pool);
  equal(result.status, 'locked', 'lock contention fails fast');
  equal(pool.state.winners.get(42).length, 0, 'locked draw writes no winners');
  equal(pool.state.audits.length, 0, 'locked draw writes no audit');
}

// repeated draw is idempotent
{
  const pool = new FakePool(makeState({ giveaway: baseGiveaway({ winners_count: 2 }), entries: [entry(41, true), entry(42, false)] }));
  const first = await draw(pool);
  const before = clone(pool.state.winners.get(42));
  const second = await draw(pool, { source: 'manual', actorUserId: 5 });
  equal(first.status, 'drawn', 'first draw succeeds');
  equal(second.status, 'already_drawn', 'second draw is idempotent');
  equal(pool.state.winners.get(42), before, 'repeated draw preserves winner set');
  equal(pool.state.audits.filter((row) => row.action === 'gw.winners_drawn').length, 1, 'only one draw audit exists');
}

// failure after winner insert rolls back everything
{
  const pool = new FakePool(makeState({ giveaway: baseGiveaway(), entries: [entry(51, true), entry(52, false)] }));
  pool.failAt = 'after_winner_insert';
  await assert.rejects(() => draw(pool), /failure after winner insert/);
  assertions += 1;
  equal(pool.state.winners.get(42), [], 'winner insert failure is rolled back');
  equal(pool.state.giveaways.get(42).status, 'ENDED', 'status remains ENDED after rollback');
  equal(pool.state.audits.length, 0, 'audit is rolled back with winner failure');
}

// failure before status update rolls back winner replacement
{
  const pool = new FakePool(makeState({ giveaway: baseGiveaway(), entries: [entry(61, true), entry(62, false)] }));
  pool.failAt = 'before_status_update';
  await assert.rejects(() => draw(pool), /failure before status update/);
  assertions += 1;
  equal(pool.state.winners.get(42), [], 'pre-status failure leaves no winners');
  equal(pool.state.giveaways.get(42).winners_drawn_at, null, 'pre-status failure leaves draw marker empty');
}

// audit failure rolls back status and winners
{
  const pool = new FakePool(makeState({ giveaway: baseGiveaway(), entries: [entry(71, true), entry(72, false)] }));
  pool.failAt = 'audit';
  await assert.rejects(() => draw(pool), /audit failed/);
  assertions += 1;
  equal(pool.state.winners.get(42), [], 'audit failure rolls back winners');
  equal(pool.state.giveaways.get(42).status, 'ENDED', 'audit failure rolls back final status');
}

// manual and cron parity: actor/source differ, mechanism result does not
{
  const seedState = makeState({
    giveaway: baseGiveaway({ winners_count: 3 }),
    entries: [entry(81, true), entry(82, true), entry(83, false), entry(84, false)],
  });
  const cronPool = new FakePool(seedState);
  const manualPool = new FakePool(seedState);
  const cron = await draw(cronPool, { source: 'cron' });
  const manual = await draw(manualPool, { source: 'manual', actorUserId: 99 });
  equal(manual.winnersUserIds, cron.winnersUserIds, 'manual and cron produce identical winners');
  equal(manual.seed, cron.seed, 'manual and cron use the same durable seed');
  equal(manual.used_pool, cron.used_pool, 'manual and cron use the same pool semantics');
  const cronAudit = cronPool.state.audits.find((row) => row.action === 'gw.winners_drawn').payload;
  const manualAudit = manualPool.state.audits.find((row) => row.action === 'gw.winners_drawn').payload;
  equal(cronAudit.winners_hash, manualAudit.winners_hash, 'manual and cron audit the same winner hash');
  equal(cronAudit.snapshot_ts, manualAudit.snapshot_ts, 'manual and cron audit the same transaction snapshot in test');
}

// timed lazy end and draw share one transaction/audit trail
{
  const pool = new FakePool(makeState({
    giveaway: baseGiveaway({ status: 'ACTIVE', winners_count: 1, deadline_passed: true }),
    entries: [entry(91, true)],
  }));
  const result = await draw(pool, { source: 'manual', actorUserId: 101 });
  equal(result.status, 'drawn', 'past-deadline ACTIVE giveaway can lazy-end and draw atomically');
  equal(pool.state.giveaways.get(42).status, 'WINNERS_DRAWN', 'lazy end and draw finish in one final state');
  equal(pool.state.audits.map((row) => row.action), ['gw.ended_lazy', 'gw.winners_drawn'], 'lazy-end and draw receipts commit together');
  check(pool.state.audits.every((row) => row.actor_user_id === 101), 'same actor is preserved across both audit receipts');
}

// no entries -> audit skip, no fake winner state
{
  const pool = new FakePool(makeState({ giveaway: baseGiveaway(), entries: [] }));
  const result = await draw(pool, { source: 'manual', actorUserId: 7 });
  equal(result.status, 'no_entries', 'empty pool returns no_entries');
  equal(pool.state.giveaways.get(42).status, 'ENDED', 'empty pool does not mark giveaway drawn');
  equal(pool.state.winners.get(42), [], 'empty pool persists no winners');
  equal(pool.state.audits.at(-1).action, 'gw.winners_drawn_skipped', 'empty pool has durable skip audit');
}

// wrong status and workspace mismatch fail closed
{
  const wrongStatusPool = new FakePool(makeState({
    giveaway: baseGiveaway({ status: 'ACTIVE', deadline_passed: false }),
    entries: [entry(111, true)],
  }));
  const wrong = await draw(wrongStatusPool);
  equal(wrong.status, 'wrong_status', 'pre-deadline active giveaway cannot draw');
  equal(wrongStatusPool.state.winners.get(42), [], 'wrong status writes no winner');

  const mismatchPool = new FakePool(makeState({ giveaway: baseGiveaway(), entries: [entry(112, true)] }));
  const mismatch = await drawAndFinalizeGiveawayWinnersAtomicCore({
    pool: mismatchPool,
    giveawayId: 42,
    expectedWorkspaceId: 999,
    source: 'manual',
  });
  equal(mismatch.status, 'workspace_mismatch', 'workspace mismatch fails closed');
  equal(mismatchPool.state.winners.get(42), [], 'workspace mismatch writes no winner');
}

// sponsor replacement is transactional
{
  const pool = new FakePool(makeState({
    giveaway: baseGiveaway(),
    sponsors: [{ position: 1, sponsor_text: 'old' }],
  }));
  const result = await replaceGiveawaySponsorsAtomicCore({
    pool,
    giveawayId: 42,
    sponsorTexts: ['first', 'second'],
  });
  equal(result, { status: 'replaced', count: 2 }, 'sponsor replacement reports durable count');
  equal(pool.state.sponsors.get(42), [
    { position: 1, sponsor_text: 'first' },
    { position: 2, sponsor_text: 'second' },
  ], 'sponsors are replaced in order');

  const failing = new FakePool(makeState({
    giveaway: baseGiveaway(),
    sponsors: [{ position: 1, sponsor_text: 'old' }],
  }));
  failing.failAt = 'sponsor_insert';
  await assert.rejects(
    () => replaceGiveawaySponsorsAtomicCore({ pool: failing, giveawayId: 42, sponsorTexts: ['new'] }),
    /sponsor insert failed/
  );
  assertions += 1;
  equal(failing.state.sponsors.get(42), [{ position: 1, sponsor_text: 'old' }], 'failed sponsor replacement rolls back delete');
}

console.log(`✅ STEP588X2 giveaway critical-path tests: ${assertions} assertions PASS`);
