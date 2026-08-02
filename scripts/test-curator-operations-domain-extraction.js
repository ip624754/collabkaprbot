import assert from 'node:assert/strict';
import {
  CURATOR_MANAGEMENT_ACTIONS,
  CURATOR_OPERATION_ACTIONS,
} from '../src/bot/domains/curators/actions.js';
import { handleCuratorOperationsCallback } from '../src/bot/domains/curators/operationsCallbacks.js';
import { handleCuratorManagementCallback } from '../src/bot/domains/curators/managementCallbacks.js';
import {
  isCuratorCallbackAction,
  isCuratorManagementAction,
  isCuratorOperationAction,
} from '../src/bot/domains/curators/policy.js';
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
    from: { id: 1001, username: 'curator', first_name: 'Curator', last_name: 'Test' },
    chat: { id: 2001, type: 'private' },
    state: { cid: 'e4c-test' },
    callbackQuery: { message: { message_id: 3001 } },
    answerCallbackQuery: async (payload) => { calls.push(['ack', payload]); },
    api: {
      sendMessage: async (...args) => { calls.push(['sendMessage', ...args]); return { message_id: 9001 }; },
    },
  };
}

function makeDeps() {
  const calls = [];
  const db = {
    calls,
    listCuratorWorkspaces: async (...args) => { calls.push(['listCuratorWorkspaces', ...args]); return [{ id: 7 }]; },
    getWorkspaceAny: async (...args) => { calls.push(['getWorkspaceAny', ...args]); return { id: 7, title: 'Workspace' }; },
    removeCurator: async (...args) => { calls.push(['removeCurator', ...args]); return true; },
    auditWorkspace: async (...args) => { calls.push(['auditWorkspace', ...args]); return true; },
    getGiveawayForCurator: async (...args) => { calls.push(['getGiveawayForCurator', ...args]); return { id: 9, workspace_id: 7 }; },
    auditGiveaway: async (...args) => { calls.push(['auditGiveaway', ...args]); return true; },
    getWorkspace: async (...args) => { calls.push(['getWorkspace', ...args]); return { id: 7, title: 'Workspace', status: 'active' }; },
    getUserTgIdByUserId: async (...args) => { calls.push(['getUserTgIdByUserId', ...args]); return { tg_id: 777, tg_username: 'curator2' }; },
  };
  const call = async (...args) => { calls.push(['call', ...args]); return null; };
  return {
    calls,
    BX_HOME: { BX_OPEN: 'bx_open', MENU: 'menu' },
    CFG: { BOT_USERNAME: 'collabka_test_bot' },
    InlineKeyboard,
    UI_MODES: { CREATOR: 'creator' },
    answerRecovery: call,
    clearExpectText: call,
    db,
    disableBrandManagerState: call,
    escapeHtml: (value) => String(value),
    getRoleFlags: async () => ({ isCurator: true, isAdmin: false }),
    invalidateRoleFlagsCache: call,
    isWorkspaceDisconnected: () => false,
    k: (parts) => parts.join(':'),
    leadStatusFromCb: (value) => String(value || 'new'),
    navKb: () => new InlineKeyboard(),
    randomToken: () => 'token123',
    redis: { set: async (...args) => { calls.push(['redis.set', ...args]); return 'OK'; } },
    redisHealthOkQuick: async () => true,
    renderCuratorAudit: call,
    renderCuratorGiveawayLog: call,
    renderCuratorGiveawayOpen: call,
    renderCuratorGiveawayOwnerNotifyQ: call,
    renderCuratorGiveawayOwnerNotifySend: call,
    renderCuratorGiveawayRemindQ: call,
    renderCuratorGiveawayRemindSend: call,
    renderCuratorGiveawayStats: call,
    renderCuratorHome: call,
    renderCuratorInbox: call,
    renderCuratorList: call,
    renderCuratorManage: call,
    renderMainMenu: call,
    renderRecovery: call,
    renderRoleHub: call,
    renderWsDisconnected: call,
    reportCopySafetyDiagnostic: () => null,
    resolveBxHomeFromUi: async () => 'menu',
    retFromCb: (value) => String(value || ''),
    safeEditOrReply: call,
    setCuratorMode: call,
    setCurGwChecked: call,
    setExpectText: call,
    setUiMode: call,
    wsLabelNice: (ws) => String(ws?.title || 'Workspace'),
  };
}

const user = { id: 55 };
const payload = (action) => ({
  a: action,
  w: 7,
  ws: 7,
  i: 9,
  u: 77,
  l: 0,
  p: 0,
  g: 0,
  pg: 0,
  s: 'n',
  af: 'all',
  ret: action === 'a:cur_mode_set' ? 'cur' : 'manage',
  r: '',
  b: 'cm',
  v: '1',
});

equal(CURATOR_OPERATION_ACTIONS.length, 16, 'curator operation action count');
equal(CURATOR_MANAGEMENT_ACTIONS.length, 7, 'curator management action count');
equal(new Set([...CURATOR_OPERATION_ACTIONS, ...CURATOR_MANAGEMENT_ACTIONS]).size, 23, 'STEP590E4C actions unique');

for (const action of CURATOR_OPERATION_ACTIONS) {
  check(isCuratorOperationAction(action), `${action} operation predicate`);
  check(isCuratorCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.CURATOR_OPERATIONS, `${action} owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} phase`);
  equal(await handleCuratorOperationsCallback(makeCtx(), payload(action), user, makeDeps()), true, `${action} executable handler`);
}

for (const action of CURATOR_MANAGEMENT_ACTIONS) {
  check(isCuratorManagementAction(action), `${action} management predicate`);
  check(isCuratorCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.CURATOR_MANAGEMENT, `${action} owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} phase`);
  equal(await handleCuratorManagementCallback(makeCtx(), payload(action), user, makeDeps()), true, `${action} executable handler`);
}

equal(await handleCuratorOperationsCallback(makeCtx(), { a: 'a:cur_manage' }, user, makeDeps()), false, 'operations handler rejects management action');
equal(await handleCuratorManagementCallback(makeCtx(), { a: 'a:cur_home' }, user, makeDeps()), false, 'management handler rejects operations action');
equal(await handleCuratorManagementCallback(makeCtx(), { a: 'a:brand_team' }, user, makeDeps()), false, 'curator handler rejects brand action');

await assert.rejects(
  () => handleCuratorOperationsCallback(makeCtx(), { a: 'a:cur_home' }, user, {}),
  /curator_domain\.missing_dependency:/
);
assertions += 1;
await assert.rejects(
  () => handleCuratorManagementCallback(makeCtx(), { a: 'a:cur_manage' }, user, {}),
  /curator_domain\.missing_dependency:/
);
assertions += 1;

{
  const deps = makeDeps();
  equal(await handleCuratorOperationsCallback(makeCtx(), payload('a:cur_gw_check_do'), user, deps), true, 'checked mutation handled');
  equal(deps.db.calls.filter(([name]) => name === 'getGiveawayForCurator').length, 1, 'giveaway access checked once');
}
{
  const deps = makeDeps();
  const ctx = makeCtx();
  equal(await handleCuratorManagementCallback(ctx, payload('a:cur_rm_do'), user, deps), true, 'owner removal handled');
  equal(deps.db.calls.filter(([name]) => name === 'removeCurator').length, 1, 'curator removed exactly once');
  check(ctx.calls.some(([name]) => name === 'sendMessage'), 'removed curator notification attempted');
}

const summary = summarizeCallbackOwnership();
equal(summary.extracted, 482, 'STEP590E6 cumulative extracted ownership');
equal(summary.legacy, 78, 'STEP590E6 cumulative legacy ownership');
equal(summary.byRoute[CALLBACK_ROUTE.CURATOR_OPERATIONS], 16, 'curator operations route count');
equal(summary.byRoute[CALLBACK_ROUTE.CURATOR_MANAGEMENT], 7, 'curator management route count');
equal(getCallbackOwnership('a:cur_ws').routeId, CALLBACK_ROUTE.WORKSPACE_CONTROL, 'curator workspace remains workspace-control owned');
equal(getCallbackOwnership('a:curator_home').routeId, CALLBACK_ROUTE.LEGACY, 'registry-only curator alias remains legacy');
equal(getCallbackOwnership('a:curators').routeId, CALLBACK_ROUTE.LEGACY, 'registry-only curators action remains legacy');
equal(getCallbackOwnership('a:curators_home').routeId, CALLBACK_ROUTE.LEGACY, 'registry-only curators-home action remains legacy');

console.log(`PASS STEP590E4C curator operations extraction tests (${assertions} assertions)`);
