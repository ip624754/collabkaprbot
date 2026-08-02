import assert from 'node:assert/strict';
import {
  WORKSPACE_PROFILE_ACTIONS,
  WORKSPACE_SOCIAL_ACTIONS,
} from '../src/bot/domains/workspaces/actions.js';
import { handleWorkspaceProfileCallback } from '../src/bot/domains/workspaces/profileCallbacks.js';
import { handleWorkspaceSocialCallback } from '../src/bot/domains/workspaces/socialCallbacks.js';
import {
  isWorkspaceCallbackAction,
  isWorkspaceProfileAction,
  isWorkspaceSocialAction,
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
    chat: { id: 2001 },
    callbackQuery: { message: { message_id: 3001 } },
    answerCallbackQuery: async (payload) => { calls.push(['ack', payload]); },
    reply: async (text, extra) => { calls.push(['reply', text, extra]); return { message_id: 1, chat: { id: 1 } }; },
  };
}

function makeDb() {
  const calls = [];
  const workspace = {
    id: 7,
    owner_user_id: 55,
    channel_username: 'workspace',
    title: 'Workspace',
    profile_verticals: [],
    profile_formats: [],
    profile_contacts: {},
    profile_contact: '@owner',
  };
  const values = {
    getWorkspace: workspace,
    getWorkspaceAny: workspace,
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

function makeDeps({ igUiEnabled = false } = {}) {
  const call = async () => null;
  const db = makeDb();
  return {
    BX_HOME: { BX_OPEN: 'bx_open', MENU: 'menu' },
    CFG: {
      IG_OAUTH_UI_ENABLED: igUiEnabled,
      IG_OAUTH_ENABLED: false,
      IG_TOKEN_ENC_KEY_VALID: false,
      IG_OAUTH_CLIENT_ID: '',
      IG_OAUTH_CLIENT_SECRET: '',
      PUBLIC_BASE_URL: '',
    },
    InlineKeyboard,
    answerRecovery: call,
    clearExpectText: call,
    copySafetyRecoveryKb: () => new InlineKeyboard(),
    copySafetyUnavailableHtml: (value) => String(value),
    db,
    deLinkifyText: (value) => String(value),
    detectLegacyContactForMigration: () => ({ ok: false, reason: 'no_match' }),
    escapeHtml: (value) => String(value),
    isSuperAdminTg: () => false,
    k: (parts) => parts.join(':'),
    navKb: () => new InlineKeyboard(),
    randomToken: () => 'token123',
    redis: { set: call, get: call, del: call },
    renderStaleButton: call,
    renderWsIgDmTemplate: call,
    renderWsIgTemplatesMenu: call,
    renderWsIgVerifyComment: call,
    renderWsIgVerifyStart: call,
    renderWsIgVerifyStatus: call,
    renderWsProfile: call,
    renderWsProfileContactsClearMenu: call,
    renderWsProfileContactsStructured: call,
    renderWsProfileFormats: call,
    renderWsProfileMode: call,
    renderWsProfileVerticals: call,
    renderWsShareMenu: call,
    reportCopySafetyDiagnostic: () => null,
    resolveBxHomeFromUi: async () => 'menu',
    safeEditOrReply: call,
    sendWsIgTemplateMessage: call,
    sendWsShareTextMessage: call,
    setExpectText: call,
    wsProfileContactsObj: () => ({}),
  };
}

const user = { id: 55 };

equal(WORKSPACE_PROFILE_ACTIONS.length, 18, 'workspace profile action count');
equal(WORKSPACE_SOCIAL_ACTIONS.length, 9, 'workspace social action count');
equal(new Set([...WORKSPACE_PROFILE_ACTIONS, ...WORKSPACE_SOCIAL_ACTIONS]).size, 27, 'STEP590E3B actions unique');

for (const action of WORKSPACE_PROFILE_ACTIONS) {
  check(isWorkspaceProfileAction(action), `${action} profile predicate`);
  check(isWorkspaceCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.WORKSPACE_PROFILE, `${action} route owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} route phase`);
  const handled = await handleWorkspaceProfileCallback(
    makeCtx(),
    { a: action, ws: 7, w: 7, f: 'contact', k: 'tg', m: 'both', v: 'beauty' },
    user,
    makeDeps()
  );
  equal(handled, true, `${action} executable profile handler contract`);
}

for (const action of WORKSPACE_SOCIAL_ACTIONS) {
  check(isWorkspaceSocialAction(action), `${action} social predicate`);
  check(isWorkspaceCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.WORKSPACE_SOCIAL, `${action} route owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} route phase`);
  const handled = await handleWorkspaceSocialCallback(
    makeCtx(),
    { a: action, ws: 7, w: 7, t: 'story', tone: 'soft', i: 0, ret: 'ws_profile' },
    user,
    makeDeps()
  );
  equal(handled, true, `${action} executable social handler contract`);
}

equal(await handleWorkspaceProfileCallback(makeCtx(), { a: 'a:ws_share' }, user, makeDeps()), false, 'profile rejects social action');
equal(await handleWorkspaceSocialCallback(makeCtx(), { a: 'a:ws_profile' }, user, makeDeps()), false, 'social rejects profile action');
equal(await handleWorkspaceProfileCallback(makeCtx(), { a: 'a:pm_home' }, user, makeDeps()), false, 'profile rejects foreign action');
equal(await handleWorkspaceSocialCallback(makeCtx(), { a: 'a:pm_home' }, user, makeDeps()), false, 'social rejects foreign action');

{
  const deps = makeDeps();
  equal(await handleWorkspaceProfileCallback(makeCtx(), { a: 'a:ws_prof_mode_set', ws: 7, m: 'both' }, user, deps), true, 'profile mode mutation handled');
  equal(deps.db.calls.filter(([name]) => name === 'setWorkspaceSetting').length, 1, 'profile mode writes exactly once');
  equal(deps.db.calls.filter(([name]) => name === 'auditWorkspace').length, 1, 'profile mode audit writes exactly once');
}

{
  const deps = makeDeps();
  equal(await handleWorkspaceProfileCallback(makeCtx(), { a: 'a:ws_prof_clear', ws: 7, f: 'contact' }, user, deps), true, 'profile clear handled');
  equal(deps.db.calls.filter(([name]) => name === 'setWorkspaceSetting').length, 1, 'profile clear writes exactly once');
  equal(deps.db.calls.filter(([name]) => name === 'auditWorkspace').length, 1, 'profile clear audit writes exactly once');
}

{
  const deps = makeDeps({ igUiEnabled: false });
  equal(await handleWorkspaceSocialCallback(makeCtx(), { a: 'a:ws_ig_verify_oauth', ws: 7 }, user, deps), true, 'disabled IG OAuth callback handled');
  equal(deps.db.calls.some(([name]) => name === 'getWorkspace'), false, 'disabled IG OAuth never reads workspace or creates token');
}

{
  const deps = makeDeps({ igUiEnabled: true });
  equal(await handleWorkspaceSocialCallback(makeCtx(), { a: 'a:ws_ig_verify_oauth', ws: 7 }, user, deps), true, 'misconfigured IG OAuth callback handled fail-closed');
  equal(deps.db.calls.some(([name]) => name === 'getWorkspace'), false, 'misconfigured IG OAuth never reads workspace');
}

{
  const deps = makeDeps({ igUiEnabled: true });
  deps.CFG.IG_OAUTH_ENABLED = true;
  deps.CFG.IG_TOKEN_ENC_KEY_VALID = true;
  deps.CFG.IG_OAUTH_CLIENT_ID = 'client';
  deps.CFG.IG_OAUTH_CLIENT_SECRET = 'secret';
  deps.CFG.PUBLIC_BASE_URL = 'https://example.test';
  let redisWrites = 0;
  deps.redis.set = async () => { redisWrites += 1; };
  equal(await handleWorkspaceSocialCallback(makeCtx(), { a: 'a:ws_ig_verify_oauth', ws: 7 }, user, deps), true, 'configured IG OAuth callback handled');
  equal(redisWrites, 1, 'configured IG OAuth writes one bounded token');
  equal(deps.db.calls.filter(([name]) => name === 'getWorkspace').length, 1, 'configured IG OAuth validates workspace exactly once');
}

{
  const deps = makeDeps();
  equal(await handleWorkspaceProfileCallback(makeCtx(), { a: 'a:ws_prof_reset_ok', ws: 7 }, user, deps), true, 'profile reset confirmation handled');
  equal(deps.db.calls.filter(([name]) => name === 'setWorkspaceSetting').length, 1, 'profile reset writes once');
  equal(deps.db.calls.filter(([name]) => name === 'auditWorkspace').length, 1, 'profile reset audit writes once');
}

await assert.rejects(
  () => handleWorkspaceProfileCallback(makeCtx(), { a: 'a:ws_profile', ws: 7 }, user, {}),
  /workspace_domain\.missing_dependency:/
);
assertions += 1;
await assert.rejects(
  () => handleWorkspaceSocialCallback(makeCtx(), { a: 'a:ws_share', ws: 7 }, user, {}),
  /workspace_domain\.missing_dependency:/
);
assertions += 1;

const summary = summarizeCallbackOwnership();
equal(summary.extracted, 464, 'STEP590E5D cumulative extracted ownership');
equal(summary.legacy, 96, 'STEP590E5D cumulative legacy ownership');
equal(summary.byRoute[CALLBACK_ROUTE.WORKSPACE_PROFILE], 18, 'workspace profile route count');
equal(summary.byRoute[CALLBACK_ROUTE.WORKSPACE_SOCIAL], 9, 'workspace social route count');
equal(getCallbackOwnership('a:ws_pro_buy').routeId, CALLBACK_ROUTE.PAYMENT_PURCHASE, 'workspace checkout remains payment-owned');
equal(getCallbackOwnership('a:wsp_lead_new').routeId, CALLBACK_ROUTE.LEAD_ACQUISITION, 'workspace lead remains lead-owned');

console.log(`PASS STEP590E3B workspace profile/social extraction tests (${assertions} assertions)`);
