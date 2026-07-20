import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import { applyPaymentFulfillmentAtomic } from '../../src/bot/paymentFulfillmentCore.js';
import { drawAndFinalizeGiveawayWinnersAtomicCore } from '../../src/db/giveawayAtomicCore.js';
import { persistBroadcastSentOrUnknown } from '../../src/bot/broadcastDeliveryReceipt.js';

const { Pool } = pg;

function qIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function signPayload(prefix, cfg, token = 'abc123def0') {
  const sig = crypto.createHmac('sha256', cfg.PAYMENTS_PAYLOAD_HMAC_KEY)
    .update(`${prefix}${token}`).digest('hex').slice(0, cfg.PAYMENTS_PAYLOAD_HMAC_LEN);
  return `${prefix}${token}${sig}`;
}

class SchemaPool {
  constructor(connectionString, schema) {
    this.schema = schema;
    this.pool = new Pool({ connectionString, max: 8, allowExitOnIdle: true });
  }
  async connect() {
    const client = await this.pool.connect();
    await client.query(`set search_path to ${qIdent(this.schema)}, public`);
    return client;
  }
  async query(text, params = []) {
    const client = await this.connect();
    try { return await client.query(text, params); }
    finally { client.release(); }
  }
  async end() { await this.pool.end(); }
}

async function createSchema(db, connectionString, schema) {
  await db.query(`create schema ${qIdent(schema)}`);
  const p = new SchemaPool(connectionString, schema);
  await p.query(`
    create table users (
      id bigint primary key,
      brand_credits integer not null default 0,
      brand_credits_updated_at timestamptz,
      brand_plan text,
      brand_plan_until timestamptz,
      brand_plan_updated_at timestamptz,
      updated_at timestamptz not null default now()
    );
    create table payments (
      id bigint primary key,
      user_id bigint not null,
      kind text not null,
      invoice_payload text not null,
      total_amount bigint not null,
      currency text not null,
      telegram_payment_charge_id text,
      status text not null default 'RECEIVED',
      fulfillment_context jsonb,
      fulfillment_result jsonb,
      fulfillment_version text,
      applying_by_user_id bigint,
      applying_at timestamptz,
      applied_by_user_id bigint,
      applied_at timestamptz,
      note text,
      updated_at timestamptz not null default now()
    );
    create table payment_fulfillments (
      payment_id bigint primary key references payments(id),
      product_kind text not null,
      result jsonb not null,
      applied_by_user_id bigint,
      fulfillment_version text,
      applied_at timestamptz not null default now()
    );
    create table giveaways (
      id bigint primary key,
      workspace_id bigint not null,
      status text not null,
      winners_drawn_at timestamptz,
      winners_count integer not null,
      ends_at timestamptz,
      created_at timestamptz not null,
      updated_at timestamptz not null default now()
    );
    create table giveaway_entries (
      giveaway_id bigint not null,
      user_id bigint not null,
      is_eligible boolean not null default true,
      joined_at timestamptz not null default now(),
      primary key (giveaway_id, user_id)
    );
    create table giveaway_winners (
      giveaway_id bigint not null,
      user_id bigint not null,
      place integer not null,
      primary key (giveaway_id, user_id),
      unique (giveaway_id, place)
    );
    create table giveaway_audit (
      id bigserial primary key,
      giveaway_id bigint not null,
      workspace_id bigint not null,
      actor_user_id bigint,
      action text not null,
      payload jsonb not null,
      created_at timestamptz not null default now()
    );
    create table broadcast_sent_log (
      broadcast_id bigint not null,
      user_id bigint not null,
      status text not null,
      attempts integer not null default 0,
      delivery_attempt_id uuid,
      telegram_message_ids jsonb not null default '[]'::jsonb,
      last_error text,
      non_retryable boolean not null default false,
      delivery_unknown_at timestamptz,
      sent_at timestamptz,
      primary key (broadcast_id, user_id)
    );
  `);
  return p;
}

async function runPaymentProof(pool) {
  const cfg = Object.freeze({
    PAYMENTS_PAYLOAD_HMAC_KEY: 'critical-spine-payment-key',
    PAYMENTS_PAYLOAD_HMAC_LEN: 10,
    PAYMENTS_FALLBACK_ALLOW_UNSIGNED: false,
    BRAND_TOPUP_S_CREDITS: 10,
  });
  const payload = signPayload('brand_7_S_', cfg);
  const args = {
    paymentId: 1,
    paymentUserId: 7,
    invoicePayload: payload,
    appliedByUserId: 7,
    totalAmount: 25,
    currency: 'XTR',
    telegramPaymentChargeId: 'spine-charge-1',
    validation: { ok: true, kind: 'brand_pass', expected: 25, meta: { userId: 7, packId: 'S' } },
  };
  await pool.query(`insert into users(id, brand_credits) values (7,0)`);
  await pool.query(`insert into payments(id,user_id,kind,invoice_payload,total_amount,currency,telegram_payment_charge_id,status) values (1,7,'brand_pass',$1,25,'XTR','spine-charge-1','RECEIVED')`, [payload]);

  const results = await Promise.all(Array.from({ length: 4 }, () => applyPaymentFulfillmentAtomic(args, { pool, cfg, recordPaymentsPayloadIssue: async () => {} })));
  const row = (await pool.query(`select status, fulfillment_result from payments where id=1`)).rows[0];
  const user = (await pool.query(`select brand_credits from users where id=7`)).rows[0];
  const receipts = Number((await pool.query(`select count(*)::int as n from payment_fulfillments where payment_id=1`)).rows[0].n);
  assert.equal(row.status, 'APPLIED');
  assert.equal(Number(user.brand_credits), 10);
  assert.equal(receipts, 1);
  assert.equal(results.filter((r) => r.applied === true).length, 1);

  await pool.query(`insert into payments(id,user_id,kind,invoice_payload,total_amount,currency,telegram_payment_charge_id,status) values (2,7,'brand_pass',$1,25,'XTR','spine-charge-2','RECEIVED')`, [payload]);
  await pool.query(`create function fail_spine_receipt() returns trigger language plpgsql as $$ begin if new.payment_id = 2 then raise exception 'spine receipt failure'; end if; return new; end $$`);
  await pool.query(`create trigger trg_fail_spine_receipt before insert on payment_fulfillments for each row execute function fail_spine_receipt()`);
  const before = Number((await pool.query(`select brand_credits from users where id=7`)).rows[0].brand_credits);
  const failed = await applyPaymentFulfillmentAtomic({ ...args, paymentId: 2, telegramPaymentChargeId: 'spine-charge-2' }, { pool, cfg, recordPaymentsPayloadIssue: async () => {} });
  const after = Number((await pool.query(`select brand_credits from users where id=7`)).rows[0].brand_credits);
  const failedRow = (await pool.query(`select status from payments where id=2`)).rows[0];
  assert.equal(failed.applied, false);
  assert.equal(after, before);
  assert.equal(failedRow.status, 'RECEIVED');
  assert.equal(Number((await pool.query(`select count(*)::int as n from payment_fulfillments where payment_id=2`)).rows[0].n), 0);
  await pool.query(`drop trigger trg_fail_spine_receipt on payment_fulfillments; drop function fail_spine_receipt()`);

  await pool.query(`alter table payments rename to payments_unavailable`);
  const missing = await applyPaymentFulfillmentAtomic({ ...args, paymentId: 99 }, { pool, cfg, recordPaymentsPayloadIssue: async () => {} });
  assert.ok(['schema_not_ready', 'no_payment_row'].includes(missing.reason));
  assert.equal(Number((await pool.query(`select brand_credits from users where id=7`)).rows[0].brand_credits), 10);
  await pool.query(`alter table payments_unavailable rename to payments`);

  return { concurrentCalls: results.length, committedEffects: 1, rollbackInjection: true, missingLedgerFailClosed: true };
}

async function runGiveawayProof(pool) {
  const fixed = '2026-07-20T10:00:00.000Z';
  await pool.query(`insert into giveaways(id,workspace_id,status,winners_count,ends_at,created_at) values (42,9,'ENDED',3,$1,$1)`, [fixed]);
  await pool.query(`insert into giveaway_entries(giveaway_id,user_id,is_eligible,joined_at) values (42,81,true,$1),(42,82,true,$1),(42,83,false,$1),(42,84,false,$1)`, [fixed]);
  const results = await Promise.all([
    drawAndFinalizeGiveawayWinnersAtomicCore({ pool, giveawayId: 42, expectedWorkspaceId: 9, source: 'manual', actorUserId: 1 }),
    drawAndFinalizeGiveawayWinnersAtomicCore({ pool, giveawayId: 42, expectedWorkspaceId: 9, source: 'cron' }),
  ]);
  const winners = (await pool.query(`select user_id, place from giveaway_winners where giveaway_id=42 order by place`)).rows;
  assert.equal(winners.length, 3);
  assert.equal(new Set(winners.map((r) => String(r.user_id))).size, 3);
  assert.equal(Number((await pool.query(`select count(*)::int as n from giveaway_audit where giveaway_id=42 and action='gw.winners_drawn'`)).rows[0].n), 1);
  assert.ok(results.some((r) => r.status === 'drawn'));
  assert.ok(results.every((r) => ['drawn', 'locked', 'already_drawn'].includes(r.status)));

  await pool.query(`insert into giveaways(id,workspace_id,status,winners_count,ends_at,created_at) values (43,9,'ENDED',1,$1,$1)`, [fixed]);
  await pool.query(`insert into giveaway_entries(giveaway_id,user_id,is_eligible,joined_at) values (43,91,true,$1)`, [fixed]);
  await pool.query(`create function fail_spine_draw_audit() returns trigger language plpgsql as $$ begin if new.giveaway_id = 43 and new.action = 'gw.winners_drawn' then raise exception 'spine audit failure'; end if; return new; end $$`);
  await pool.query(`create trigger trg_fail_spine_draw_audit before insert on giveaway_audit for each row execute function fail_spine_draw_audit()`);
  await assert.rejects(() => drawAndFinalizeGiveawayWinnersAtomicCore({ pool, giveawayId: 43, source: 'manual' }), /spine audit failure/);
  assert.equal(Number((await pool.query(`select count(*)::int as n from giveaway_winners where giveaway_id=43`)).rows[0].n), 0);
  assert.equal((await pool.query(`select status from giveaways where id=43`)).rows[0].status, 'ENDED');
  await pool.query(`drop trigger trg_fail_spine_draw_audit on giveaway_audit; drop function fail_spine_draw_audit()`);
  return { concurrentDraw: true, singleWinnerSet: true, eligibleTopup: true, rollbackInjection: true };
}

function makeBroadcastDb(pool, mode) {
  return {
    async markBroadcastDeliverySent(broadcastId, userId, attemptId, messageIds) {
      if (mode === 'no_commit') throw new Error('receipt write failed');
      const row = (await pool.query(`update broadcast_sent_log set status='sent', non_retryable=true, telegram_message_ids=$4::jsonb, sent_at=now() where broadcast_id=$1 and user_id=$2 and delivery_attempt_id=$3::uuid returning *`, [broadcastId, userId, attemptId, JSON.stringify(messageIds)])).rows[0] || null;
      if (mode === 'ack_lost') throw new Error('ack lost after commit');
      return row;
    },
    async getBroadcastDeliveryReceipt(broadcastId, userId, attemptId) {
      return (await pool.query(`select * from broadcast_sent_log where broadcast_id=$1 and user_id=$2 and delivery_attempt_id=$3::uuid`, [broadcastId, userId, attemptId])).rows[0] || null;
    },
    async markBroadcastDeliveryUnknown(broadcastId, userId, attemptId, reason, messageIds) {
      return (await pool.query(`update broadcast_sent_log set status='delivery_unknown', non_retryable=true, last_error=$4, telegram_message_ids=$5::jsonb, delivery_unknown_at=now() where broadcast_id=$1 and user_id=$2 and delivery_attempt_id=$3::uuid returning *`, [broadcastId, userId, attemptId, reason, JSON.stringify(messageIds)])).rows[0] || null;
    },
  };
}

async function runBroadcastProof(pool) {
  const a1 = crypto.randomUUID();
  await pool.query(`insert into broadcast_sent_log(broadcast_id,user_id,status,delivery_attempt_id) values (10,7,'sending',$1)`, [a1]);
  const reconciled = await persistBroadcastSentOrUnknown({ db: makeBroadcastDb(pool, 'ack_lost'), broadcastId: 10, userId: 7, attemptId: a1, messageIds: [501], retries: 1, sleepFn: async () => {} });
  assert.equal(reconciled.state, 'sent');
  assert.equal((await pool.query(`select status from broadcast_sent_log where broadcast_id=10 and user_id=7`)).rows[0].status, 'sent');

  const a2 = crypto.randomUUID();
  await pool.query(`insert into broadcast_sent_log(broadcast_id,user_id,status,delivery_attempt_id) values (11,7,'sending',$1)`, [a2]);
  const unknown = await persistBroadcastSentOrUnknown({ db: makeBroadcastDb(pool, 'no_commit'), broadcastId: 11, userId: 7, attemptId: a2, messageIds: [601], retries: 2, sleepFn: async () => {} });
  assert.equal(unknown.state, 'delivery_unknown');
  const row = (await pool.query(`select status, non_retryable, telegram_message_ids from broadcast_sent_log where broadcast_id=11 and user_id=7`)).rows[0];
  assert.equal(row.status, 'delivery_unknown');
  assert.equal(row.non_retryable, true);
  assert.deepEqual(row.telegram_message_ids, [601]);
  return { ackLossReconciled: true, failedReceiptQuarantined: true, automaticResendPath: false };
}

export async function runPostgresSpine(connectionString) {
  const schema = `critical_spine_${process.pid}_${crypto.randomBytes(5).toString('hex')}`;
  const admin = new Pool({ connectionString, max: 2, allowExitOnIdle: true });
  let pool;
  try {
    pool = await createSchema(admin, connectionString, schema);
    const payments = await runPaymentProof(pool);
    const giveaways = await runGiveawayProof(pool);
    const broadcasts = await runBroadcastProof(pool);
    return { ok: true, capability: 'postgres', schema, payments, giveaways, broadcasts };
  } finally {
    if (pool) await pool.end().catch(() => {});
    await admin.query(`drop schema if exists ${qIdent(schema)} cascade`).catch(() => {});
    await admin.end().catch(() => {});
  }
}
