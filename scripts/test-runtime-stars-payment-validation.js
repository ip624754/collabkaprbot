#!/usr/bin/env node

import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const STUB_MODULES = new Map([
  ['grammy', `
export class Bot {
  constructor() { this.api = {}; }
  use() {}
  catch() {}
  on() {}
  command() {}
  callbackQuery() {}
  chatType() { return this; }
  filter() { return this; }
  hears() {}
}
export class InlineKeyboard {
  text() { return this; }
  row() { return this; }
  url() { return this; }
}
export class InputFile {
  constructor(...args) { this.args = args; }
}
`],
  ['@upstash/redis', `
export class Redis {
  constructor() {}
  async get() { return null; }
  async set() { return 'OK'; }
  async del() { return 1; }
  async ttl() { return -2; }
  async expire() { return 1; }
  async eval() { return null; }
  async incr() { return 1; }
  async sadd() { return 1; }
  async scard() { return 0; }
  async lpush() { return 1; }
  async ltrim() { return 'OK'; }
  async llen() { return 0; }
  async lrange() { return []; }
  async zadd() { return 1; }
  async zremrangebyscore() { return 0; }
  async zcard() { return 0; }
  async getdel() { return null; }
  async hgetall() { return {}; }
  async hset() { return 1; }
  async hincrby() { return 1; }
  async keys() { return []; }
  async mget(keys) { return Array.isArray(keys) ? keys.map(() => null) : []; }
  pipeline() { return { exec: async () => [] }; }
}
`],
  ['pg', `
class Pool {
  constructor() {}
  on() {}
  async connect() {
    return {
      query: async () => ({ rows: [], rowCount: 0 }),
      release() {},
    };
  }
  async query() {
    return { rows: [], rowCount: 0 };
  }
}
export default { Pool };
`],
  ['pino', `
function pino() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
    child() { return this; },
  };
}
pino.stdTimeFunctions = {
  isoTime() { return new Date().toISOString(); },
};
export default pino;
`],
  ['dotenv/config', 'export {};'],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (STUB_MODULES.has(specifier)) {
      return {
        url: `data:text/javascript,${encodeURIComponent(STUB_MODULES.get(specifier))}`,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

Object.assign(process.env, {
  APP_ENV: process.env.APP_ENV || 'test',
  BOT_TOKEN: process.env.BOT_TOKEN || 'test-token',
  BOT_USERNAME: process.env.BOT_USERNAME || 'collabka_test_bot',
  BOT_ID: process.env.BOT_ID || '1',
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://localhost/test',
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || 'https://example.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || 'test-token',
  PAYMENTS_PAYLOAD_HMAC_KEY: process.env.PAYMENTS_PAYLOAD_HMAC_KEY || 'x'.repeat(40),
  PRO_STARS_PRICE: process.env.PRO_STARS_PRICE || '500',
  BRAND_TOPUP_S_PRICE: process.env.BRAND_TOPUP_S_PRICE || '150',
  BRAND_TOPUP_S_CREDITS: process.env.BRAND_TOPUP_S_CREDITS || '10',
  BRAND_TOPUP_M_PRICE: process.env.BRAND_TOPUP_M_PRICE || '300',
  BRAND_TOPUP_M_CREDITS: process.env.BRAND_TOPUP_M_CREDITS || '30',
  BRAND_TOPUP_L_PRICE: process.env.BRAND_TOPUP_L_PRICE || '900',
  BRAND_TOPUP_L_CREDITS: process.env.BRAND_TOPUP_L_CREDITS || '100',
  BRAND_PLAN_START_PRICE: process.env.BRAND_PLAN_START_PRICE || '400',
  BRAND_PLAN_START_CREDITS: process.env.BRAND_PLAN_START_CREDITS || '25',
  BRAND_PLAN_PRO_PRICE: process.env.BRAND_PLAN_PRO_PRICE || '900',
  BRAND_PLAN_PRO_CREDITS: process.env.BRAND_PLAN_PRO_CREDITS || '75',
  MATCH_S_PRICE: process.env.MATCH_S_PRICE || '120',
  MATCH_S_COUNT: process.env.MATCH_S_COUNT || '5',
  MATCH_M_PRICE: process.env.MATCH_M_PRICE || '240',
  MATCH_M_COUNT: process.env.MATCH_M_COUNT || '15',
  MATCH_L_PRICE: process.env.MATCH_L_PRICE || '480',
  MATCH_L_COUNT: process.env.MATCH_L_COUNT || '40',
  FEATURED_1D_PRICE: process.env.FEATURED_1D_PRICE || '50',
  FEATURED_7D_PRICE: process.env.FEATURED_7D_PRICE || '250',
  FEATURED_30D_PRICE: process.env.FEATURED_30D_PRICE || '700',
  OFFICIAL_1D_PRICE: process.env.OFFICIAL_1D_PRICE || '100',
  OFFICIAL_7D_PRICE: process.env.OFFICIAL_7D_PRICE || '500',
  OFFICIAL_30D_PRICE: process.env.OFFICIAL_30D_PRICE || '1500',
  FOUNDER_BRAND_3M_PRICE: process.env.FOUNDER_BRAND_3M_PRICE || '1111',
  FOUNDER_BRAND_12M_PRICE: process.env.FOUNDER_BRAND_12M_PRICE || '2222',
  FOUNDER_CREATOR_12M_PRICE: process.env.FOUNDER_CREATOR_12M_PRICE || '3333',
});

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { _validateStarsPaymentStrict } = await import(pathToFileURL(path.join(root, 'src', 'bot', 'bot.js')).href);

async function expectOk(args, expected) {
  const res = await _validateStarsPaymentStrict(args);
  assert.equal(res.ok, true, `expected OK for ${args.payload}, got ${JSON.stringify(res)}`);
  assert.equal(res.kind, expected.kind, `kind mismatch for ${args.payload}`);
  assert.equal(res.expected, expected.amount, `amount mismatch for ${args.payload}`);
  if (expected.meta) {
    for (const [k, v] of Object.entries(expected.meta)) {
      assert.deepEqual(res.meta?.[k], v, `meta.${k} mismatch for ${args.payload}`);
    }
  }
}

async function expectFail(args, reason, extra = {}) {
  const res = await _validateStarsPaymentStrict(args);
  assert.equal(res.ok, false, `expected failure for ${args.payload}, got ${JSON.stringify(res)}`);
  assert.equal(res.reason, reason, `reason mismatch for ${args.payload}`);
  for (const [k, v] of Object.entries(extra)) {
    assert.deepEqual(res[k], v, `field ${k} mismatch for ${args.payload}`);
  }
}

await expectOk(
  { payload: 'pro_123_456_tok', currency: 'XTR', totalAmount: 500, payerUserId: 456 },
  { kind: 'pro', amount: 500, meta: { wsId: 123, userId: 456 } }
);
await expectFail(
  { payload: 'pro_123_456_tok', currency: 'XTR', totalAmount: 500, payerUserId: 999 },
  'payer_mismatch',
  { expected: 500, kind: 'pro' }
);
await expectOk(
  { payload: 'brand_77_S_tok', currency: 'XTR', totalAmount: 150, payerUserId: 77 },
  { kind: 'brand_pass', amount: 150, meta: { userId: 77, packId: 'S' } }
);
await expectOk(
  { payload: 'brand_77_30_tok', currency: 'XTR', totalAmount: 300, payerUserId: 77 },
  { kind: 'brand_pass', amount: 300, meta: { userId: 77, packId: 'M', legacyCreditsToken: true, legacyCredits: 30 } }
);
await expectOk(
  { payload: 'bplan_77_basic_tok', currency: 'XTR', totalAmount: 400, payerUserId: 77 },
  { kind: 'brand_plan', amount: 400, meta: { userId: 77, plan: 'start' } }
);
await expectOk(
  { payload: 'match_77_M_tok', currency: 'XTR', totalAmount: 240, payerUserId: 77 },
  { kind: 'matching', amount: 240, meta: { userId: 77, tierId: 'M' } }
);
await expectOk(
  { payload: 'feat_77_7_tok', currency: 'XTR', totalAmount: 250, payerUserId: 77 },
  { kind: 'featured', amount: 250, meta: { userId: 77, days: 7 } }
);
await expectOk(
  { payload: 'offpub_77_555_30_tok', currency: 'XTR', totalAmount: 1500, payerUserId: 77 },
  { kind: 'official_publish', amount: 1500, meta: { userId: 77, offerId: 555, days: 30 } }
);
await expectOk(
  { payload: 'founder_brand_3m_77_tok', currency: 'XTR', totalAmount: 1111, payerUserId: 77 },
  { kind: 'founder', amount: 1111, meta: { productId: 'founder_brand_3m', userId: 77 } }
);
await expectFail(
  { payload: 'offpub_77_555_30_tok', currency: 'USD', totalAmount: 1500, payerUserId: 77 },
  'bad_currency',
  { kind: 'official_publish' }
);
await expectFail(
  { payload: 'offpub_77_555_30_tok', currency: 'XTR', totalAmount: 999, payerUserId: 77 },
  'amount_mismatch',
  { expected: 1500, kind: 'official_publish', paid: 999 }
);
await expectFail(
  { payload: 'offpub_77_555_30_bad!sig', currency: 'XTR', totalAmount: 1500, payerUserId: 77 },
  'bad_payload_chars',
  { kind: 'official_publish' }
);

console.log('✅ runtime-grade stars payment validation integration OK');
