import assert from 'node:assert/strict';
import {
  WORKSPACE_CALLBACK_ACTIONS,
  WORKSPACE_CONTROL_ACTIONS,
  WORKSPACE_FOLDER_ACTIONS,
} from '../src/bot/domains/workspaces/actions.js';
import {
  handleWorkspaceControlCallback,
  handleWorkspaceFolderCallback,
} from '../src/bot/domains/workspaces/callbacks.js';
import {
  isWorkspaceCallbackAction,
  isWorkspaceControlAction,
  isWorkspaceFolderAction,
} from '../src/bot/domains/workspaces/policy.js';
import {
  CALLBACK_PHASE,
  CALLBACK_ROUTE,
  getCallbackOwnership,
  summarizeCallbackOwnership,
} from '../src/bot/router/callbackOwnership.js';

let assertions = 0;
const check = (value, message) => { assert.ok(value, message); assertions += 1; };
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };

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
    answerCallbackQuery: async (payload) => { calls.push(['ack', payload]); },
    reply: async (text, extra) => { calls.push(['reply', text, extra]); return { message_id: 1, chat: { id: 1 } }; },
  };
}

function makeDb() {
  const calls = [];
  const values = {
    getWorkspace: { id: 7, owner_user_id: 55, channel_username: 'workspace', title: 'Workspace', curator_enabled: false },
    getWorkspaceAny: { id: 7, owner_user_id: 55, channel_username: 'workspace', title: 'Workspace', curator_enabled: false },
    isWorkspacePro: true,
    listMyBarterOffers: [],
    getChannelFolder: { id: 3, workspace_id: 7, title: 'Folder', items_count: 0 },
    listChannelFolderItems: [],
  };
  return new Proxy({ calls }, {
    get(target, prop) {
      if (prop === 'calls') return calls;
      return async (...args) => {
        calls.push([String(prop), ...args]);
        return Object.prototype.hasOwnProperty.call(values, prop) ? values[prop] : null;
      };
    },
  });
}

function makeDeps() {
  const db = makeDb();
  const call = async () => null;
  return {
    BX_HOME: { BX_OPEN: 'bx_open', MENU: 'menu' },
    CFG: {
      BOT_USERNAME: 'collabkaprbot',
      WORKSPACE_EDITORS_ENABLED: '1',
      WORKSPACE_EDITOR_INVITE_TTL_MIN: 10,
      WORKSPACE_FOLDER_MAX_ITEMS_FREE: 10,
      WORKSPACE_FOLDER_MAX_ITEMS_PRO: 100,
    },
    InlineKeyboard,
    answerRecovery: call,
    clearExpectText: call,
    db,
    escapeHtml: (value) => String(value),
    exportWsHistory: call,
    getActiveWorkspace: async () => 0,
    getFolderAccess: async () => ({ isOwner: true, canEdit: true }),
    getRoleFlags: async () => ({ isCurator: true, isAdmin: false }),
    invalidateRoleFlagsCache: call,
    invalidateWorkspacesCache: call,
    isWorkspaceDisconnected: () => false,
    k: (parts) => parts.join(':'),
    leadStatusFromCb: (value) => value,
    navKb: () => new InlineKeyboard(),
    randomToken: () => 'token123',
    redis: { set: call, del: call, get: call },
    renderBxOpen: call,
    renderCuratorManage: call,
    renderCuratorWorkspace: call,
    renderFolderView: call,
    renderFoldersHome: call,
    renderFoldersMy: call,
    renderNetConfirm: call,
    renderRecovery: call,
    renderSetupInstructions: call,
    renderStaleButton: call,
    renderWsDisconnected: call,
    renderWsEditors: call,
    renderWsHistory: call,
    renderWsInactiveList: call,
    renderWsLeadsList: call,
    renderWsList: call,
    renderWsOpen: call,
    renderWsPro: call,
    renderWsSettings: call,
    resolveBxHomeFromUi: async () => 'menu',
    retFromCb: () => '',
    safeEditOrReply: call,
    setActiveWorkspace: call,
    setExpectText: call,
  };
}

const user = { id: 55 };

equal(WORKSPACE_CONTROL_ACTIONS.length, 22, 'workspace control action count');
equal(WORKSPACE_FOLDER_ACTIONS.length, 17, 'workspace folder action count');
equal(WORKSPACE_CALLBACK_ACTIONS.length, 66, 'workspace cumulative action count');
equal(new Set(WORKSPACE_CALLBACK_ACTIONS).size, 66, 'workspace actions are unique');

for (const action of WORKSPACE_CONTROL_ACTIONS) {
  check(isWorkspaceControlAction(action), `${action} control predicate`);
  check(isWorkspaceCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.WORKSPACE_CONTROL, `${action} route owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} route phase`);
  const handled = await handleWorkspaceControlCallback(makeCtx(), { a: action, ws: 7, w: 7, f: 3, o: 9, u: 77, v: '1' }, user, makeDeps());
  equal(handled, true, `${action} executable handler contract`);
}

for (const action of WORKSPACE_FOLDER_ACTIONS) {
  check(isWorkspaceFolderAction(action), `${action} folder predicate`);
  check(isWorkspaceCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.WORKSPACE_FOLDERS, `${action} route owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} route phase`);
  const handled = await handleWorkspaceFolderCallback(makeCtx(), { a: action, ws: 7, w: 7, f: 3, o: 9, u: 77, v: '1' }, user, makeDeps());
  equal(handled, true, `${action} executable handler contract`);
}

equal(await handleWorkspaceControlCallback(makeCtx(), { a: 'a:folder_open' }, user, makeDeps()), false, 'control rejects folder action');
equal(await handleWorkspaceFolderCallback(makeCtx(), { a: 'a:ws_open' }, user, makeDeps()), false, 'folder rejects control action');
equal(await handleWorkspaceControlCallback(makeCtx(), { a: 'a:pm_home' }, user, makeDeps()), false, 'control rejects foreign action');
equal(await handleWorkspaceFolderCallback(makeCtx(), { a: 'a:pm_home' }, user, makeDeps()), false, 'folder rejects foreign action');

{
  const deps = makeDeps();
  let recoveryCalls = 0;
  let workspaceCalls = 0;
  deps.getRoleFlags = async () => ({ isCurator: false, isAdmin: false });
  deps.renderRecovery = async () => { recoveryCalls += 1; };
  deps.renderCuratorWorkspace = async () => { workspaceCalls += 1; };
  equal(await handleWorkspaceControlCallback(makeCtx(), { a: 'a:cur_ws', ws: 7 }, user, deps), true, 'unauthorized curator callback is handled');
  equal(recoveryCalls, 1, 'unauthorized curator callback uses role recovery');
  equal(workspaceCalls, 0, 'unauthorized curator callback never renders workspace');
}

{
  const deps = makeDeps();
  let recoveryCalls = 0;
  let expectCalls = 0;
  deps.getFolderAccess = async () => null;
  deps.answerRecovery = async () => { recoveryCalls += 1; };
  deps.setExpectText = async () => { expectCalls += 1; };
  equal(await handleWorkspaceFolderCallback(makeCtx(), { a: 'a:folder_add', ws: 7, f: 3 }, user, deps), true, 'denied folder mutation is handled');
  equal(recoveryCalls, 1, 'denied folder mutation uses folder recovery');
  equal(expectCalls, 0, 'denied folder mutation never opens input mode');
  equal(deps.db.calls.some(([name]) => name === 'isWorkspacePro'), false, 'denied folder mutation does not read PRO limits');
}

{
  const deps = makeDeps();
  deps.getFolderAccess = async () => ({ isOwner: false, canEdit: true });
  equal(await handleWorkspaceFolderCallback(makeCtx(), { a: 'a:folder_delete_do', ws: 7, f: 3 }, user, deps), true, 'editor-only delete attempt is handled');
  equal(deps.db.calls.some(([name]) => name === 'deleteChannelFolder'), false, 'editor cannot delete folder');
  equal(deps.db.calls.some(([name]) => name === 'auditWorkspace'), false, 'denied delete does not write audit event');
}

{
  const deps = makeDeps();
  equal(await handleWorkspaceControlCallback(makeCtx(), { a: 'a:net_set', ws: 7, v: '1', ret: 'ws' }, user, deps), true, 'network mutation is handled');
  equal(deps.db.calls.filter(([name]) => name === 'setWorkspaceSetting').length, 1, 'network state written exactly once');
  equal(deps.db.calls.filter(([name]) => name === 'auditWorkspace').length, 1, 'network audit written exactly once');
}

await assert.rejects(
  () => handleWorkspaceControlCallback(makeCtx(), { a: 'a:ws_open', ws: 7 }, user, {}),
  /workspace_domain\.missing_dependency:/
);
assertions += 1;
await assert.rejects(
  () => handleWorkspaceFolderCallback(makeCtx(), { a: 'a:folder_open', ws: 7, f: 3 }, user, {}),
  /workspace_domain\.missing_dependency:/
);
assertions += 1;

const summary = summarizeCallbackOwnership();
equal(summary.extracted, 464, 'STEP590E5D cumulative extracted ownership');
equal(summary.legacy, 96, 'STEP590E5D cumulative legacy ownership');
equal(summary.byRoute[CALLBACK_ROUTE.WORKSPACE_CONTROL], 22, 'workspace control route count');
equal(summary.byRoute[CALLBACK_ROUTE.WORKSPACE_FOLDERS], 17, 'workspace folder route count');
equal(getCallbackOwnership('a:ws_pro_buy').routeId, CALLBACK_ROUTE.PAYMENT_PURCHASE, 'workspace checkout remains payment-owned');
equal(getCallbackOwnership('a:wsp_lead_new').routeId, CALLBACK_ROUTE.LEAD_ACQUISITION, 'workspace lead remains lead-owned');

console.log(`PASS STEP590E3A workspace control/folders extraction tests (${assertions} assertions)`);
