import assert from 'node:assert/strict';
import {
  DIRECTORY_PUBLIC_WORKSPACE_ACTIONS,
  DIRECTORY_SEARCH_ACTIONS,
} from '../src/bot/domains/directory/actions.js';
import {
  handleDirectoryPublicWorkspaceCallback,
  handleDirectorySearchCallback,
} from '../src/bot/domains/directory/callbacks.js';
import {
  isDirectoryCallbackAction,
  isDirectoryPublicWorkspaceAction,
  isDirectorySearchAction,
} from '../src/bot/domains/directory/policy.js';
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
    state: { cid: 'cid-test' },
    update: { update_id: 3001 },
    callbackQuery: { message: { message_id: 4001 } },
    answerCallbackQuery: async (payload) => { calls.push(['ack', payload]); },
    reply: async (text, extra) => { calls.push(['reply', text, extra]); return { message_id: 1, chat: { id: 1 } }; },
  };
}

function makeDb(overrides = {}) {
  const calls = [];
  return new Proxy({ calls, ...overrides }, {
    get(target, prop) {
      if (prop === 'calls') return calls;
      if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];
      return async (...args) => {
        calls.push([String(prop), ...args]);
        if (prop === 'isWorkspaceContactsUnlocked') return false;
        return null;
      };
    },
  });
}

function makeDeps({ dbOverrides = {}, asyncRetry = false } = {}) {
  const call = async () => null;
  const calls = [];
  const redis = {
    get: async (...args) => { calls.push(['redis.get', ...args]); return null; },
    set: async (...args) => { calls.push(['redis.set', ...args]); return null; },
  };
  return {
    calls,
    BRAND_APP_ACCEPT_COST: 1,
    BX_HOME: { BX_OPEN: 'bx_open', MENU: 'menu' },
    CFG: { INTRO_COST_PER_INTRO: 1 },
    CONTACT_UNLOCK_COST: 1,
    CONTACT_UNLOCK_TTL_DAYS: 30,
    CONTACT_UNLOCK_TTL_SEC: 2592000,
    MONETIZATION_CB_TIMEOUT_MS: 2500,
    MONETIZATION_TOKEN_LOCK_TTL_SEC: 30,
    InlineKeyboard,
    PM_LIMITS: { verticals: 3, formats: 3 },
    acquireLock: async () => null,
    answerRecovery: call,
    brandLeadContactUnlockButtonLabel: () => 'Открыть контакты',
    brandLeadDialogButtonLabel: () => 'Диалог',
    brandLeadProfileButtonLabel: () => 'Профиль',
    brandLeadWhatNextText: () => 'Продолжить диалог',
    brandPassCreditsBlockLines: () => ['Баланс: 5'],
    contactUnlockActionLabel: () => 'Открыть контакты',
    contactUnlockBtnLabel: () => 'открытия контактов',
    db: makeDb(dbOverrides),
    deLinkifyText: (value) => String(value),
    enqueueMonetizationRetry: async () => ({ ok: false }),
    escapeHtml: (value) => String(value),
    getBrandCreditsRedisOnly: async () => 5,
    isMonetizationAsyncRetryEnabled: () => asyncRetry,
    isTransientNeonError: () => false,
    k: (parts) => parts.join(':'),
    pmGetState: async () => ({ v: [], f: [] }),
    pmResetState: async (...args) => { calls.push(['pmResetState', ...args]); },
    pmSetState: async (...args) => { calls.push(['pmSetState', ...args]); },
    redis,
    releaseLock: call,
    renderBrandPass: call,
    renderProfileMatchingHome: async (...args) => { calls.push(['renderProfileMatchingHome', ...args]); },
    renderProfileMatchingPick: async (...args) => { calls.push(['renderProfileMatchingPick', ...args]); },
    renderProfileMatchingResults: async (...args) => { calls.push(['renderProfileMatchingResults', ...args]); },
    renderStaleButton: async (...args) => { calls.push(['renderStaleButton', ...args]); },
    renderWsPublicProfile: async (...args) => { calls.push(['renderWsPublicProfile', ...args]); },
    resolveBmBrandContext: async () => ({ enabled: false }),
    resolveBxHomeFromUi: async () => 'menu',
    ruPlural: () => 'кредитов',
    safeEditOrReply: async (...args) => { calls.push(['safeEditOrReply', ...args]); },
    setBrandCreditsCache: call,
    setMonUnlockDiag: call,
    shortUrl: (value) => String(value),
    withTimeout: async (promise) => promise,
    wsTgUrlFromContact: () => null,
  };
}

const user = { id: 55 };

equal(DIRECTORY_SEARCH_ACTIONS.length, 6, 'directory search action count');
equal(DIRECTORY_PUBLIC_WORKSPACE_ACTIONS.length, 4, 'public workspace action count');
equal(new Set([...DIRECTORY_SEARCH_ACTIONS, ...DIRECTORY_PUBLIC_WORKSPACE_ACTIONS]).size, 10, 'STEP590E3C actions unique');

for (const action of DIRECTORY_SEARCH_ACTIONS) {
  check(isDirectorySearchAction(action), `${action} search predicate`);
  check(isDirectoryCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.DIRECTORY_SEARCH, `${action} route owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} route phase`);
  const handled = await handleDirectorySearchCallback(
    makeCtx(),
    { a: action, ws: 7, w: 7, t: 'v', k: 'beauty', id: 9, p: 0 },
    user,
    makeDeps()
  );
  equal(handled, true, `${action} executable search handler contract`);
}

for (const action of DIRECTORY_PUBLIC_WORKSPACE_ACTIONS) {
  check(isDirectoryPublicWorkspaceAction(action), `${action} public workspace predicate`);
  check(isDirectoryCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.DIRECTORY_PUBLIC_WORKSPACE, `${action} route owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} route phase`);
  const handled = await handleDirectoryPublicWorkspaceCallback(
    makeCtx(),
    { a: action, ws: 7, w: 7, m: 'ro', r: '', l: 0 },
    user,
    makeDeps()
  );
  equal(handled, true, `${action} executable public workspace handler contract`);
}

equal(await handleDirectorySearchCallback(makeCtx(), { a: 'a:wsp_open' }, user, makeDeps()), false, 'search rejects public workspace action');
equal(await handleDirectoryPublicWorkspaceCallback(makeCtx(), { a: 'a:pm_home' }, user, makeDeps()), false, 'public workspace rejects search action');
equal(await handleDirectorySearchCallback(makeCtx(), { a: 'a:menu' }, user, makeDeps()), false, 'search rejects foreign action');
equal(await handleDirectoryPublicWorkspaceCallback(makeCtx(), { a: 'a:menu' }, user, makeDeps()), false, 'public workspace rejects foreign action');

{
  const deps = makeDeps();
  equal(await handleDirectorySearchCallback(makeCtx(), { a: 'a:pm_tog', ws: 7, t: 'v', k: 'beauty' }, user, deps), true, 'search toggle handled');
  equal(deps.calls.filter(([name]) => name === 'pmSetState').length, 1, 'search toggle writes state exactly once');
}

{
  const deps = makeDeps();
  deps.redis.get = async () => 1;
  equal(await handleDirectoryPublicWorkspaceCallback(makeCtx(), { a: 'a:wsp_contact_req', ws: 7 }, user, deps), true, 'already-unlocked contact request handled');
  const reveals = deps.calls.filter(([name]) => name === 'renderWsPublicProfile');
  equal(reveals.length, 1, 'already-unlocked request renders public profile once');
  equal(reveals[0][3]?.revealContacts, true, 'already-unlocked request reveals contacts');
}


{
  const deps = makeDeps({
    dbOverrides: {
      getWorkspaceAny: async () => ({ id: 7, owner_user_id: 55 }),
      unlockWorkspaceContactsWithCredits: async () => { throw new Error('must not charge owner'); },
    },
  });
  equal(await handleDirectoryPublicWorkspaceCallback(makeCtx(), { a: 'a:wsp_contact_unlock', ws: 7 }, user, deps), true, 'owner contact unlock handled');
  equal(deps.calls.filter(([name]) => name === 'renderWsPublicProfile').length, 1, 'owner sees revealed profile once');
}

{
  const deps = makeDeps({ asyncRetry: true });
  let queued = 0;
  deps.acquireLock = async () => ({ token: 'lock-token' });
  deps.enqueueMonetizationRetry = async () => { queued += 1; return { ok: true }; };
  equal(await handleDirectoryPublicWorkspaceCallback(makeCtx(), { a: 'a:wsp_contact_unlock', ws: 7 }, user, deps), true, 'queue-first contact unlock handled');
  equal(queued, 1, 'queue-first path enqueues exactly once');
  equal(deps.db.calls.filter(([name]) => name === 'unlockWorkspaceContactsWithCredits').length, 0, 'queue-first success avoids synchronous charge');
}

{
  const deps = makeDeps({
    dbOverrides: {
      getWorkspaceAny: async () => null,
      unlockWorkspaceContactsWithCredits: async () => ({ ok: true, charged: true, left: 4 }),
    },
  });
  equal(await handleDirectoryPublicWorkspaceCallback(makeCtx(), { a: 'a:wsp_contact_unlock', ws: 7 }, user, deps), true, 'synchronous contact unlock handled');
  equal(deps.calls.filter(([name]) => name === 'renderWsPublicProfile').length, 1, 'successful unlock reveals profile exactly once');
}

await assert.rejects(
  () => handleDirectorySearchCallback(makeCtx(), { a: 'a:pm_home', ws: 7 }, user, {}),
  /directory_domain\.missing_dependency:/
);
assertions += 1;
await assert.rejects(
  () => handleDirectoryPublicWorkspaceCallback(makeCtx(), { a: 'a:wsp_open', ws: 7 }, user, {}),
  /directory_domain\.missing_dependency:/
);
assertions += 1;

const summary = summarizeCallbackOwnership();
equal(summary.extracted, 336, 'STEP590E4B cumulative extracted ownership');
equal(summary.legacy, 224, 'STEP590E4B cumulative legacy ownership');
equal(summary.byRoute[CALLBACK_ROUTE.DIRECTORY_SEARCH], 6, 'directory search route count');
equal(summary.byRoute[CALLBACK_ROUTE.DIRECTORY_PUBLIC_WORKSPACE], 4, 'public workspace route count');
equal(getCallbackOwnership('a:wsp_contact_unlock').routeId, CALLBACK_ROUTE.DIRECTORY_PUBLIC_WORKSPACE, 'contact unlock is public-workspace owned');
equal(getCallbackOwnership('a:wsp_lead_new').routeId, CALLBACK_ROUTE.LEAD_ACQUISITION, 'workspace lead remains lead-owned');

console.log(`PASS STEP590E3C directory/public workspace extraction tests (${assertions} assertions)`);
