import { readQueryImplementationSource } from './lib/query-source-reader.js';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPaymentFulfillmentAtomic } from '../src/bot/paymentFulfillmentCore.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const CFG = Object.freeze({
  PAYMENTS_PAYLOAD_HMAC_KEY: 'step588x1-test-key',
  PAYMENTS_PAYLOAD_HMAC_LEN: 10,
  PAYMENTS_FALLBACK_ALLOW_UNSIGNED: false,
  PRO_DURATION_DAYS: 30,
  BRAND_TOPUP_S_CREDITS: 10,
  BRAND_TOPUP_M_CREDITS: 30,
  BRAND_TOPUP_L_CREDITS: 80,
  BRAND_PLAN_DURATION_DAYS: 30,
  BRAND_PLAN_START_CREDITS: 10,
  BRAND_PLAN_PRO_CREDITS: 50,
  MATCH_S_COUNT: 5,
  MATCH_M_COUNT: 15,
  MATCH_L_COUNT: 30,
  FOUNDER_BRAND_3M_CREDITS: 100,
  FOUNDER_BRAND_12M_CREDITS: 500,
});

function signPayload(prefix, token = 'abc123def0') {
  const sig = crypto
    .createHmac('sha256', CFG.PAYMENTS_PAYLOAD_HMAC_KEY)
    .update(`${prefix}${token}`)
    .digest('hex')
    .slice(0, CFG.PAYMENTS_PAYLOAD_HMAC_LEN);
  return `${prefix}${token}${sig}`;
}

function deepClone(value) {
  return structuredClone(value);
}

function normalizeSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

class FakePool {
  constructor(seed = {}) {
    this.state = {
      payments: new Map(),
      users: new Map(),
      workspaces: new Map(),
      workspaceSettings: new Map(),
      matchingRequests: [],
      featuredPlacements: [],
      receipts: new Map(),
      nextMatchingId: 1,
      nextFeaturedId: 1,
      ...seed,
    };
    this.failAt = '';
    this.connectError = null;
    this.lockedPayments = new Set();
    this.pauseProduct = false;
    this.productStarted = null;
    this.releaseProduct = null;
    this._productStartedResolve = null;
    this._releaseProductResolve = null;
  }

  armProductPause() {
    this.pauseProduct = true;
    this.productStarted = new Promise((resolve) => { this._productStartedResolve = resolve; });
    this.releaseProduct = new Promise((resolve) => { this._releaseProductResolve = resolve; });
  }

  resumeProduct() {
    if (this._releaseProductResolve) this._releaseProductResolve();
  }

  async query(sql, params = []) {
    const q = normalizeSql(sql);
    if (this.failAt === 'context' && q.startsWith('update payments set fulfillment_context')) {
      const error = new Error('missing fulfillment_context');
      error.code = '42703';
      throw error;
    }

    if (q.startsWith('update payments set fulfillment_context')) {
      const id = Number(params[0]);
      const row = this.state.payments.get(id);
      if (!row || String(row.status).toUpperCase() === 'APPLIED') return { rowCount: 0, rows: [] };
      row.fulfillment_context = { ...JSON.parse(String(params[1] || '{}')), ...(row.fulfillment_context || {}) };
      row.fulfillment_version = row.fulfillment_version || String(params[2] || '');
      return { rowCount: 1, rows: [{ fulfillment_context: deepClone(row.fulfillment_context) }] };
    }

    if (q.startsWith('select status, fulfillment_context from payments')) {
      const row = this.state.payments.get(Number(params[0]));
      return row ? { rowCount: 1, rows: [{ status: row.status, fulfillment_context: deepClone(row.fulfillment_context || {}) }] } : { rowCount: 0, rows: [] };
    }

    if (q.startsWith('select p.status, p.fulfillment_result, f.product_kind')) {
      const id = Number(params[0]);
      const row = this.state.payments.get(id);
      const receipt = this.state.receipts.get(id);
      if (!row) return { rowCount: 0, rows: [] };
      return {
        rowCount: 1,
        rows: [{
          status: row.status,
          fulfillment_result: deepClone(row.fulfillment_result || null),
          product_kind: receipt?.product_kind || null,
          receipt_result: deepClone(receipt?.result || null),
        }],
      };
    }

    throw new Error(`FakePool.query unsupported SQL: ${q}`);
  }

  async connect() {
    if (this.connectError) throw this.connectError;
    return new FakeClient(this);
  }
}

class FakeClient {
  constructor(pool) {
    this.pool = pool;
    this.tx = null;
    this.lockedPaymentId = 0;
  }

  async query(sql, params = []) {
    const q = normalizeSql(sql);
    if (q === 'begin') {
      this.tx = deepClone(this.pool.state);
      return { rowCount: 0, rows: [] };
    }
    if (q === 'rollback') {
      this._unlock();
      this.tx = null;
      return { rowCount: 0, rows: [] };
    }
    if (q === 'commit') {
      if (this.pool.failAt === 'commit') throw new Error('commit failure');
      this.pool.state = this.tx;
      this._unlock();
      this.tx = null;
      if (this.pool.failAt === 'commit_after_apply') throw new Error('commit acknowledgement lost');
      return { rowCount: 0, rows: [] };
    }

    if (!this.tx) throw new Error('query outside transaction');

    if (q.startsWith('select * from payments where id=$1 for update nowait')) {
      const id = Number(params[0]);
      if (this.pool.lockedPayments.has(id)) {
        const error = new Error('lock not available');
        error.code = '55P03';
        throw error;
      }
      this.pool.lockedPayments.add(id);
      this.lockedPaymentId = id;
      const row = this.tx.payments.get(id);
      return row ? { rowCount: 1, rows: [deepClone(row)] } : { rowCount: 0, rows: [] };
    }

    if (q.startsWith('select product_kind, result from payment_fulfillments')) {
      const receipt = this.tx.receipts.get(Number(params[0]));
      return receipt ? { rowCount: 1, rows: [deepClone(receipt)] } : { rowCount: 0, rows: [] };
    }

    if (q.startsWith("update payments set status='applying'")) {
      const row = this.tx.payments.get(Number(params[0]));
      if (!row) return { rowCount: 0, rows: [] };
      row.status = 'APPLYING';
      row.applying_by_user_id = params[1] ?? null;
      row.fulfillment_version = String(params[2] || '');
      return { rowCount: 1, rows: [] };
    }

    if (q.startsWith('select 1 from workspaces where id=$1 and owner_user_id=$2')) {
      const ws = this.tx.workspaces.get(Number(params[0]));
      return ws && Number(ws.owner_user_id) === Number(params[1]) ? { rowCount: 1, rows: [{ '?column?': 1 }] } : { rowCount: 0, rows: [] };
    }

    if (q.startsWith('insert into workspace_settings')) {
      await this._beforeProductMutation();
      const wsId = Number(params[0]);
      const days = Number(params[1]);
      const cur = this.tx.workspaceSettings.get(wsId) || { workspace_id: wsId, pro_days: 0 };
      cur.plan = 'pro';
      cur.pro_days = Number(cur.pro_days || 0) + days;
      this.tx.workspaceSettings.set(wsId, cur);
      return { rowCount: 1, rows: [{ workspace_id: wsId, pro_until: `+${cur.pro_days}d` }] };
    }

    if (q.startsWith('update users set brand_credits=brand_credits+$2')) {
      await this._beforeProductMutation();
      const user = this.tx.users.get(Number(params[0]));
      if (!user) return { rowCount: 0, rows: [] };
      user.brand_credits = Number(user.brand_credits || 0) + Number(params[1]);
      return { rowCount: 1, rows: [{ brand_credits: user.brand_credits }] };
    }

    if (q.startsWith("update users set brand_plan='pro'")) {
      await this._beforeProductMutation();
      const user = this.tx.users.get(Number(params[0]));
      if (!user) return { rowCount: 0, rows: [] };
      user.brand_plan = 'pro';
      user.brand_plan_days = Number(user.brand_plan_days || 0) + Number(params[1]);
      return { rowCount: 1, rows: [{ brand_credits: Number(user.brand_credits || 0) }] };
    }

    if (q.startsWith('update users set brand_plan=$2')) {
      await this._beforeProductMutation();
      const user = this.tx.users.get(Number(params[0]));
      if (!user) return { rowCount: 0, rows: [] };
      user.brand_plan = String(params[1]);
      user.brand_plan_days = Number(user.brand_plan_days || 0) + Number(params[2]);
      return { rowCount: 1, rows: [{ brand_plan: user.brand_plan, brand_plan_until: `+${user.brand_plan_days}d`, brand_credits: Number(user.brand_credits || 0) }] };
    }

    if (q.startsWith('insert into matching_requests')) {
      await this._beforeProductMutation();
      const id = this.tx.nextMatchingId++;
      this.tx.matchingRequests.push({ id, user_id: Number(params[0]), tier: String(params[1]), stars_paid: Number(params[2]), status: 'PAID' });
      return { rowCount: 1, rows: [{ id }] };
    }

    if (q.startsWith('insert into featured_placements')) {
      await this._beforeProductMutation();
      const id = this.tx.nextFeaturedId++;
      this.tx.featuredPlacements.push({ id, user_id: Number(params[0]), duration_days: Number(params[1]), stars_paid: Number(params[2]), status: 'WAIT_CONTENT' });
      return { rowCount: 1, rows: [{ id }] };
    }

    if (q.startsWith('insert into payment_fulfillments')) {
      if (this.pool.failAt === 'receipt') throw new Error('receipt failure');
      const id = Number(params[0]);
      if (this.tx.receipts.has(id)) {
        const error = new Error('duplicate receipt');
        error.code = '23505';
        throw error;
      }
      const receipt = { product_kind: String(params[1]), result: JSON.parse(String(params[2])), applied_by_user_id: params[3], fulfillment_version: String(params[4]) };
      this.tx.receipts.set(id, receipt);
      return { rowCount: 1, rows: [{ payment_id: id }] };
    }

    if (q.startsWith("update payments set status='applied'")) {
      if (this.pool.failAt === 'mark') throw new Error('mark applied failure');
      const row = this.tx.payments.get(Number(params[0]));
      if (!row) return { rowCount: 0, rows: [] };
      row.status = 'APPLIED';
      row.applied_by_user_id = params[1] ?? null;
      row.note = params[2] ?? row.note ?? null;
      row.fulfillment_result = JSON.parse(String(params[3]));
      row.fulfillment_version = String(params[4] || '');
      return { rowCount: 1, rows: [{ id: Number(params[0]) }] };
    }

    throw new Error(`FakeClient.query unsupported SQL: ${q}`);
  }

  async _beforeProductMutation() {
    if (this.pool.failAt === 'product') throw new Error('product mutation failure');
    if (this.pool.pauseProduct) {
      this.pool.pauseProduct = false;
      this.pool._productStartedResolve?.();
      await this.pool.releaseProduct;
    }
  }

  _unlock() {
    if (this.lockedPaymentId) this.pool.lockedPayments.delete(this.lockedPaymentId);
    this.lockedPaymentId = 0;
  }

  release() {
    this._unlock();
  }
}

function createPool({ payload, kind, amount, userId = 7, paymentId = 1, currency = 'XTR', chargeId = 'tg-charge-1' }) {
  return new FakePool({
    payments: new Map([[paymentId, {
      id: paymentId,
      user_id: userId,
      kind,
      invoice_payload: payload,
      currency,
      total_amount: amount,
      telegram_payment_charge_id: chargeId,
      status: 'RECEIVED',
      fulfillment_context: {},
      fulfillment_result: null,
    }]]),
    users: new Map([[userId, { id: userId, brand_credits: 0, brand_plan: null, brand_plan_days: 0 }]]),
    workspaces: new Map([[11, { id: 11, owner_user_id: userId }]]),
    workspaceSettings: new Map(),
    matchingRequests: [],
    featuredPlacements: [],
    receipts: new Map(),
    nextMatchingId: 1,
    nextFeaturedId: 1,
  });
}

function validation(kind, amount, meta) {
  return { ok: true, expected: amount, paid: amount, kind, meta };
}

function args({ payload, amount, userId = 7, paymentId = 1, validationValue, context = {}, chargeId = 'tg-charge-1' }) {
  return {
    paymentId,
    paymentUserId: userId,
    invoicePayload: payload,
    appliedByUserId: userId,
    totalAmount: amount,
    currency: 'XTR',
    telegramPaymentChargeId: chargeId,
    fulfillmentContext: context,
    validation: validationValue,
  };
}

async function apply(pool, applyArgs) {
  return applyPaymentFulfillmentAtomic(applyArgs, {
    pool,
    cfg: CFG,
    recordPaymentsPayloadIssue: async () => {},
  });
}

async function run() {
  let assertions = 0;
  const ok = (condition, message) => { assert.ok(condition, message); assertions += 1; };
  const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };

  // Source boundary: a missing canonical payments ledger may never look like success.
  {
    const queriesSource = readQueryImplementationSource();
    const starsSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'payments', 'starsHandlers.js'), 'utf8');
    const migrationSource = fs.readFileSync(path.join(ROOT, 'migrations', '048_payment_fulfillment_atomicity.sql'), 'utf8');
    const reconcileSource = fs.readFileSync(path.join(ROOT, 'migration_pack', '01_reconcile.sql'), 'utf8');
    ok(queriesSource.includes("return { inserted: false, reason: 'missing_fields', ledger: 'unavailable' };"), 'missing payment fields must fail closed');
    ok(queriesSource.includes("return { inserted: false, reason: 'missing_table', ledger: 'missing_table' };"), 'missing payments table must fail closed');
    ok(starsSource.includes("await notifyPayOps('payment_ledger_unavailable'"), 'direct Stars flow must alert on ledger failure');
    ok(!starsSource.includes('await db.markPaymentApplied('), 'direct Stars handler must not mark APPLIED outside the canonical transaction');
    ok(starsSource.includes('db.setPaymentStatusIfNotApplied('), 'post-failure status writes must not regress APPLIED');
    ok(queriesSource.includes("and status <> 'APPLIED'"), 'safe status helper must never overwrite APPLIED');
    ok(migrationSource.includes('CREATE TABLE IF NOT EXISTS payment_fulfillments'), 'migration must create durable fulfillment receipts');
    ok(migrationSource.includes("'RECEIVED','APPLYING','APPLIED','ORPHANED','ERROR'"), 'migration must make APPLYING schema-valid');
    ok(reconcileSource.includes('STEP588X1'), 'reconcile pack must include STEP588X1 schema repair');
  }

  // 1) Validation proof is mandatory before any ledger or product mutation.
  {
    const payload = signPayload('brand_7_S_');
    const pool = createPool({ payload, kind: 'brand_pass', amount: 25 });
    const result = await apply(pool, args({ payload, amount: 25, validationValue: null }));
    equal(result.reason, 'validation_required');
    equal(pool.state.users.get(7).brand_credits, 0);
    equal(pool.state.payments.get(1).status, 'RECEIVED');
  }

  // 2) Missing migration/schema fails closed before product mutation.
  {
    const payload = signPayload('brand_7_S_');
    const pool = createPool({ payload, kind: 'brand_pass', amount: 25 });
    pool.failAt = 'context';
    const result = await apply(pool, args({ payload, amount: 25, validationValue: validation('brand_pass', 25, { userId: 7, packId: 'S' }) }));
    equal(result.reason, 'schema_not_ready');
    equal(pool.state.users.get(7).brand_credits, 0);
    equal(pool.state.receipts.size, 0);
  }

  // 3) Credits, receipt and APPLIED commit exactly once; replay is idempotent.
  {
    const payload = signPayload('brand_7_S_');
    const pool = createPool({ payload, kind: 'brand_pass', amount: 25 });
    const applyArgs = args({ payload, amount: 25, validationValue: validation('brand_pass', 25, { userId: 7, packId: 'S' }) });
    const first = await apply(pool, applyArgs);
    ok(first.applied, 'first brand-pass apply must commit');
    equal(pool.state.users.get(7).brand_credits, 10);
    equal(pool.state.payments.get(1).status, 'APPLIED');
    equal(pool.state.receipts.size, 1);

    const replay = await apply(pool, applyArgs);
    equal(replay.reason, 'already_applied');
    equal(pool.state.users.get(7).brand_credits, 10);
    equal(pool.state.receipts.size, 1);
  }

  // 4) Failure after product mutation but before APPLIED rolls back product and receipt.
  {
    const payload = signPayload('brand_7_S_');
    const pool = createPool({ payload, kind: 'brand_pass', amount: 25 });
    pool.failAt = 'mark';
    const result = await apply(pool, args({ payload, amount: 25, validationValue: validation('brand_pass', 25, { userId: 7, packId: 'S' }) }));
    equal(result.reason, 'db_tx_failed');
    equal(pool.state.users.get(7).brand_credits, 0);
    equal(pool.state.payments.get(1).status, 'RECEIVED');
    equal(pool.state.receipts.size, 0);
    equal(pool.state.payments.get(1).fulfillment_context.validatedKind, 'brand_pass');
  }

  // 5) Concurrent attempts cannot create two product effects.
  {
    const payload = signPayload('brand_7_S_');
    const pool = createPool({ payload, kind: 'brand_pass', amount: 25 });
    pool.armProductPause();
    const applyArgs = args({ payload, amount: 25, validationValue: validation('brand_pass', 25, { userId: 7, packId: 'S' }) });
    const firstPromise = apply(pool, applyArgs);
    await pool.productStarted;
    const second = await apply(pool, applyArgs);
    equal(second.reason, 'locked');
    pool.resumeProduct();
    const first = await firstPromise;
    ok(first.applied, 'locked winner must commit');
    equal(pool.state.users.get(7).brand_credits, 10);
    equal(pool.state.receipts.size, 1);
  }

  // 6) Fresh APPLYING is not reclaimed; stale APPLYING is recoverable.
  {
    const payload = signPayload('brand_7_S_');
    const freshPool = createPool({ payload, kind: 'brand_pass', amount: 25 });
    freshPool.state.payments.get(1).status = 'APPLYING';
    freshPool.state.payments.get(1).applying_at = new Date();
    const applyArgs = args({ payload, amount: 25, validationValue: validation('brand_pass', 25, { userId: 7, packId: 'S' }) });
    const fresh = await apply(freshPool, applyArgs);
    equal(fresh.reason, 'applying_in_progress');
    equal(freshPool.state.users.get(7).brand_credits, 0);

    const stalePool = createPool({ payload, kind: 'brand_pass', amount: 25 });
    stalePool.state.payments.get(1).status = 'APPLYING';
    stalePool.state.payments.get(1).applying_at = new Date(Date.now() - 21 * 60 * 1000);
    const stale = await apply(stalePool, applyArgs);
    ok(stale.applied, 'stale APPLYING must be reclaimable');
    equal(stalePool.state.users.get(7).brand_credits, 10);
  }

  // 7) Matching and featured rows share the same atomic receipt path.
  {
    const matchPayload = signPayload('match_7_S_');
    const matchPool = createPool({ payload: matchPayload, kind: 'matching', amount: 40 });
    const matchResult = await apply(matchPool, args({ payload: matchPayload, amount: 40, validationValue: validation('matching', 40, { userId: 7, tierId: 'S' }) }));
    ok(matchResult.applied, 'matching apply must commit');
    equal(matchPool.state.matchingRequests.length, 1);
    equal(matchPool.state.receipts.size, 1);

    const featPayload = signPayload('feat_7_7_');
    const featPool = createPool({ payload: featPayload, kind: 'featured', amount: 50 });
    const featResult = await apply(featPool, args({ payload: featPayload, amount: 50, validationValue: validation('featured', 50, { userId: 7, days: 7 }) }));
    ok(featResult.applied, 'featured apply must commit');
    equal(featPool.state.featuredPlacements.length, 1);
    equal(featPool.state.receipts.size, 1);
  }

  // 8) Creator PRO and Brand Plan are committed through the same service.
  {
    const proPayload = signPayload('pro_11_7_');
    const proPool = createPool({ payload: proPayload, kind: 'pro', amount: 99 });
    const proResult = await apply(proPool, args({ payload: proPayload, amount: 99, validationValue: validation('pro', 99, { wsId: 11, userId: 7 }) }));
    ok(proResult.applied, 'PRO apply must commit');
    equal(proPool.state.workspaceSettings.get(11).pro_days, 30);

    const planPayload = signPayload('bplan_7_pro_');
    const planPool = createPool({ payload: planPayload, kind: 'brand_plan', amount: 120 });
    const planResult = await apply(planPool, args({ payload: planPayload, amount: 120, validationValue: validation('brand_plan', 120, { userId: 7, plan: 'pro' }) }));
    ok(planResult.applied, 'Brand Plan apply must commit');
    equal(planPool.state.users.get(7).brand_plan, 'pro');
    equal(planPool.state.users.get(7).brand_credits, 50);
  }

  // 9) Founder creator requires durable workspace context; missing context fails closed.
  {
    const payload = signPayload('founder_creator_12m_7_');
    const pool = createPool({ payload, kind: 'founder', amount: 500 });
    const result = await apply(pool, args({ payload, amount: 500, validationValue: validation('founder', 500, { userId: 7, productId: 'founder_creator_12m' }) }));
    equal(result.reason, 'missing_context');
    equal(pool.state.payments.get(1).status, 'RECEIVED');
    equal(pool.state.receipts.size, 0);
  }

  // 10) Ledger amount/currency/kind and Telegram charge remain bound to the product effect.
  {
    const payload = signPayload('brand_7_S_');
    const amountPool = createPool({ payload, kind: 'brand_pass', amount: 24 });
    const amountResult = await apply(amountPool, args({ payload, amount: 25, validationValue: validation('brand_pass', 25, { userId: 7, packId: 'S' }) }));
    equal(amountResult.reason, 'ledger_amount_mismatch');
    equal(amountPool.state.users.get(7).brand_credits, 0);

    const chargePool = createPool({ payload, kind: 'brand_pass', amount: 25, chargeId: 'charge-a' });
    const chargeResult = await apply(chargePool, args({ payload, amount: 25, chargeId: 'charge-b', validationValue: validation('brand_pass', 25, { userId: 7, packId: 'S' }) }));
    equal(chargeResult.reason, 'charge_id_mismatch');
    equal(chargePool.state.users.get(7).brand_credits, 0);
  }

  // 11) Commit acknowledgement loss is reconciled from the durable payment + receipt pair.
  {
    const payload = signPayload('brand_7_S_');
    const pool = createPool({ payload, kind: 'brand_pass', amount: 25 });
    pool.failAt = 'commit_after_apply';
    const result = await apply(pool, args({ payload, amount: 25, validationValue: validation('brand_pass', 25, { userId: 7, packId: 'S' }) }));
    ok(result.applied, 'committed transaction must reconcile after lost commit acknowledgement');
    ok(result.commitReconciled, 'commit reconciliation marker must be returned');
    equal(pool.state.users.get(7).brand_credits, 10);
    equal(pool.state.payments.get(1).status, 'APPLIED');
    equal(pool.state.receipts.size, 1);
  }

  // 12) A commit attempt without durable evidence remains unknown, never reported as safely rolled back.
  {
    const payload = signPayload('brand_7_S_');
    const pool = createPool({ payload, kind: 'brand_pass', amount: 25 });
    pool.failAt = 'commit';
    const result = await apply(pool, args({ payload, amount: 25, validationValue: validation('brand_pass', 25, { userId: 7, packId: 'S' }) }));
    equal(result.reason, 'commit_unknown');
    equal(pool.state.users.get(7).brand_credits, 0);
    equal(pool.state.payments.get(1).status, 'RECEIVED');
    equal(pool.state.receipts.size, 0);
  }

  // 13) First durable recovery context wins on key conflicts; later calls may only fill missing keys.
  {
    const payload = signPayload('founder_creator_12m_7_');
    const pool = createPool({ payload, kind: 'founder', amount: 500 });
    const validationValue = validation('founder', 500, { userId: 7, productId: 'founder_creator_12m' });
    pool.state.payments.get(1).fulfillment_context = { wsId: 11, durationDays: 365 };
    const result = await apply(pool, args({ payload, amount: 500, validationValue, context: { wsId: 999, durationDays: 1 } }));
    ok(result.applied, 'existing durable founder context must remain usable');
    equal(result.wsId, 11);
    equal(result.days, 365);
  }

  // 14) A missing DB adapter is a hard fail-closed condition.
  {
    const payload = signPayload('brand_7_S_');
    const result = await applyPaymentFulfillmentAtomic(
      args({ payload, amount: 25, validationValue: validation('brand_pass', 25, { userId: 7, packId: 'S' }) }),
      { pool: null, cfg: CFG, recordPaymentsPayloadIssue: async () => {} },
    );
    equal(result.reason, 'ledger_unavailable');
  }

  console.log(`PASS payment fulfillment critical-path tests (${assertions} assertions)`);
}

run().catch((error) => {
  console.error('FAIL payment fulfillment critical-path tests');
  console.error(error?.stack || error);
  process.exit(1);
});
