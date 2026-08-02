import assert from 'node:assert/strict';
import {
  USER_ACCOUNT_ACTIONS,
  USER_SERVICE_CALLBACK_ACTIONS,
  USER_SHARING_ACTIONS,
  USER_SUPPORT_ACTIONS,
  USER_VERIFICATION_ACTIONS,
} from '../src/bot/domains/userServices/actions.js';
import { handleUserAccountCallback } from '../src/bot/domains/userServices/accountCallbacks.js';
import { handleUserSharingCallback } from '../src/bot/domains/userServices/sharingCallbacks.js';
import { handleUserSupportCallback } from '../src/bot/domains/userServices/supportCallbacks.js';
import { handleUserVerificationCallback } from '../src/bot/domains/userServices/verificationCallbacks.js';
import {
  isUserAccountAction,
  isUserServiceCallbackAction,
  isUserSharingAction,
  isUserSupportAction,
  isUserVerificationAction,
} from '../src/bot/domains/userServices/policy.js';
import {
  CALLBACK_PHASE,
  CALLBACK_ROUTE,
  getCallbackOwnership,
  summarizeCallbackOwnership,
} from '../src/bot/router/callbackOwnership.js';

let assertions = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
const check = (value, message) => { assert.ok(value, message); assertions += 1; };

class InlineKeyboard {
  text() { return this; }
  row() { return this; }
}

function makeCtx() {
  const calls = [];
  return {
    calls,
    from: { id: 1001, username: 'user' },
    chat: { id: 1001, type: 'private' },
    callbackQuery: { message: { chat: { id: 1001 }, message_id: 11 } },
    answerCallbackQuery: async (payload) => { calls.push(['ack', payload]); return true; },
    reply: async (...args) => { calls.push(['reply', ...args]); return true; },
    api: { editMessageReplyMarkup: async (...args) => { calls.push(['editMarkup', ...args]); return true; } },
  };
}

function makeDeps(overrides = {}) {
  const calls = [];
  const call = async (...args) => { calls.push(['call', ...args]); return null; };
  const redisStore = new Map();
  const inviteState = {
    rewards: { enabled: true, availablePoints: 100, totalPoints: 100 },
  };
  const deps = {
    calls,
    CFG: { VERIFICATION_ENABLED: true, BRAND_VERIFY_REQUIRES_EXTENDED: false },
    InlineKeyboard,
    UI_MODES: { BRAND: 'brand', CREATOR: 'creator' },
    bmActiveBrandKey: (id) => `bm:${id}`,
    botUsernameNoAt: () => 'collabka_bot',
    calcWsProfileProgress: () => ({ aboutOk: true, portfolioOk: true, igOk: false, contactOk: true }),
    copySafetyRecoveryKb: () => new InlineKeyboard(),
    copySafetyUnavailableHtml: (value) => String(value),
    db: {
      getBrandProfile: async () => ({ brand_name: 'Brand', niche: 'Niche', contact: '@brand', link: 'https://example.test' }),
      getInviteRewardsRecentHistory: async () => [],
      getUserVerification: async () => null,
      getWorkspace: async () => ({ id: 7, about: 'about', portfolio_url: 'https://example.test', contact: '@creator' }),
      listWorkspaces: async () => [{ id: 7 }],
      redeemInviteReward: async () => ({ ok: true }),
      restoreUser: call,
      tombstoneUser: call,
    },
    getActiveWorkspaceId: async () => 7,
    getRoleFlags: async () => ({}),
    getUiMode: async () => 'creator',
    inviteKeyboardMarkup: () => ({}),
    inviteRedeemConfirmKeyboard: () => new InlineKeyboard(),
    inviteRedeemOption: (key) => key === 'pro7' ? { key: 'pro7', costPoints: 10 } : null,
    inviteRedeemSuccessKeyboard: () => new InlineKeyboard(),
    inviteRewardsCenterKeyboard: () => ({}),
    isBrandBasicComplete: () => true,
    isBrandExtendedComplete: () => true,
    k: (parts) => parts.join(':'),
    loadInviteHistoryStateForUser: async () => ({ inviteState, history: [] }),
    loadInviteSurfaceStateForUser: async () => inviteState,
    mainMenuKb: () => new InlineKeyboard(),
    navKb: () => new InlineKeyboard(),
    redis: {
      del: async (key) => { redisStore.delete(String(key)); calls.push(['redisDel', key]); return true; },
    },
    renderAccountDeletedGate: call,
    renderInviteHistoryKeyboard: () => ({}),
    renderInviteHistoryText: () => 'history',
    renderInviteLinkKeyboard: () => ({}),
    renderInviteLinkText: () => 'link',
    renderInvitePerformanceKeyboard: () => ({}),
    renderInvitePerformanceText: () => 'performance',
    renderInvitePointsKeyboard: () => ({}),
    renderInvitePointsText: () => 'points',
    renderInviteRedeemConfirmText: () => 'confirm',
    renderInviteRedeemSuccessText: () => 'success',
    renderInviteRewardsCenterText: () => 'rewards',
    renderInviteText: () => 'invite',
    renderRoleSelection: call,
    renderVerifyHome: call,
    renderVerifyInfo: call,
    reportCopySafetyDiagnostic: (...args) => { calls.push(['diagnostic', ...args]); },
    safeBrandProfiles: async (fn) => fn(),
    safeEditOrReply: call,
    safeUserVerifications: async (fn) => fn(),
    sendInviteCardMessage: call,
    setExpectText: call,
  };
  return Object.assign(deps, overrides);
}

const groups = [
  [USER_SUPPORT_ACTIONS, isUserSupportAction, CALLBACK_ROUTE.USER_SUPPORT],
  [USER_VERIFICATION_ACTIONS, isUserVerificationAction, CALLBACK_ROUTE.USER_VERIFICATION],
  [USER_SHARING_ACTIONS, isUserSharingAction, CALLBACK_ROUTE.USER_SHARING],
  [USER_ACCOUNT_ACTIONS, isUserAccountAction, CALLBACK_ROUTE.USER_ACCOUNT],
];

equal(USER_SUPPORT_ACTIONS.length, 3, 'support action count');
equal(USER_VERIFICATION_ACTIONS.length, 3, 'verification action count');
equal(USER_SHARING_ACTIONS.length, 9, 'sharing action count');
equal(USER_ACCOUNT_ACTIONS.length, 3, 'account action count');
equal(new Set(USER_SERVICE_CALLBACK_ACTIONS).size, 18, '18 exact user-service callbacks');

for (const [actions, predicate, routeId] of groups) {
  for (const action of actions) {
    check(predicate(action), `${action} group predicate`);
    check(isUserServiceCallbackAction(action), `${action} aggregate predicate`);
    equal(getCallbackOwnership(action).routeId, routeId, `${action} exact owner`);
    equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} phase`);
  }
}

const handlers = [
  [handleUserSupportCallback, USER_SUPPORT_ACTIONS],
  [handleUserVerificationCallback, USER_VERIFICATION_ACTIONS],
  [handleUserSharingCallback, USER_SHARING_ACTIONS],
  [handleUserAccountCallback, USER_ACCOUNT_ACTIONS],
];
for (const [handler] of handlers) {
  equal(await handler(makeCtx(), { a: 'a:menu' }, { id: 1 }, makeDeps()), false, 'handler rejects unrelated action');
}

for (const [handler, action, payload = {}] of [
  [handleUserSupportCallback, 'a:support'],
  [handleUserSupportCallback, 'a:support_write'],
  [handleUserVerificationCallback, 'a:verify_home'],
  [handleUserVerificationCallback, 'a:verify_info'],
  [handleUserVerificationCallback, 'a:verify_kind'],
  [handleUserSharingCallback, 'a:share'],
  [handleUserSharingCallback, 'a:share_card'],
  [handleUserSharingCallback, 'a:share_redeem', { r: 'pro7' }],
  [handleUserSharingCallback, 'a:share_redeem_do', { r: 'pro7' }],
  [handleUserAccountCallback, 'a:acc_del_q'],
  [handleUserAccountCallback, 'a:acc_del_do'],
  [handleUserAccountCallback, 'a:acc_restore'],
]) {
  const deps = makeDeps();
  equal(await handler(makeCtx(), { a: action, ...payload }, { id: 1, is_deleted: false }, deps), true, `${action} handled`);
  check(deps.calls.length > 0 || action === 'a:support', `${action} reaches bounded dependency or UI`);
}

{
  const deps = makeDeps({ botUsernameNoAt: () => '' });
  equal(await handleUserSharingCallback(makeCtx(), { a: 'a:share' }, { id: 1 }, deps), true, 'missing bot username handled');
  check(deps.calls.some(([name]) => name === 'diagnostic'), 'missing bot username emits copy-safety diagnostic');
}
{
  const deps = makeDeps({ CFG: { VERIFICATION_ENABLED: false, BRAND_VERIFY_REQUIRES_EXTENDED: false } });
  equal(await handleUserVerificationCallback(makeCtx(), { a: 'a:verify_home' }, { id: 1 }, deps), true, 'disabled verification handled');
  check(deps.calls.some(([name]) => name === 'call'), 'disabled verification renders safe screen');
}
{
  const deps = makeDeps();
  equal(await handleUserSharingCallback(makeCtx(), { a: 'a:share_redeem', r: 'missing' }, { id: 1 }, deps), true, 'unknown reward handled');
  check(deps.calls.some(([name]) => name === 'call'), 'unknown reward returns bounded screen');
}
{
  const deps = makeDeps();
  equal(await handleUserAccountCallback(makeCtx(), { a: 'a:acc_del_do' }, { id: 1 }, deps), true, 'account tombstone handled');
  check(deps.calls.filter(([name]) => name === 'redisDel').length === 4, 'account tombstone clears four UI/session hints');
}

await assert.rejects(
  () => handleUserSupportCallback(makeCtx(), { a: 'a:support' }, { id: 1 }, {}),
  /user_services_domain\.missing_dependency:/
); assertions += 1;
await assert.rejects(
  () => handleUserVerificationCallback(makeCtx(), { a: 'a:verify_home' }, { id: 1 }, {}),
  /user_services_domain\.missing_dependency:/
); assertions += 1;

const summary = summarizeCallbackOwnership();
equal(summary.extracted, 482, 'STEP590E6 cumulative extracted ownership');
equal(summary.legacy, 78, 'STEP590E6 cumulative legacy ownership');
equal(summary.byRoute[CALLBACK_ROUTE.USER_SUPPORT], 3, 'support route count');
equal(summary.byRoute[CALLBACK_ROUTE.USER_VERIFICATION], 3, 'verification route count');
equal(summary.byRoute[CALLBACK_ROUTE.USER_SHARING], 9, 'sharing route count');
equal(summary.byRoute[CALLBACK_ROUTE.USER_ACCOUNT], 3, 'account route count');

console.log(`PASS STEP590E6 support/verification/sharing/account extraction tests (${assertions} assertions)`);
