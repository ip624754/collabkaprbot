import assert from 'node:assert/strict';
import {
  PAYMENT_ACTION,
  PAYMENT_ADMIN_ACTIONS,
  PAYMENT_CALLBACK_ACTIONS,
  PAYMENT_PURCHASE_ACTIONS,
  PAYMENT_ADMIN_ROUTE_DEFINITION,
  PAYMENT_PURCHASE_ROUTE_DEFINITION,
  handlePaymentAdminCallback,
  handlePaymentPurchaseCallback,
  isPaymentAdminAction,
  isPaymentCallbackAction,
  isPaymentPurchaseAction,
} from '../src/bot/domains/payments/index.js';
import { CALLBACK_PHASE, CALLBACK_ROUTE } from '../src/bot/router/callbackContracts.js';
import { getCallbackOwnership, summarizeCallbackOwnership } from '../src/bot/router/callbackOwnership.js';
import { CALLBACK_DISPATCH_STATUS, dispatchOwnedCallback } from '../src/bot/router/callbackRouter.js';

let assertions = 0;
function check(value, message) { assert.ok(value, message); assertions += 1; }
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
async function rejects(fn, pattern, message) { await assert.rejects(fn, pattern, message); assertions += 1; }

function makeCtx(actorTgId = 123456789, username = 'operator') {
  const events = [];
  return {
    from: { id: actorTgId, username },
    events,
    answerCallbackQuery: async (payload) => { events.push({ type: 'answer', payload }); },
  };
}

function makePurchaseDeps(overrides = {}) {
  const sessions = [];
  const invoices = [];
  const deps = {
    getPaymentsRuntimeFlags: async () => ({ accept: true, autoApply: true }),
    getFounderSaleState: async () => ({ active: true, products: [] }),
    renderFounderSale: async () => {},
    ensureWorkspaceForOwner: async () => ({ id: 77 }),
    randomToken: () => 'abcdefghij',
    signStarsInvoiceToken: (prefix, token) => `${token}sig`,
    redis: { set: async (...args) => { sessions.push(args); } },
    key: (parts) => parts.join(':'),
    cfg: {
      PAYMENT_SESSION_TTL_SEC: 600,
      PRO_DURATION_DAYS: 30,
      BARTER_MAX_ACTIVE_OFFERS_PRO: 25,
      BARTER_BUMP_COOLDOWN_HOURS_PRO: 24,
      PRO_STARS_PRICE: 100,
      BRAND_PLAN_DURATION_DAYS: 30,
    },
    sendStarsInvoice: async (_ctx, invoice) => { invoices.push(invoice); return true; },
    monetizationLabels: {
      CREATOR_PRO: 'Creator PRO',
      BRAND_CREDITS: 'Brand Credits',
      BRAND_PLAN: 'Brand Plan',
      MATCHING: 'Matching',
      FEATURED: 'Featured',
    },
    db: { getWorkspace: async () => ({ id: 55 }) },
    answerRecovery: async () => {},
    resolveBxHomeFromUi: async (_ctx, _ws, _raw, fallback) => fallback,
    bxHome: { BX_OPEN: 'bo', MENU: 'mn' },
    getBrandPack: () => ({ id: 'S', credits: 10, stars: 50 }),
    brandPlans: [{ id: 'start', title: 'Start', stars: 300, credits: 20 }],
    matchTiers: [{ id: 'S', title: 'Start', stars: 70, count: 5 }],
    featuredDurations: [{ id: '1d', title: '1 day', days: 1, stars: 80 }],
    ruPlural: (_n, one) => one,
    cbJoin: (base, params) => `${base}|${Object.entries(params).map(([k, v]) => `${k}:${v}`).join('|')}`,
    sessions,
    invoices,
    ...overrides,
  };
  return deps;
}

function makeAdminDeps(overrides = {}) {
  const calls = [];
  return {
    isAdmin: () => true,
    getOperatorControlSnapshot: async () => ({ byId: { pay_accept: { value: true }, pay_auto_apply: { value: false }, matchfeat_auto_apply: { value: true } } }),
    setOperatorControlToggle: async (...args) => { calls.push(['toggle', ...args]); },
    renderAdminSystem: async () => { calls.push(['render_system']); },
    renderAdminPaymentsFallback: async (...args) => { calls.push(['render_fallback', ...args]); },
    setPaymentsFallbackRuntime: async (input) => ({ ok: true, ttlSec: input.ttlSec || 0 }),
    appendOperatorControlAudit: async (input) => { calls.push(['audit', input]); },
    fmtWait: (sec) => `${sec}s`,
    clearExpectText: async (tgId) => { calls.push(['clear_expect', tgId]); },
    renderAdminPayments: async (...args) => { calls.push(['render_payments', ...args]); },
    renderAdminPaymentView: async (...args) => { calls.push(['render_payment_view', ...args]); },
    adminApplyPayment: async (...args) => { calls.push(['apply', ...args]); },
    adminAutoHealPayments: async (...args) => { calls.push(['autoheal', ...args]); },
    calls,
    ...overrides,
  };
}

// Domain action ownership.
equal(PAYMENT_PURCHASE_ACTIONS.length, 6, 'six direct Stars purchase actions extracted');
equal(PAYMENT_ADMIN_ACTIONS.length, 10, 'ten payment admin actions extracted');
equal(PAYMENT_CALLBACK_ACTIONS.length, 16, 'payment domain owns sixteen actions');
equal(new Set(PAYMENT_CALLBACK_ACTIONS).size, 16, 'payment actions are unique');
check(Object.isFrozen(PAYMENT_ACTION), 'payment action map frozen');
check(Object.isFrozen(PAYMENT_PURCHASE_ACTIONS), 'purchase action list frozen');
check(Object.isFrozen(PAYMENT_ADMIN_ACTIONS), 'admin action list frozen');
equal(PAYMENT_PURCHASE_ROUTE_DEFINITION.id, CALLBACK_ROUTE.PAYMENT_PURCHASE, 'purchase route ID canonical');
equal(PAYMENT_PURCHASE_ROUTE_DEFINITION.phase, CALLBACK_PHASE.POST_USER, 'purchase route is post-user');
equal(PAYMENT_ADMIN_ROUTE_DEFINITION.id, CALLBACK_ROUTE.PAYMENT_ADMIN, 'admin payment route ID canonical');
equal(PAYMENT_ADMIN_ROUTE_DEFINITION.phase, CALLBACK_PHASE.POST_USER, 'admin payment route is post-user');
for (const action of PAYMENT_PURCHASE_ACTIONS) {
  check(isPaymentPurchaseAction(action), `${action} recognized as purchase`);
  check(isPaymentCallbackAction(action), `${action} recognized as payment callback`);
  equal(getCallbackOwnership(action)?.routeId, CALLBACK_ROUTE.PAYMENT_PURCHASE, `${action} purchase owner`);
  equal(getCallbackOwnership(action)?.phase, CALLBACK_PHASE.POST_USER, `${action} purchase phase`);
}
for (const action of PAYMENT_ADMIN_ACTIONS) {
  check(isPaymentAdminAction(action), `${action} recognized as admin payment`);
  check(isPaymentCallbackAction(action), `${action} recognized as payment callback`);
  equal(getCallbackOwnership(action)?.routeId, CALLBACK_ROUTE.PAYMENT_ADMIN, `${action} admin owner`);
  equal(getCallbackOwnership(action)?.phase, CALLBACK_PHASE.POST_USER, `${action} admin phase`);
}
check(!isPaymentCallbackAction('a:menu'), 'foreign action not captured');
const summary = summarizeCallbackOwnership();
equal(summary.extracted, 67, 'STEP590D cumulative extracted owner count exact');
equal(summary.legacy, 493, 'STEP590D cumulative legacy owner count exact');
equal(summary.byRoute[CALLBACK_ROUTE.PAYMENT_PURCHASE], 6, 'purchase route count exact');
equal(summary.byRoute[CALLBACK_ROUTE.PAYMENT_ADMIN], 10, 'admin payment route count exact');

// Foreign action must not be consumed.
const foreignCtx = makeCtx();
equal(await handlePaymentPurchaseCallback(foreignCtx, { a: 'a:menu' }, { id: 1 }, {}), false, 'purchase handler declines foreign action');
equal(await handlePaymentAdminCallback(foreignCtx, { a: 'a:menu' }, { id: 1 }, {}), false, 'admin handler declines foreign action');
equal(foreignCtx.events.length, 0, 'foreign action causes no UX side effect');

// Payments pause is fail-closed before session or invoice creation.
const pausedCtx = makeCtx();
const pausedDeps = makePurchaseDeps({ getPaymentsRuntimeFlags: async () => ({ accept: false }) });
equal(await handlePaymentPurchaseCallback(pausedCtx, { a: PAYMENT_ACTION.WORKSPACE_PRO_BUY, ws: '9' }, { id: 4 }, pausedDeps), true, 'paused purchase consumed');
equal(pausedDeps.sessions.length, 0, 'paused purchase creates no Redis session');
equal(pausedDeps.invoices.length, 0, 'paused purchase sends no invoice');
equal(pausedCtx.events[0]?.payload?.text, '💤 Платежи на паузе. Попробуй позже.', 'pause copy preserved');

// Workspace PRO purchase.
const proCtx = makeCtx(1001);
const proDeps = makePurchaseDeps();
equal(await handlePaymentPurchaseCallback(proCtx, { a: PAYMENT_ACTION.WORKSPACE_PRO_BUY, ws: '55' }, { id: 7 }, proDeps), true, 'workspace PRO handled');
equal(proDeps.sessions.length, 1, 'workspace PRO session written once');
equal(proDeps.sessions[0][0], 'pay_pro:abcdefghijsig', 'workspace PRO Redis key preserved');
equal(proDeps.sessions[0][1].ownerUserId, 7, 'workspace PRO owner persisted');
equal(proDeps.sessions[0][1].tgId, 1001, 'workspace PRO Telegram actor persisted');
equal(proDeps.sessions[0][2].ex, 600, 'workspace PRO TTL preserved');
equal(proDeps.invoices[0].payload, 'pro_55_7_abcdefghijsig', 'workspace PRO payload preserved');
equal(proDeps.invoices[0].amount, 100, 'workspace PRO amount preserved');

// Brand credits.
const brandCtx = makeCtx(1002);
const brandDeps = makePurchaseDeps();
await handlePaymentPurchaseCallback(brandCtx, { a: PAYMENT_ACTION.BRAND_CREDITS_BUY, ws: '3', o: '9', p: '2', pack: 'S', h: 'bo' }, { id: 8 }, brandDeps);
equal(brandDeps.sessions[0][0], 'pay_brand:abcdefghijsig', 'brand credits Redis key preserved');
equal(brandDeps.sessions[0][1].credits, 10, 'brand credits amount persisted');
equal(brandDeps.sessions[0][1].offerId, 9, 'brand offer recovery context persisted');
equal(brandDeps.invoices[0].payload, 'brand_8_S_abcdefghijsig', 'brand credits payload preserved');
check(brandDeps.invoices[0].backCb.includes('a:bx_pub|ws:3|o:9|p:2|h:bo'), 'brand credits return path preserved');

// Brand plan.
const planDeps = makePurchaseDeps();
await handlePaymentPurchaseCallback(makeCtx(1003), { a: PAYMENT_ACTION.BRAND_PLAN_BUY, ws: '4', plan: 'start', ret: 'brand' }, { id: 9 }, planDeps);
equal(planDeps.sessions[0][0], 'pay_bplan:abcdefghijsig', 'brand plan Redis key preserved');
equal(planDeps.sessions[0][1].plan, 'start', 'brand plan ID persisted');
equal(planDeps.sessions[0][1].credits, 20, 'brand plan credits persisted');
equal(planDeps.invoices[0].payload, 'bplan_9_start_abcdefghijsig', 'brand plan payload preserved');
equal(planDeps.invoices[0].amount, 300, 'brand plan amount preserved');

// Matching.
const matchDeps = makePurchaseDeps();
await handlePaymentPurchaseCallback(makeCtx(1004), { a: PAYMENT_ACTION.MATCHING_BUY, ws: '5', tier: 's', ret: 'x', bpr: 'y' }, { id: 10 }, matchDeps);
equal(matchDeps.sessions[0][0], 'pay_match:abcdefghijsig', 'matching Redis key preserved');
equal(matchDeps.sessions[0][1].tierId, 'S', 'matching tier normalized');
equal(matchDeps.sessions[0][1].count, 5, 'matching count persisted');
equal(matchDeps.invoices[0].payload, 'match_10_S_abcdefghijsig', 'matching payload preserved');
equal(matchDeps.invoices[0].amount, 70, 'matching amount preserved');

// Featured.
const featDeps = makePurchaseDeps();
await handlePaymentPurchaseCallback(makeCtx(1005), { a: PAYMENT_ACTION.FEATURED_BUY, ws: '6', dur: '1d', ret: 'x', bpr: 'y' }, { id: 11 }, featDeps);
equal(featDeps.sessions[0][0], 'pay_feat:abcdefghijsig', 'featured Redis key preserved');
equal(featDeps.sessions[0][1].days, 1, 'featured days persisted');
equal(featDeps.invoices[0].payload, 'feat_11_1_abcdefghijsig', 'featured payload preserved');
equal(featDeps.invoices[0].amount, 80, 'featured amount preserved');

// Founder creator and brand products.
const founderCreatorDeps = makePurchaseDeps({
  getFounderSaleState: async () => ({
    active: true,
    products: [{ id: 'founder_creator_12m', title: 'Creator', subtitle: '12m', stars: 900, scope: 'creator', durationDays: 365, credits: 0, normalStars: 1200 }],
  }),
});
await handlePaymentPurchaseCallback(makeCtx(1006), { a: PAYMENT_ACTION.FOUNDER_BUY, id: 'founder_creator_12m', ret: 'menu' }, { id: 12 }, founderCreatorDeps);
equal(founderCreatorDeps.sessions[0][0], 'pay_founder:abcdefghijsig', 'founder Redis key preserved');
equal(founderCreatorDeps.sessions[0][1].wsId, 77, 'founder creator workspace persisted');
equal(founderCreatorDeps.invoices[0].payload, 'founder_creator_12m_12_abcdefghijsig', 'founder payload preserved');
equal(founderCreatorDeps.invoices[0].amount, 900, 'founder price preserved');

const founderInactiveEvents = [];
const founderInactiveDeps = makePurchaseDeps({
  getFounderSaleState: async () => ({ active: false, products: [] }),
  renderFounderSale: async (...args) => founderInactiveEvents.push(args),
});
await handlePaymentPurchaseCallback(makeCtx(), { a: PAYMENT_ACTION.FOUNDER_BUY, id: 'x' }, { id: 1 }, founderInactiveDeps);
equal(founderInactiveDeps.sessions.length, 0, 'inactive founder sale creates no session');
equal(founderInactiveEvents.length, 1, 'inactive founder sale rerenders canonical view');

// Missing workspace remains recovery-only.
let recoveryKind = '';
const missingWsDeps = makePurchaseDeps({
  db: { getWorkspace: async () => null },
  answerRecovery: async (_ctx, kind) => { recoveryKind = kind; },
});
await handlePaymentPurchaseCallback(makeCtx(), { a: PAYMENT_ACTION.WORKSPACE_PRO_BUY, ws: '99' }, { id: 3 }, missingWsDeps);
equal(recoveryKind, 'channel', 'missing workspace uses canonical recovery');
equal(missingWsDeps.sessions.length, 0, 'missing workspace creates no session');

// Admin deny path.
const deniedAdminCtx = makeCtx(2000, 'not_admin');
const deniedDeps = makeAdminDeps({ isAdmin: () => false });
equal(await handlePaymentAdminCallback(deniedAdminCtx, { a: PAYMENT_ACTION.ADMIN_ACCEPT_TOGGLE }, { id: 1 }, deniedDeps), true, 'unauthorized admin action consumed');
equal(deniedAdminCtx.events[0]?.payload?.text, 'Нет доступа.', 'unauthorized admin rejected');
equal(deniedDeps.calls.length, 0, 'unauthorized admin causes no mutation');

// Admin controls.
for (const [action, controlId, expectedNext] of [
  [PAYMENT_ACTION.ADMIN_ACCEPT_TOGGLE, 'pay_accept', false],
  [PAYMENT_ACTION.ADMIN_AUTO_APPLY_TOGGLE, 'pay_auto_apply', true],
  [PAYMENT_ACTION.ADMIN_MATCHFEAT_AUTO_TOGGLE, 'matchfeat_auto_apply', false],
]) {
  const deps = makeAdminDeps();
  await handlePaymentAdminCallback(makeCtx(3000, 'founder'), { a: action }, { id: 1 }, deps);
  const toggle = deps.calls.find((call) => call[0] === 'toggle');
  equal(toggle?.[1], controlId, `${action} control ID preserved`);
  equal(toggle?.[2], expectedNext, `${action} toggles current value`);
  equal(toggle?.[3]?.actorTgId, 3000, `${action} audit actor preserved`);
  equal(toggle?.[3]?.actorUsername, 'founder', `${action} audit username preserved`);
  equal(deps.calls.filter((call) => call[0] === 'render_system').length, 1, `${action} system rerendered once`);
}

// Fallback home / enable / disable.
const fallbackHomeDeps = makeAdminDeps();
await handlePaymentAdminCallback(makeCtx(), { a: PAYMENT_ACTION.ADMIN_FALLBACK_HOME }, { id: 1 }, fallbackHomeDeps);
equal(fallbackHomeDeps.calls.filter((call) => call[0] === 'render_fallback').length, 1, 'fallback home renders once');

const fallbackEnableDeps = makeAdminDeps();
await handlePaymentAdminCallback(makeCtx(4000, 'founder'), { a: PAYMENT_ACTION.ADMIN_FALLBACK_ENABLE, ttl: '7200', r: 'incident' }, { id: 1 }, fallbackEnableDeps);
const enableAudit = fallbackEnableDeps.calls.find((call) => call[0] === 'audit')?.[1];
equal(enableAudit?.controlId, 'payments_fallback', 'fallback enable audit control ID preserved');
equal(enableAudit?.nextValue, true, 'fallback enable audit next value true');
equal(enableAudit?.extra?.ttlSec, 7200, 'fallback enable TTL audited');
check(fallbackEnableDeps.calls.some((call) => call[0] === 'render_fallback' && String(call[2]).includes('7200s')), 'fallback enable success copy rendered');

const fallbackDisableDeps = makeAdminDeps();
await handlePaymentAdminCallback(makeCtx(4001, 'founder'), { a: PAYMENT_ACTION.ADMIN_FALLBACK_DISABLE }, { id: 1 }, fallbackDisableDeps);
const disableAudit = fallbackDisableDeps.calls.find((call) => call[0] === 'audit')?.[1];
equal(disableAudit?.previousValue, true, 'fallback disable previous true');
equal(disableAudit?.nextValue, false, 'fallback disable next false');
check(fallbackDisableDeps.calls.some((call) => call[0] === 'render_fallback' && call[2] === '🧹 Выключено.'), 'fallback disable canonical copy rendered');

// Ledger routes.
for (const [action, expectedCall] of [
  [PAYMENT_ACTION.ADMIN_LEDGER, 'render_payments'],
  [PAYMENT_ACTION.ADMIN_LEDGER_VIEW, 'render_payment_view'],
  [PAYMENT_ACTION.ADMIN_LEDGER_APPLY, 'apply'],
  [PAYMENT_ACTION.ADMIN_LEDGER_AUTOHEAL, 'autoheal'],
]) {
  const deps = makeAdminDeps();
  await handlePaymentAdminCallback(makeCtx(5000), { a: action, id: '42', st: 'ORPHANED', p: '3' }, { id: 99 }, deps);
  equal(deps.calls.filter((call) => call[0] === 'clear_expect').length, 1, `${action} clears text mode once`);
  equal(deps.calls.filter((call) => call[0] === expectedCall).length, 1, `${action} invokes canonical dependency once`);
}

// Missing dependency is explicit, not silent fallback.
await rejects(
  () => handlePaymentPurchaseCallback(makeCtx(), { a: PAYMENT_ACTION.WORKSPACE_PRO_BUY, ws: '1' }, { id: 1 }, {}),
  /payment_domain\.missing_dependency:getPaymentsRuntimeFlags/,
  'purchase route fails explicitly when composition dependency missing'
);
await rejects(
  () => handlePaymentAdminCallback(makeCtx(), { a: PAYMENT_ACTION.ADMIN_ACCEPT_TOGGLE }, { id: 1 }, { isAdmin: () => true }),
  /payment_domain\.missing_dependency:getOperatorControlSnapshot/,
  'admin route fails explicitly when composition dependency missing'
);

// Router reachability: extracted actions cannot fall back to legacy.
let purchaseCalls = 0;
let legacyCalls = 0;
const purchaseDispatch = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.POST_USER,
  ctx: makeCtx(),
  p: { a: PAYMENT_ACTION.WORKSPACE_PRO_BUY, ws: '1' },
  u: { id: 1 },
  handlers: {
    [CALLBACK_ROUTE.PAYMENT_PURCHASE]: async () => { purchaseCalls += 1; return true; },
  },
  legacy: async () => { legacyCalls += 1; return true; },
  final: true,
});
equal(purchaseDispatch.status, CALLBACK_DISPATCH_STATUS.HANDLED, 'purchase dispatch handled');
equal(purchaseCalls, 1, 'purchase owner called once');
equal(legacyCalls, 0, 'purchase never reaches legacy');

let adminCalls = 0;
const adminDispatch = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.POST_USER,
  ctx: makeCtx(),
  p: { a: PAYMENT_ACTION.ADMIN_LEDGER },
  u: { id: 1 },
  handlers: {
    [CALLBACK_ROUTE.PAYMENT_ADMIN]: async () => { adminCalls += 1; return true; },
  },
  final: true,
});
equal(adminDispatch.status, CALLBACK_DISPATCH_STATUS.HANDLED, 'admin payment dispatch handled');
equal(adminCalls, 1, 'admin payment owner called once');

const wrongPhase = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.PRE_USER,
  p: { a: PAYMENT_ACTION.WORKSPACE_PRO_BUY },
  final: false,
});
equal(wrongPhase.status, CALLBACK_DISPATCH_STATUS.DEFERRED, 'payment route defers pre-user');

console.log(`PASS STEP590C2 payment domain extraction tests (${assertions} assertions)`);
