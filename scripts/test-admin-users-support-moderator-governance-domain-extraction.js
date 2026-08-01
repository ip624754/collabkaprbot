import assert from 'node:assert/strict';
import {
  ADMIN_USER_ACTIONS,
  ADMIN_GIFT_ACTIONS,
  ADMIN_SUPPORT_ACTIONS,
  ADMIN_MODERATOR_GOVERNANCE_ACTIONS,
} from '../src/bot/domains/adminOperations/actions.js';
import { handleAdminUsersCallback } from '../src/bot/domains/adminOperations/usersCallbacks.js';
import { handleAdminGiftsCallback } from '../src/bot/domains/adminOperations/giftsCallbacks.js';
import { handleAdminSupportCallback } from '../src/bot/domains/adminOperations/supportCallbacks.js';
import { handleAdminModeratorGovernanceCallback } from '../src/bot/domains/adminOperations/moderatorCallbacks.js';
import {
  isAdminOperationCallbackAction,
  isAdminUserAction,
  isAdminGiftAction,
  isAdminSupportAction,
  isAdminModeratorGovernanceAction,
} from '../src/bot/domains/adminOperations/policy.js';
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
    from: { id: 1001, username: 'owner' },
    chat: { id: 1001, type: 'private' },
    state: { cid: 'e5b-test' },
    callbackQuery: { message: { message_id: 11, message_thread_id: 0 } },
    answerCallbackQuery: async (payload) => { calls.push(['ack', payload]); return true; },
    api: {
      sendMessage: async (...args) => { calls.push(['sendMessage', ...args]); return { message_id: 9001 }; },
      editMessageText: async (...args) => { calls.push(['editMessageText', ...args]); return true; },
    },
  };
}

function makeDb() {
  const calls = [];
  const fixed = {
    getUserCardById: { id: 77, tg_id: 2002, tg_username: 'target' },
    getUserTgIdByUserId: { id: 77, tg_id: 2002, tg_username: 'target' },
    findUserByUsername: { id: 77, tg_id: 2002, tg_username: 'target' },
    listWorkspaces: [{ id: 88 }],
    setSupportThreadStatusForAdmin: { ok: true },
  };
  return new Proxy({ calls }, {
    get(target, prop) {
      if (prop === 'calls') return calls;
      return async (...args) => {
        calls.push([String(prop), ...args]);
        if (Object.prototype.hasOwnProperty.call(fixed, prop)) return fixed[prop];
        return true;
      };
    },
  });
}

function makeDeps({ admin = true } = {}) {
  const calls = [];
  const db = makeDb();
  const redisStore = new Map();
  const call = async (...args) => { calls.push(['call', ...args]); return null; };
  const deps = {
    calls,
    BRAND_PLANS: [
      { id: 'start', credits: 10 },
      { id: 'pro', credits: 25 },
    ],
    CFG: { BRAND_PLAN_DURATION_DAYS: 30, PRO_DURATION_DAYS: 30 },
    DEGRADED_COPY: { line: 'Попробуй позже.' },
    InlineKeyboard,
    TG_SAFE_BODY_MAX: 3000,
    bot: { api: { sendMessage: async (...args) => { calls.push(['botSendMessage', ...args]); return true; } } },
    clearAdminUserNote: call,
    clearAdminUsersQuery: call,
    clearDraft: call,
    clearExpectText: call,
    clipCodepoints: (value) => ({ text: String(value || '') }),
    db,
    escapeHtml: (value) => String(value ?? ''),
    getAdminDmTemplatesWithMeta: async () => ({ tpls: { items: [] } }),
    getAdminUsersQuery: async () => '',
    invalidateRoleFlagsCache: call,
    isSuperAdminTg: () => admin,
    k: (parts) => parts.join(':'),
    kbAdminFooter: (kb) => kb,
    redis: {
      get: async (key) => redisStore.get(String(key)) ?? null,
      set: async (key, value) => { redisStore.set(String(key), value); return true; },
      del: async (key) => { redisStore.delete(String(key)); return true; },
    },
    renderAdminModerators: call,
    renderAdminSupportHome: call,
    renderAdminSupportList: call,
    renderAdminSupportThread: call,
    renderAdminUserCard: call,
    renderAdminUserNote: call,
    renderAdminUsers: call,
    ruPlural: (_n, one) => one,
    safeEditOrReply: call,
    sendAdminMessageToUser: call,
    sendAdminUsersCsv: call,
    setExpectText: call,
    toggleAdminUserNoteTag: call,
  };
  return deps;
}

const all = [
  ...ADMIN_USER_ACTIONS,
  ...ADMIN_GIFT_ACTIONS,
  ...ADMIN_SUPPORT_ACTIONS,
  ...ADMIN_MODERATOR_GOVERNANCE_ACTIONS,
];

equal(ADMIN_USER_ACTIONS.length, 20, 'admin users action count');
equal(ADMIN_GIFT_ACTIONS.length, 8, 'admin gifts action count');
equal(ADMIN_SUPPORT_ACTIONS.length, 7, 'admin support action count');
equal(ADMIN_MODERATOR_GOVERNANCE_ACTIONS.length, 3, 'admin moderator governance action count');
equal(new Set(all).size, 38, 'STEP590E5B actions unique');

for (const action of ADMIN_USER_ACTIONS) {
  check(isAdminUserAction(action), `${action} user predicate`);
  check(isAdminOperationCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.ADMIN_USERS, `${action} owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} phase`);
}
for (const action of ADMIN_GIFT_ACTIONS) {
  check(isAdminGiftAction(action), `${action} gift predicate`);
  check(isAdminOperationCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.ADMIN_GIFTS, `${action} owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} phase`);
}
for (const action of ADMIN_SUPPORT_ACTIONS) {
  check(isAdminSupportAction(action), `${action} support predicate`);
  check(isAdminOperationCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.ADMIN_SUPPORT, `${action} owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} phase`);
}
for (const action of ADMIN_MODERATOR_GOVERNANCE_ACTIONS) {
  check(isAdminModeratorGovernanceAction(action), `${action} moderator predicate`);
  check(isAdminOperationCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.ADMIN_MODERATOR_GOVERNANCE, `${action} owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} phase`);
}

equal(await handleAdminUsersCallback(makeCtx(), { a: 'a:adm_gift' }, { id: 1 }, makeDeps()), false, 'users handler rejects gift action');
equal(await handleAdminGiftsCallback(makeCtx(), { a: 'a:admin_support' }, { id: 1 }, makeDeps()), false, 'gifts handler rejects support action');
equal(await handleAdminSupportCallback(makeCtx(), { a: 'a:admin_mod_list' }, { id: 1 }, makeDeps()), false, 'support handler rejects moderator action');
equal(await handleAdminModeratorGovernanceCallback(makeCtx(), { a: 'a:admin_users' }, { id: 1 }, makeDeps()), false, 'moderator handler rejects users action');

for (const action of ADMIN_USER_ACTIONS) {
  const deps = makeDeps({ admin: false });
  equal(await handleAdminUsersCallback(makeCtx(), { a: action }, { id: 1 }, deps), true, `${action} unauthorized execution handled`);
  equal(deps.db.calls.length, 0, `${action} unauthorized execution cannot mutate DB`);
}
for (const action of ADMIN_GIFT_ACTIONS) {
  const deps = makeDeps({ admin: false });
  equal(await handleAdminGiftsCallback(makeCtx(), { a: action }, { id: 1 }, deps), true, `${action} unauthorized execution handled`);
  equal(deps.db.calls.length, 0, `${action} unauthorized execution cannot mutate DB`);
}
for (const action of ADMIN_SUPPORT_ACTIONS) {
  const deps = makeDeps({ admin: false });
  equal(await handleAdminSupportCallback(makeCtx(), { a: action }, { id: 1 }, deps), true, `${action} unauthorized execution handled`);
  equal(deps.db.calls.length, 0, `${action} unauthorized execution cannot mutate DB`);
}
for (const action of ADMIN_MODERATOR_GOVERNANCE_ACTIONS) {
  const deps = makeDeps({ admin: false });
  equal(await handleAdminModeratorGovernanceCallback(makeCtx(), { a: action }, { id: 1 }, deps), true, `${action} unauthorized execution handled`);
  equal(deps.db.calls.length, 0, `${action} unauthorized execution cannot mutate DB`);
}

await assert.rejects(
  () => handleAdminUsersCallback(makeCtx(), { a: 'a:admin_users' }, { id: 1 }, {}),
  /admin_operations_domain\.missing_dependency:/
);
assertions += 1;
await assert.rejects(
  () => handleAdminGiftsCallback(makeCtx(), { a: 'a:adm_gift' }, { id: 1 }, {}),
  /admin_operations_domain\.missing_dependency:/
);
assertions += 1;
await assert.rejects(
  () => handleAdminSupportCallback(makeCtx(), { a: 'a:admin_support' }, { id: 1 }, {}),
  /admin_operations_domain\.missing_dependency:/
);
assertions += 1;
await assert.rejects(
  () => handleAdminModeratorGovernanceCallback(makeCtx(), { a: 'a:admin_mod_list' }, { id: 1 }, {}),
  /admin_operations_domain\.missing_dependency:/
);
assertions += 1;

{
  const deps = makeDeps();
  equal(await handleAdminUsersCallback(makeCtx(), { a: 'a:admin_users', f: 'all', p: 0 }, { id: 1 }, deps), true, 'admin users list handled');
  check(deps.calls.some(([name]) => name === 'call'), 'admin users renderer called');
}
{
  const deps = makeDeps();
  equal(await handleAdminUsersCallback(makeCtx(), { a: 'a:adm_uban_do', id: 77, v: 1, f: 'all', p: 0 }, { id: 1 }, deps), true, 'admin ban handled');
  equal(deps.db.calls.filter(([name]) => name === 'banUser').length, 1, 'ban mutates DB exactly once');
}
{
  const deps = makeDeps({ admin: false });
  equal(await handleAdminUsersCallback(makeCtx(), { a: 'a:adm_uban_do', id: 77, v: 1 }, { id: 1 }, deps), true, 'unauthorized ban handled safely');
  equal(deps.db.calls.filter(([name]) => name === 'banUser').length, 0, 'unauthorized actor cannot ban');
}
{
  const deps = makeDeps({ admin: false });
  equal(await handleAdminGiftsCallback(makeCtx(), { a: 'a:adm_gift_do', t: 'pro', u: 'target' }, { id: 1 }, deps), true, 'unauthorized gift handled safely');
  equal(deps.db.calls.length, 0, 'unauthorized actor cannot grant gift');
}
{
  const deps = makeDeps();
  equal(await handleAdminSupportCallback(makeCtx(), { a: 'a:admin_support_set', id: 12, st: 'closed', s: 'all', p: 0 }, { id: 1 }, deps), true, 'support status handled');
  equal(deps.db.calls.filter(([name]) => name === 'setSupportThreadStatusForAdmin').length, 1, 'support status mutates DB exactly once');
}
{
  const deps = makeDeps({ admin: false });
  equal(await handleAdminSupportCallback(makeCtx(), { a: 'a:admin_support_set', id: 12, st: 'closed' }, { id: 1 }, deps), true, 'unauthorized support status handled safely');
  equal(deps.db.calls.filter(([name]) => name === 'setSupportThreadStatusForAdmin').length, 0, 'unauthorized actor cannot update support status');
}
{
  const deps = makeDeps();
  equal(await handleAdminModeratorGovernanceCallback(makeCtx(), { a: 'a:admin_mod_rm', uid: 77 }, { id: 1 }, deps), true, 'moderator removal handled');
  equal(deps.db.calls.filter(([name]) => name === 'removeNetworkModerator').length, 1, 'moderator removed exactly once');
}
{
  const deps = makeDeps({ admin: false });
  equal(await handleAdminModeratorGovernanceCallback(makeCtx(), { a: 'a:admin_mod_rm', uid: 77 }, { id: 1 }, deps), true, 'unauthorized moderator removal handled safely');
  equal(deps.db.calls.filter(([name]) => name === 'removeNetworkModerator').length, 0, 'unauthorized actor cannot remove moderator');
}

const summary = summarizeCallbackOwnership();
equal(summary.extracted, 407, 'STEP590E5B cumulative extracted ownership');
equal(summary.legacy, 153, 'STEP590E5B cumulative legacy ownership');
equal(summary.byRoute[CALLBACK_ROUTE.ADMIN_USERS], 20, 'admin users route count');
equal(summary.byRoute[CALLBACK_ROUTE.ADMIN_GIFTS], 8, 'admin gifts route count');
equal(summary.byRoute[CALLBACK_ROUTE.ADMIN_SUPPORT], 7, 'admin support route count');
equal(summary.byRoute[CALLBACK_ROUTE.ADMIN_MODERATOR_GOVERNANCE], 3, 'admin moderator governance route count');
equal(getCallbackOwnership('a:adm_umsg_tpl').routeId, CALLBACK_ROUTE.LEGACY, 'message template selection remains legacy for STEP590E5C');
equal(getCallbackOwnership('a:admin_umsg_tpls').routeId, CALLBACK_ROUTE.LEGACY, 'admin message templates remain legacy for STEP590E5C');
equal(getCallbackOwnership('a:admin_outbox').routeId, CALLBACK_ROUTE.LEGACY, 'admin outbox remains legacy for STEP590E5C');

console.log(`PASS STEP590E5B admin users/support/moderator governance extraction tests (${assertions} assertions)`);
