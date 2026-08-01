import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const bot = read('src/bot/bot.js');
const actions = read('src/bot/domains/payments/actions.js');
const callbacks = read('src/bot/domains/payments/callbacks.js');
const route = read('src/bot/domains/payments/route.js');
const ownership = read('src/bot/router/callbackOwnership.js');
const contracts = read('src/bot/router/callbackContracts.js');
const core = read('src/bot/paymentFulfillmentCore.js');

assert.ok(actions.includes("FOUNDER_BUY: 'a:founder_buy'"), 'founder payment action owned by domain');
assert.ok(actions.includes("WORKSPACE_PRO_BUY: 'a:ws_pro_buy'"), 'workspace PRO payment action owned by domain');
assert.ok(actions.includes("BRAND_CREDITS_BUY: 'a:brand_buy'"), 'brand credits action owned by domain');
assert.ok(actions.includes("BRAND_PLAN_BUY: 'a:brand_plan_buy'"), 'brand plan action owned by domain');
assert.ok(actions.includes("MATCHING_BUY: 'a:match_buy'"), 'matching action owned by domain');
assert.ok(actions.includes("FEATURED_BUY: 'a:feat_buy'"), 'featured action owned by domain');
assert.ok(actions.includes("ADMIN_LEDGER_APPLY: 'a:admin_pay_apply'"), 'admin apply action owned by domain');
assert.ok(actions.includes("ADMIN_LEDGER_AUTOHEAL: 'a:admin_pay_autoheal'"), 'admin autoheal action owned by domain');
assert.ok(route.includes('CALLBACK_ROUTE.PAYMENT_PURCHASE'), 'purchase route descriptor published');
assert.ok(route.includes('CALLBACK_ROUTE.PAYMENT_ADMIN'), 'admin payment route descriptor published');
assert.ok(ownership.includes('PAYMENT_CALLBACK_ROUTE_DEFINITIONS'), 'ownership registry consumes payment routes');
assert.ok(contracts.includes("PAYMENT_PURCHASE: 'payment_purchase'"), 'purchase route ID canonical');
assert.ok(contracts.includes("PAYMENT_ADMIN: 'payment_admin'"), 'admin payment route ID canonical');
assert.ok(bot.includes("from './domains/payments/index.js'"), 'composition root imports payment domain');
assert.ok(bot.includes('payment_purchase: (ctx2, p2, u2) => handlePaymentPurchaseCallback'), 'purchase route reachable from router');
assert.ok(bot.includes('payment_admin: (ctx2, p2, u2) => handlePaymentAdminCallback'), 'admin payment route reachable from router');
for (const action of [
  'a:founder_buy', 'a:ws_pro_buy', 'a:brand_buy', 'a:brand_plan_buy', 'a:match_buy', 'a:feat_buy',
  'a:admin_pay_accept_toggle', 'a:admin_pay_auto_toggle', 'a:admin_pay_fb', 'a:admin_pay_fb_set',
  'a:admin_pay_fb_off', 'a:admin_matchfeat_auto_toggle', 'a:admin_payments', 'a:admin_pay_view',
  'a:admin_pay_apply', 'a:admin_pay_autoheal',
]) {
  assert.equal(bot.includes(`if (p.a === '${action}')`), false, `legacy inline branch removed: ${action}`);
}
assert.equal(callbacks.includes("from 'grammy'"), false, 'payment domain transport adapter stays framework-independent');
assert.equal(callbacks.includes("../db/queries"), false, 'payment domain does not import DB monolith');
assert.equal(callbacks.includes('paymentFulfillmentCore'), false, 'payment domain does not duplicate fulfillment core');
assert.ok(callbacks.includes('signStarsInvoiceToken'), 'invoice payload signing stays explicit');
assert.ok(callbacks.includes('PAYMENT_SESSION_TTL_SEC'), 'payment recovery session TTL preserved');
assert.ok(core.includes('applyPaymentFulfillmentAtomic'), 'canonical atomic fulfillment core remains present');

console.log('PASS STEP590C2 payment bounded-domain source contract');
