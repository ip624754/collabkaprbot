import assert from 'node:assert/strict';
import {
  BRAND_MANAGER_MODE_ACTIONS,
  BRAND_TEAM_MEMBERSHIP_ACTIONS,
} from '../src/bot/domains/brands/actions.js';
import { handleBrandManagerModeCallback } from '../src/bot/domains/brands/managerCallbacks.js';
import { handleBrandTeamMembershipCallback } from '../src/bot/domains/brands/teamCallbacks.js';
import {
  isBrandCallbackAction,
  isBrandManagerModeAction,
  isBrandTeamMembershipAction,
} from '../src/bot/domains/brands/policy.js';
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
  url() { return this; }
}

function makeCtx() {
  const calls = [];
  return {
    calls,
    from: { id: 1001 },
    chat: { id: 2001, type: 'private' },
    state: { cid: 'e4b-test' },
    callbackQuery: { message: { message_id: 3001 } },
    answerCallbackQuery: async (payload) => { calls.push(['ack', payload]); },
    api: {
      sendMessage: async (...args) => { calls.push(['sendMessage', ...args]); return { message_id: 9001 }; },
    },
  };
}

function makeDeps({ afterRemovalManagers = [{ user_id: 77, tg_id: 777, tg_username: 'other' }] } = {}) {
  const calls = [];
  let removed = false;
  const db = {
    calls,
    listBrandsForManager: async (...args) => { calls.push(['listBrandsForManager', ...args]); return [{ user_id: 55 }]; },
    listBrandManagers: async (...args) => {
      calls.push(['listBrandManagers', ...args]);
      if (removed) return afterRemovalManagers;
      return [{ user_id: 77, tg_id: 777, tg_username: 'manager' }];
    },
    getUserTgIdByUserId: async (...args) => { calls.push(['getUserTgIdByUserId', ...args]); return { tg_id: 777, tg_username: 'manager' }; },
    removeBrandManager: async (...args) => { calls.push(['removeBrandManager', ...args]); removed = true; return true; },
    getBrandProfile: async (...args) => { calls.push(['getBrandProfile', ...args]); return { brand_name: 'Brand' }; },
  };
  const call = async (...args) => { calls.push(['call', ...args]); return null; };
  return {
    calls,
    BX_HOME: { BX_OPEN: 'bx_open', MENU: 'menu' },
    UI_MODES: { BRAND: 'brand', CREATOR: 'creator' },
    CFG: { BOT_USERNAME: 'collabka_test_bot' },
    InlineKeyboard,
    bmNoAccessHtml: () => 'no access',
    copySafetyRecoveryKb: () => new InlineKeyboard(),
    copySafetyUnavailableHtml: (value) => String(value),
    db,
    disableBrandManagerState: async (...args) => { calls.push(['disableBrandManagerState', ...args]); },
    getRoleFlags: async () => ({ isBrand: true }),
    isMissingRelationError: () => false,
    navKb: () => new InlineKeyboard(),
    normBxRet: (value) => String(value || 'menu'),
    renderBmPickBrand: call,
    renderBrandAppsList: call,
    renderBrandDealsList: call,
    renderBxFeed: call,
    renderBxFilters: call,
    renderBxInbox: call,
    renderBxOpen: call,
    renderMainMenu: call,
    renderProfileMatchingHome: call,
    reportCopySafetyDiagnostic: () => null,
    resolveBmBrandContext: async () => ({ enabled: true, needsPick: false, brandUserId: 55 }),
    resolveBxHomeFromUi: async () => 'menu',
    safeEditOrReply: call,
    setBmActiveBrand: async (...args) => { calls.push(['setBmActiveBrand', ...args]); },
    setBrandManagerMode: async (...args) => { calls.push(['setBrandManagerMode', ...args]); },
    setUiMode: async (...args) => { calls.push(['setUiMode', ...args]); },
    brandManagerLimitInfo: async () => ({ count: 1, max: 5 }),
    brandManagerRemoveConfirmKb: () => new InlineKeyboard(),
    brandManagersListKb: () => new InlineKeyboard(),
    brandTeamKb: () => new InlineKeyboard(),
    clearBmActiveBrand: async (...args) => { calls.push(['clearBmActiveBrand', ...args]); },
    ensureBrandTeamUnlocked: async () => ({ ok: true }),
    escapeHtml: (value) => String(value),
    getBmActiveBrand: async () => 55,
    k: (parts) => parts.join(':'),
    randomToken: () => 'token123',
    redis: { set: async (...args) => { calls.push(['redis.set', ...args]); return 'OK'; } },
    safeBrandProfiles: async (primary, fallback) => {
      try { return await primary(); } catch { return fallback ? fallback() : null; }
    },
    setExpectText: async (...args) => { calls.push(['setExpectText', ...args]); },
  };
}

const user = { id: 55 };
const payload = (action) => ({
  a: action,
  u: 55,
  bu: 55,
  w: 7,
  ws: 7,
  p: 0,
  h: 'menu',
  r: 'menu',
  ret: action === 'a:bm_set_brand' || action === 'a:bms' ? 'menu' : 'profile',
  rt: 'menu',
  v: '1',
});

equal(BRAND_MANAGER_MODE_ACTIONS.length, 6, 'manager-mode action count');
equal(BRAND_TEAM_MEMBERSHIP_ACTIONS.length, 7, 'team-membership action count');
equal(new Set([...BRAND_MANAGER_MODE_ACTIONS, ...BRAND_TEAM_MEMBERSHIP_ACTIONS]).size, 13, 'STEP590E4B actions unique');

for (const action of BRAND_MANAGER_MODE_ACTIONS) {
  check(isBrandManagerModeAction(action), `${action} manager-mode predicate`);
  check(isBrandCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.BRAND_MANAGER_MODE, `${action} owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} phase`);
  equal(await handleBrandManagerModeCallback(makeCtx(), payload(action), user, makeDeps()), true, `${action} executable handler`);
}

for (const action of BRAND_TEAM_MEMBERSHIP_ACTIONS) {
  check(isBrandTeamMembershipAction(action), `${action} team-membership predicate`);
  check(isBrandCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.BRAND_TEAM_MEMBERSHIP, `${action} owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} phase`);
  equal(await handleBrandTeamMembershipCallback(makeCtx(), payload(action), user, makeDeps()), true, `${action} executable handler`);
}

equal(await handleBrandManagerModeCallback(makeCtx(), { a: 'a:brand_team' }, user, makeDeps()), false, 'manager handler rejects team action');
equal(await handleBrandTeamMembershipCallback(makeCtx(), { a: 'a:bm_home' }, user, makeDeps()), false, 'team handler rejects manager action');
equal(await handleBrandTeamMembershipCallback(makeCtx(), { a: 'a:cur_home' }, user, makeDeps()), false, 'team handler rejects curator action');

await assert.rejects(
  () => handleBrandManagerModeCallback(makeCtx(), { a: 'a:bm_home' }, user, {}),
  /brand_domain\.missing_dependency:/
);
assertions += 1;
await assert.rejects(
  () => handleBrandTeamMembershipCallback(makeCtx(), { a: 'a:brand_team' }, user, {}),
  /brand_domain\.missing_dependency:/
);
assertions += 1;

{
  const deps = makeDeps({ afterRemovalManagers: [] });
  const ctx = makeCtx();
  equal(await handleBrandTeamMembershipCallback(ctx, payload('a:bm_rm_ok'), user, deps), true, 'last-manager removal handled');
  equal(deps.db.calls.filter(([name]) => name === 'removeBrandManager').length, 1, 'manager removed exactly once');
  check(ctx.calls.some(([name]) => name === 'sendMessage'), 'removed manager notification attempted');
}

const summary = summarizeCallbackOwnership();
equal(summary.extracted, 336, 'STEP590E4B cumulative extracted ownership');
equal(summary.legacy, 224, 'STEP590E4B cumulative legacy ownership');
equal(summary.byRoute[CALLBACK_ROUTE.BRAND_MANAGER_MODE], 6, 'manager-mode route count');
equal(summary.byRoute[CALLBACK_ROUTE.BRAND_TEAM_MEMBERSHIP], 7, 'team-membership route count');
equal(getCallbackOwnership('a:brand_buy').routeId, CALLBACK_ROUTE.PAYMENT_PURCHASE, 'brand checkout remains payment-owned');
equal(getCallbackOwnership('a:brand_apps').routeId, CALLBACK_ROUTE.APPLICATION_BRAND, 'brand applications remain application-owned');
equal(getCallbackOwnership('a:cur_home').routeId, CALLBACK_ROUTE.LEGACY, 'curator remains legacy for STEP590E4C');

console.log(`PASS STEP590E4B brand team/manager extraction tests (${assertions} assertions)`);
