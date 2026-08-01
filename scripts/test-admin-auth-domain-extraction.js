import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ADMIN_AUTH_ACTION,
  ADMIN_AUTH_CALLBACK_ACTIONS,
  ADMIN_AUTH_CHALLENGE_ACTIONS,
  ADMIN_AUTH_CONTROL_ACTIONS,
  ADMIN_AUTH_CALLBACK_ROUTE_DEFINITIONS,
  ADMIN_AUTH_CHALLENGE_ROUTE_DEFINITION,
  ADMIN_AUTH_CONTROL_ROUTE_DEFINITION,
  handleAdminAuthChallengeCallback,
  handleAdminAuthControlCallback,
  isAdminAuthCallbackAction,
  normalizeAdminAuthDecision,
  parseAdminAuthDecisionPayload,
} from '../src/bot/domains/adminAuth/index.js';
import { CALLBACK_PHASE, CALLBACK_ROUTE } from '../src/bot/router/callbackContracts.js';
import { getCallbackOwnership } from '../src/bot/router/callbackOwnership.js';
import { CALLBACK_DISPATCH_STATUS, dispatchOwnedCallback } from '../src/bot/router/callbackRouter.js';

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

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function makeCtx(actorTgId = 123456789, username = 'operator') {
  const events = [];
  return {
    from: { id: actorTgId, username },
    events,
    answerCallbackQuery: async (payload) => events.push({ type: 'answer', payload }),
    editMessageReplyMarkup: async (payload) => events.push({ type: 'edit', payload }),
  };
}

// Domain ownership and phase-specific route descriptors.
equal(ADMIN_AUTH_ACTION.DECIDE, 'a:aw_auth_dec', 'challenge action key remains byte-compatible');
equal(ADMIN_AUTH_ACTION.TOGGLE_LOGIN, 'a:admin_web_login_toggle', 'operator-control action key remains byte-compatible');
equal(ADMIN_AUTH_CHALLENGE_ACTIONS.length, 1, 'challenge route owns one action');
equal(ADMIN_AUTH_CONTROL_ACTIONS.length, 1, 'control route owns one action');
equal(ADMIN_AUTH_CALLBACK_ACTIONS.length, 2, 'bounded domain owns two auth actions');
equal(new Set(ADMIN_AUTH_CALLBACK_ACTIONS).size, 2, 'domain actions are unique');
check(Object.isFrozen(ADMIN_AUTH_ACTION), 'action object is frozen');
check(Object.isFrozen(ADMIN_AUTH_CHALLENGE_ACTIONS), 'challenge action list is frozen');
check(Object.isFrozen(ADMIN_AUTH_CONTROL_ACTIONS), 'control action list is frozen');
check(Object.isFrozen(ADMIN_AUTH_CALLBACK_ACTIONS), 'combined action list is frozen');
check(Object.isFrozen(ADMIN_AUTH_CALLBACK_ROUTE_DEFINITIONS), 'route definition list is frozen');
equal(ADMIN_AUTH_CALLBACK_ROUTE_DEFINITIONS.length, 2, 'domain publishes two route definitions');
equal(ADMIN_AUTH_CHALLENGE_ROUTE_DEFINITION.id, CALLBACK_ROUTE.ADMIN_WEB_AUTH, 'challenge route ID is canonical');
equal(ADMIN_AUTH_CHALLENGE_ROUTE_DEFINITION.phase, CALLBACK_PHASE.PRE_USER, 'challenge route remains pre-user');
equal(ADMIN_AUTH_CHALLENGE_ROUTE_DEFINITION.actions, ADMIN_AUTH_CHALLENGE_ACTIONS, 'challenge ownership consumes domain action list by identity');
equal(ADMIN_AUTH_CONTROL_ROUTE_DEFINITION.id, CALLBACK_ROUTE.ADMIN_WEB_AUTH_CONTROL, 'control route ID is canonical');
equal(ADMIN_AUTH_CONTROL_ROUTE_DEFINITION.phase, CALLBACK_PHASE.POST_USER, 'control route remains post-user');
equal(ADMIN_AUTH_CONTROL_ROUTE_DEFINITION.actions, ADMIN_AUTH_CONTROL_ACTIONS, 'control ownership consumes domain action list by identity');
equal(getCallbackOwnership(ADMIN_AUTH_ACTION.DECIDE)?.routeId, CALLBACK_ROUTE.ADMIN_WEB_AUTH, 'challenge ownership points to domain');
equal(getCallbackOwnership(ADMIN_AUTH_ACTION.DECIDE)?.phase, CALLBACK_PHASE.PRE_USER, 'challenge ownership preserves phase');
equal(getCallbackOwnership(ADMIN_AUTH_ACTION.TOGGLE_LOGIN)?.routeId, CALLBACK_ROUTE.ADMIN_WEB_AUTH_CONTROL, 'control ownership points to domain');
equal(getCallbackOwnership(ADMIN_AUTH_ACTION.TOGGLE_LOGIN)?.phase, CALLBACK_PHASE.POST_USER, 'control ownership preserves phase');

// Pure challenge policy.
check(isAdminAuthCallbackAction('a:aw_auth_dec'), 'exact challenge action is recognized');
check(!isAdminAuthCallbackAction('a:admin_web_login_toggle'), 'control action is not captured by challenge parser');
check(!isAdminAuthCallbackAction('a:admin_home'), 'other admin action is not captured');
equal(normalizeAdminAuthDecision('a'), 'approve', 'approve compact value normalized');
equal(normalizeAdminAuthDecision('d'), 'deny', 'deny compact value normalized');
equal(normalizeAdminAuthDecision('approve'), '', 'verbose value is rejected');
equal(parseAdminAuthDecisionPayload({ a: 'a:menu' }).error, 'action_not_owned', 'foreign action is rejected by policy');
equal(parseAdminAuthDecisionPayload({ a: 'a:aw_auth_dec', c: 'bad', d: 'a' }).error, 'invalid_payload', 'invalid challenge fails closed');
const parsed = parseAdminAuthDecisionPayload({ a: 'a:aw_auth_dec', c: 'abcdefabcdefabcdefabcdef', d: 'd' });
check(parsed.ok, 'valid challenge payload parses');
equal(parsed.challengeId, 'abcdefabcdefabcdefabcdef', 'challenge ID preserved');
equal(parsed.decision, 'deny', 'decision normalized');
check(Object.isFrozen(parsed), 'parsed policy result is immutable');

// Challenge transport delegates to canonical auth service and preserves actor truth.
const foreignCtx = makeCtx();
const foreignHandled = await handleAdminAuthChallengeCallback(foreignCtx, { a: 'a:menu' }, {
  approve: async () => { throw new Error('must not call'); },
});
equal(foreignHandled, false, 'challenge handler declines action it does not own');
equal(foreignCtx.events.length, 0, 'foreign action produces no UX side effect');

const invalidCtx = makeCtx();
const invalidHandled = await handleAdminAuthChallengeCallback(invalidCtx, { a: 'a:aw_auth_dec', c: 'bad', d: 'a' }, {
  approve: async () => { throw new Error('must not call'); },
});
equal(invalidHandled, true, 'owned malformed challenge is consumed');
equal(invalidCtx.events[0]?.payload?.text, 'Некорректный запрос входа.', 'malformed challenge gets canonical response');

const approveCtx = makeCtx(99887766);
let approveInput = null;
const approveHandled = await handleAdminAuthChallengeCallback(
  approveCtx,
  { a: 'a:aw_auth_dec', c: 'abcdefabcdefabcdefabcdef', d: 'a' },
  { approve: async (input) => { approveInput = input; return { ok: true, status: 'approved' }; } }
);
equal(approveHandled, true, 'approve callback is handled');
equal(approveInput?.actorTgId, 99887766, 'ctx.from.id remains authoritative approver');
equal(approveInput?.challengeId, 'abcdefabcdefabcdefabcdef', 'challenge reaches canonical service');
equal(approveInput?.decision, 'approve', 'normalized decision reaches canonical service');
equal(approveCtx.events.filter((event) => event.type === 'edit').length, 1, 'successful decision removes keyboard once');
equal(approveCtx.events.find((event) => event.type === 'answer')?.payload?.text, 'Вход одобрен для исходного браузера.', 'browser-binding truth preserved');

const rejectedCtx = makeCtx(11223344);
await handleAdminAuthChallengeCallback(
  rejectedCtx,
  { a: 'a:aw_auth_dec', c: 'abcdefabcdefabcdefabcdef', d: 'd' },
  { approve: async () => ({ ok: false, error: 'approver_not_allowed' }) }
);
equal(rejectedCtx.events.find((event) => event.type === 'answer')?.payload?.text, 'Эта кнопка доступна только назначенному approver.', 'unauthorized actor gets explicit rejection');
equal(rejectedCtx.events.filter((event) => event.type === 'edit').length, 0, 'failed challenge leaves keyboard intact');

// Operator control extraction preserves the legacy transition and audit actor.
const controlForeignCtx = makeCtx();
const controlForeign = await handleAdminAuthControlCallback(controlForeignCtx, { a: 'a:admin_home' }, null, {});
equal(controlForeign, false, 'control handler declines foreign action');
equal(controlForeignCtx.events.length, 0, 'foreign action has no control side effects');

const deniedControlCtx = makeCtx(500, 'not_admin');
const deniedControl = await handleAdminAuthControlCallback(
  deniedControlCtx,
  { a: 'a:admin_web_login_toggle' },
  { id: 1 },
  { isAdmin: () => false }
);
equal(deniedControl, true, 'owned control action is consumed for unauthorized actor');
equal(deniedControlCtx.events[0]?.payload?.text, 'Нет доступа.', 'unauthorized control actor is rejected');

const controlCtx = makeCtx(600, 'founder');
let snapshotCalls = 0;
let toggleCall = null;
let renderCalls = 0;
const controlHandled = await handleAdminAuthControlCallback(
  controlCtx,
  { a: 'a:admin_web_login_toggle' },
  { id: 9 },
  {
    isAdmin: (ctx) => Number(ctx?.from?.id) === 600,
    getControlSnapshot: async (input) => {
      snapshotCalls += 1;
      equal(input?.limit, 1, 'control snapshot remains bounded');
      return { byId: { admin_web_login: { value: true } } };
    },
    setControlToggle: async (...args) => { toggleCall = args; return { ok: true }; },
    renderSystem: async (ctx) => {
      renderCalls += 1;
      equal(ctx, controlCtx, 'system view receives original Telegram context');
    },
  }
);
equal(controlHandled, true, 'admin web login control is handled');
equal(snapshotCalls, 1, 'control snapshot is read once');
equal(toggleCall?.[0], 'admin_web_login', 'canonical operator control ID is preserved');
equal(toggleCall?.[1], false, 'current true value toggles to false');
equal(toggleCall?.[2]?.actorTgId, 600, 'control audit receives actual Telegram actor');
equal(toggleCall?.[2]?.actorUsername, 'founder', 'control audit receives actual username');
equal(toggleCall?.[2]?.note, 'telegram_admin', 'control audit note remains byte-compatible');
equal(renderCalls, 1, 'system view is rendered once after mutation');
equal(controlCtx.events.filter((event) => event.type === 'answer').length, 1, 'control callback is acknowledged once');

await rejects(
  () => handleAdminAuthControlCallback(
    makeCtx(600),
    { a: 'a:admin_web_login_toggle' },
    null,
    { isAdmin: true }
  ),
  /admin_auth_control\.missing_dependency/,
  'missing control dependencies fail closed'
);

// Executable route reachability through STEP590B router.
let challengeRouteCalls = 0;
const routedCtx = makeCtx(77889900);
const routedChallenge = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.PRE_USER,
  ctx: routedCtx,
  p: { a: 'a:aw_auth_dec', c: 'abcdefabcdefabcdefabcdef', d: 'a' },
  handlers: {
    [CALLBACK_ROUTE.ADMIN_WEB_AUTH]: (ctx, payload) => handleAdminAuthChallengeCallback(ctx, payload, {
      approve: async ({ actorTgId }) => {
        challengeRouteCalls += 1;
        equal(actorTgId, 77889900, 'router preserves Telegram approver');
        return { ok: true, status: 'approved' };
      },
    }),
  },
});
equal(routedChallenge.status, CALLBACK_DISPATCH_STATUS.HANDLED, 'challenge domain is reachable through pre-user router');
equal(challengeRouteCalls, 1, 'challenge service is called once');

const controlPre = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.PRE_USER,
  p: { a: 'a:admin_web_login_toggle' },
});
equal(controlPre.status, CALLBACK_DISPATCH_STATUS.DEFERRED, 'operator control defers before user hydration');

let controlRouteCalls = 0;
const routedControl = await dispatchOwnedCallback({
  phase: CALLBACK_PHASE.POST_USER,
  ctx: makeCtx(700, 'admin'),
  p: { a: 'a:admin_web_login_toggle' },
  u: { id: 10 },
  handlers: {
    [CALLBACK_ROUTE.ADMIN_WEB_AUTH_CONTROL]: async () => {
      controlRouteCalls += 1;
      return true;
    },
  },
  final: true,
});
equal(routedControl.status, CALLBACK_DISPATCH_STATUS.HANDLED, 'control domain is reachable through post-user router');
equal(controlRouteCalls, 1, 'control route is called once');

// Static dependency and extraction boundaries.
const callbacksSource = read('src/bot/domains/adminAuth/callbacks.js');
const policySource = read('src/bot/domains/adminAuth/policy.js');
const viewsSource = read('src/bot/domains/adminAuth/views.js');
const routeSource = read('src/bot/domains/adminAuth/route.js');
const serviceSource = read('src/bot/domains/adminAuth/service.js');
const ownershipSource = read('src/bot/router/callbackOwnership.js');
const botSource = read('src/bot/bot.js');

check(callbacksSource.includes("./service.js"), 'transport delegates through bounded domain service');
check(serviceSource.includes("../../../lib/adminWeb/auth.js"), 'domain service delegates to canonical auth state machine');
check(serviceSource.includes('approveChallengeFromTelegram(input)'), 'domain service does not reimplement auth transition');
check(!callbacksSource.includes('db/queries'), 'transport domain does not import DB monolith');
check(!callbacksSource.includes("from '../../bot.js'"), 'domain does not import bot composition root');
check(!callbacksSource.includes("from 'grammy'"), 'domain remains Grammy-independent');
check(!policySource.includes('../lib/'), 'policy is dependency-free');
check(!viewsSource.includes('../lib/'), 'views are transport-only and dependency-free');
check(routeSource.includes("../../router/callbackContracts.js"), 'route uses shared router contracts');
check(ownershipSource.includes('ADMIN_AUTH_CALLBACK_ROUTE_DEFINITIONS'), 'global ownership consumes domain descriptors');
check(botSource.includes("./domains/adminAuth/index.js"), 'composition root imports bounded domain facade');
check(botSource.includes('admin_web_auth_control: (ctx2, p2, u2) => handleAdminAuthControlCallback'), 'post-user control route is wired explicitly');
check(!botSource.includes("if (p.a === 'a:admin_web_login_toggle')"), 'legacy inline control branch is removed');
check(!botSource.includes('./adminWebAuthCallback.js'), 'legacy root-level callback module is retired');
check(!fs.existsSync(path.join(ROOT, 'src/bot/adminWebAuthCallback.js')), 'legacy callback file is removed');

console.log(`PASS STEP590C1 admin/auth domain extraction tests (${assertions} assertions)`);
