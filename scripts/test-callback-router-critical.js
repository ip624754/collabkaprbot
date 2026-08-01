import assert from 'node:assert/strict';
import { ACTION_REGISTRY } from '../src/bot/actionRegistry.js';
import {
  CALLBACK_OWNERSHIP,
  CALLBACK_PHASE,
  CALLBACK_ROUTE,
  CALLBACK_ROUTE_DEFINITIONS,
  buildCallbackOwnership,
  getCallbackOwnership,
  summarizeCallbackOwnership,
} from '../src/bot/router/callbackOwnership.js';
import {
  CALLBACK_DISPATCH_STATUS,
  dispatchOwnedCallback,
} from '../src/bot/router/callbackRouter.js';

let assertions = 0;
function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}
function equal(actual, expected, message) {
  assert.equal(actual, expected, message);
  assertions += 1;
}
async function rejects(fn, pattern, message) {
  await assert.rejects(fn, pattern, message);
  assertions += 1;
}

const registryKeys = Object.keys(ACTION_REGISTRY);
const ownershipKeys = Object.keys(CALLBACK_OWNERSHIP);
const summary = summarizeCallbackOwnership();

equal(ownershipKeys.length, registryKeys.length, 'every registered action must have one ownership row');
equal(new Set(ownershipKeys).size, ownershipKeys.length, 'ownership action keys must be unique');
equal(summary.total, registryKeys.length, 'summary total must match action registry');
equal(summary.extracted, 29, 'STEP590C3 must extract twenty-nine exact actions');
equal(summary.legacy, registryKeys.length - 29, 'all remaining actions must be explicit legacy owners');
equal(summary.byRoute[CALLBACK_ROUTE.ADMIN_WEB_AUTH], 1, 'admin auth challenge route owns one action');
equal(summary.byRoute[CALLBACK_ROUTE.ADMIN_WEB_AUTH_CONTROL], 1, 'admin auth control route owns one action');
equal(summary.byRoute[CALLBACK_ROUTE.GIVEAWAY_ACCESS], 4, 'giveaway access owns four actions');
equal(summary.byRoute[CALLBACK_ROUTE.GIVEAWAY_PARTICIPANT], 2, 'giveaway participant owns two actions');
equal(summary.byRoute[CALLBACK_ROUTE.GIVEAWAY_LIFECYCLE], 5, 'giveaway lifecycle owns five actions');
equal(summary.byRoute[CALLBACK_ROUTE.PAYMENT_PURCHASE], 6, 'payment purchase owns six actions');
equal(summary.byRoute[CALLBACK_ROUTE.PAYMENT_ADMIN], 10, 'payment admin owns ten actions');
equal(summary.byRoute[CALLBACK_ROUTE.LEGACY], registryKeys.length - 29, 'legacy count must be exact');

for (const action of registryKeys) {
  const owner = getCallbackOwnership(action);
  check(owner, `missing ownership: ${action}`);
  equal(owner.action, action, `ownership action mismatch: ${action}`);
  check(
    owner.phase === CALLBACK_PHASE.PRE_USER || owner.phase === CALLBACK_PHASE.POST_USER,
    `invalid phase: ${action}`
  );
  check(Object.values(CALLBACK_ROUTE).includes(owner.routeId), `invalid route owner: ${action}`);
}

equal(getCallbackOwnership('a:aw_auth_dec').routeId, CALLBACK_ROUTE.ADMIN_WEB_AUTH, 'admin auth owner');
equal(getCallbackOwnership('a:aw_auth_dec').phase, CALLBACK_PHASE.PRE_USER, 'admin auth phase');
equal(getCallbackOwnership('a:admin_web_login_toggle').routeId, CALLBACK_ROUTE.ADMIN_WEB_AUTH_CONTROL, 'admin auth control owner');
equal(getCallbackOwnership('a:admin_web_login_toggle').phase, CALLBACK_PHASE.POST_USER, 'admin auth control phase');
for (const action of ['a:gw_access', 'a:gw_access_recheck', 'a:gw_access_checkme', 'a:gw_access_user_prompt']) {
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.GIVEAWAY_ACCESS, `${action} owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} phase`);
}
for (const action of ['a:gw_join', 'a:gw_check']) {
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.GIVEAWAY_PARTICIPANT, `${action} participant owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} participant phase`);
}
for (const action of ['a:gw_end_now', 'a:gw_end_do', 'a:gw_wv', 'a:gw_draw_now', 'a:gw_draw_do']) {
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.GIVEAWAY_LIFECYCLE, `${action} lifecycle owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} lifecycle phase`);
}
for (const action of ['a:founder_buy', 'a:ws_pro_buy', 'a:brand_buy', 'a:brand_plan_buy', 'a:match_buy', 'a:feat_buy']) {
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.PAYMENT_PURCHASE, `${action} payment purchase owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} payment purchase phase`);
}
for (const action of ['a:admin_pay_accept_toggle', 'a:admin_pay_auto_toggle', 'a:admin_pay_fb', 'a:admin_pay_fb_set', 'a:admin_pay_fb_off', 'a:admin_matchfeat_auto_toggle', 'a:admin_payments', 'a:admin_pay_view', 'a:admin_pay_apply', 'a:admin_pay_autoheal']) {
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.PAYMENT_ADMIN, `${action} payment admin owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} payment admin phase`);
}
equal(getCallbackOwnership('a:menu').routeId, CALLBACK_ROUTE.LEGACY, 'non-extracted action stays legacy');
equal(getCallbackOwnership('a:not_registered'), null, 'unknown action has no owner');

assert.throws(
  () => buildCallbackOwnership({
    routeDefinitions: [
      { id: 'one', phase: CALLBACK_PHASE.POST_USER, actions: ['a:menu'] },
      { id: 'two', phase: CALLBACK_PHASE.POST_USER, actions: ['a:menu'] },
    ],
  }),
  /duplicate_action_owner:a:menu/
);
assertions += 1;

assert.throws(
  () => buildCallbackOwnership({
    routeDefinitions: [
      { id: 'one', phase: CALLBACK_PHASE.POST_USER, actions: ['a:not_registered'] },
    ],
  }),
  /unknown_action:one:a:not_registered/
);
assertions += 1;

assert.throws(
  () => buildCallbackOwnership({
    routeDefinitions: [
      { id: 'one', phase: CALLBACK_PHASE.POST_USER, actions: ['a:menu'] },
      { id: 'one', phase: CALLBACK_PHASE.POST_USER, actions: ['a:home'] },
    ],
  }),
  /duplicate_route_id:one/
);
assertions += 1;

const ack = [];
const authCtx = {
  from: { id: 123456789 },
  answerCallbackQuery: async (payload) => ack.push(payload),
  editMessageReplyMarkup: async () => true,
};
let approveCalls = 0;
const authResult = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.PRE_USER,
  ctx: authCtx,
  p: { a: 'a:aw_auth_dec', c: 'abcdefabcdefabcdefabcdef', d: 'a' },
  handlers: {
    [CALLBACK_ROUTE.ADMIN_WEB_AUTH]: async (ctx, p) => {
      approveCalls += 1;
      equal(p.c, 'abcdefabcdefabcdefabcdef', 'challenge id reaches exact owner');
      equal(p.d, 'a', 'decision reaches exact owner');
      equal(ctx.from.id, 123456789, 'real Telegram actor reaches exact owner');
      await ctx.answerCallbackQuery({ text: 'approved' });
      return true;
    },
  },
});
equal(authResult.status, CALLBACK_DISPATCH_STATUS.HANDLED, 'admin auth must execute in pre-user router');
equal(authResult.ownership.routeId, CALLBACK_ROUTE.ADMIN_WEB_AUTH, 'admin auth result owner');
equal(approveCalls, 1, 'admin auth domain handler called exactly once');
equal(ack.length, 1, 'admin auth callback ack emitted once');

const authPostResult = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.POST_USER,
  ctx: authCtx,
  p: { a: 'a:aw_auth_dec' },
  final: true,
  legacy: async () => true,
});
equal(authPostResult.status, CALLBACK_DISPATCH_STATUS.ERROR, 'missed pre-user route must fail closed');
check(/phase_not_reached/.test(authPostResult.error?.message || ''), 'missed pre-user route error is explicit');

const authControlPreResult = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.PRE_USER,
  p: { a: 'a:admin_web_login_toggle' },
});
equal(authControlPreResult.status, CALLBACK_DISPATCH_STATUS.DEFERRED, 'admin auth control defers during pre-user phase');

let authControlCalls = 0;
const authControlResult = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.POST_USER,
  ctx: authCtx,
  p: { a: 'a:admin_web_login_toggle' },
  u: { id: 12 },
  handlers: {
    [CALLBACK_ROUTE.ADMIN_WEB_AUTH_CONTROL]: async (_ctx, _p, u) => {
      authControlCalls += 1;
      equal(u.id, 12, 'hydrated user reaches admin auth control owner');
      return true;
    },
  },
  final: true,
});
equal(authControlResult.status, CALLBACK_DISPATCH_STATUS.HANDLED, 'admin auth control executes in post-user router');
equal(authControlCalls, 1, 'admin auth control handler called exactly once');

const gwPreResult = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.PRE_USER,
  p: { a: 'a:gw_access' },
});
equal(gwPreResult.status, CALLBACK_DISPATCH_STATUS.DEFERRED, 'post-user route defers during pre-user phase');

let gwCalls = 0;
const gwPostResult = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.POST_USER,
  ctx: {},
  p: { a: 'a:gw_access', i: '7' },
  u: { id: 9 },
  handlers: {
    [CALLBACK_ROUTE.GIVEAWAY_ACCESS]: async (_ctx, p, u) => {
      gwCalls += 1;
      equal(p.i, '7', 'giveaway callback payload reaches owner');
      equal(u.id, 9, 'hydrated user reaches post-user owner');
      return true;
    },
  },
  final: true,
});
equal(gwPostResult.status, CALLBACK_DISPATCH_STATUS.HANDLED, 'giveaway access executable owner handles callback');
equal(gwCalls, 1, 'giveaway owner called exactly once');

let gwParticipantCalls = 0;
const gwParticipantResult = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.POST_USER,
  ctx: {},
  p: { a: 'a:gw_check', i: '8' },
  u: { id: 10 },
  handlers: {
    [CALLBACK_ROUTE.GIVEAWAY_PARTICIPANT]: async (_ctx, p, u) => {
      gwParticipantCalls += 1;
      equal(p.i, '8', 'giveaway participant payload reaches owner');
      equal(u.id, 10, 'hydrated user reaches giveaway participant owner');
      return true;
    },
  },
  final: true,
});
equal(gwParticipantResult.status, CALLBACK_DISPATCH_STATUS.HANDLED, 'giveaway participant owner handles callback');
equal(gwParticipantCalls, 1, 'giveaway participant owner called exactly once');

let gwLifecycleCalls = 0;
const gwLifecycleResult = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.POST_USER,
  ctx: {},
  p: { a: 'a:gw_draw_do', i: '9' },
  u: { id: 11 },
  handlers: {
    [CALLBACK_ROUTE.GIVEAWAY_LIFECYCLE]: async (_ctx, p, u) => {
      gwLifecycleCalls += 1;
      equal(p.i, '9', 'giveaway lifecycle payload reaches owner');
      equal(u.id, 11, 'hydrated user reaches giveaway lifecycle owner');
      return true;
    },
  },
  final: true,
});
equal(gwLifecycleResult.status, CALLBACK_DISPATCH_STATUS.HANDLED, 'giveaway lifecycle owner handles callback');
equal(gwLifecycleCalls, 1, 'giveaway lifecycle owner called exactly once');

let paymentPurchaseCalls = 0;
const paymentPurchaseResult = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.POST_USER,
  ctx: {},
  p: { a: 'a:ws_pro_buy', ws: '7' },
  u: { id: 15 },
  handlers: {
    [CALLBACK_ROUTE.PAYMENT_PURCHASE]: async (_ctx, p, u) => {
      paymentPurchaseCalls += 1;
      equal(p.ws, '7', 'payment purchase payload reaches owner');
      equal(u.id, 15, 'hydrated user reaches payment purchase owner');
      return true;
    },
  },
  final: true,
});
equal(paymentPurchaseResult.status, CALLBACK_DISPATCH_STATUS.HANDLED, 'payment purchase executable owner handles callback');
equal(paymentPurchaseCalls, 1, 'payment purchase owner called exactly once');

let paymentAdminCalls = 0;
const paymentAdminResult = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.POST_USER,
  ctx: {},
  p: { a: 'a:admin_payments' },
  u: { id: 16 },
  handlers: {
    [CALLBACK_ROUTE.PAYMENT_ADMIN]: async (_ctx, _p, u) => {
      paymentAdminCalls += 1;
      equal(u.id, 16, 'hydrated user reaches payment admin owner');
      return true;
    },
  },
  final: true,
});
equal(paymentAdminResult.status, CALLBACK_DISPATCH_STATUS.HANDLED, 'payment admin executable owner handles callback');
equal(paymentAdminCalls, 1, 'payment admin owner called exactly once');

let legacyCalls = 0;
const legacyHandled = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.POST_USER,
  p: { a: 'a:menu' },
  legacy: async () => {
    legacyCalls += 1;
    return undefined;
  },
  final: true,
});
equal(legacyHandled.status, CALLBACK_DISPATCH_STATUS.HANDLED, 'legacy compatibility handler remains valid');
equal(legacyCalls, 1, 'legacy handler called exactly once');

const legacyUnknown = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.POST_USER,
  p: { a: 'a:menu' },
  legacy: async () => false,
  final: true,
});
equal(legacyUnknown.status, CALLBACK_DISPATCH_STATUS.UNKNOWN, 'legacy exact false preserves unknown convention');

const unknownFinal = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.POST_USER,
  p: { a: 'a:not_registered' },
  legacy: async () => true,
  final: true,
});
equal(unknownFinal.status, CALLBACK_DISPATCH_STATUS.UNKNOWN, 'unregistered final action is unknown');

const unknownPre = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.PRE_USER,
  p: { a: 'a:not_registered' },
  final: false,
});
equal(unknownPre.status, CALLBACK_DISPATCH_STATUS.DEFERRED, 'unknown action is not consumed before final phase');

const missingExtractedHandler = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.PRE_USER,
  p: { a: 'a:aw_auth_dec' },
});
equal(missingExtractedHandler.status, CALLBACK_DISPATCH_STATUS.ERROR, 'missing extracted handler fails closed');
check(/missing_handler:admin_web_auth/.test(missingExtractedHandler.error?.message || ''), 'missing handler identifies owner');

const extractedFalse = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.PRE_USER,
  p: { a: 'a:aw_auth_dec' },
  handlers: { [CALLBACK_ROUTE.ADMIN_WEB_AUTH]: async () => false },
});
equal(extractedFalse.status, CALLBACK_DISPATCH_STATUS.ERROR, 'extracted handler cannot silently decline owned action');
check(/extracted_handler_contract/.test(extractedFalse.error?.message || ''), 'declined extracted action reports contract error');

const thrown = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.POST_USER,
  p: { a: 'a:gw_access' },
  handlers: {
    [CALLBACK_ROUTE.GIVEAWAY_ACCESS]: async () => {
      throw new Error('route exploded');
    },
  },
  final: true,
});
equal(thrown.status, CALLBACK_DISPATCH_STATUS.ERROR, 'route exception is captured');
equal(thrown.error.message, 'route exploded', 'original route exception is preserved');

const invalidPhase = await dispatchOwnedCallback({ phase: 'wrong', p: { a: 'a:menu' } });
equal(invalidPhase.status, CALLBACK_DISPATCH_STATUS.ERROR, 'invalid phase fails closed');
check(/invalid_phase/.test(invalidPhase.error?.message || ''), 'invalid phase reason is explicit');

check(Object.isFrozen(CALLBACK_OWNERSHIP), 'ownership registry is frozen');
check(Object.isFrozen(CALLBACK_ROUTE_DEFINITIONS), 'route definitions are frozen');

console.log(`PASS callback router ownership and reachability tests (${assertions} assertions)`);
