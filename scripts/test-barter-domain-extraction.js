import assert from 'node:assert/strict';
import {
  BARTER_CALLBACK_ACTIONS,
  BARTER_CONVERSATION_ACTIONS,
  BARTER_DISCOVERY_ACTIONS,
  BARTER_OFFICIAL_ACTIONS,
  BARTER_OFFER_ACTIONS,
  handleBarterConversationCallback,
  handleBarterDiscoveryCallback,
  handleBarterOfficialCallback,
  handleBarterOfferCallback,
  isBarterCallbackAction,
  isBarterConversationAction,
  isBarterDiscoveryAction,
  isBarterOfficialAction,
  isBarterOfferAction,
} from '../src/bot/domains/barter/index.js';
import {
  CALLBACK_PHASE,
  CALLBACK_ROUTE,
  getCallbackOwnership,
  summarizeCallbackOwnership,
} from '../src/bot/router/callbackOwnership.js';

let assertions = 0;
const equal = (actual, expected, message) => {
  assert.equal(actual, expected, message);
  assertions += 1;
};
const check = (value, message) => {
  assert.ok(value, message);
  assertions += 1;
};

class FakeKeyboard {
  text() { return this; }
  row() { return this; }
  url() { return this; }
}

function makeCtx() {
  const calls = [];
  return {
    calls,
    from: { id: 99112233 },
    state: { cid: 'step590e2-test' },
    callbackQuery: { message: { chat: { id: 99112233 }, message_id: 5 } },
    answerCallbackQuery: async (payload) => { calls.push(['ack', payload]); },
    editMessageReplyMarkup: async (payload) => { calls.push(['editMarkup', payload]); },
    reply: async (...args) => { calls.push(['reply', ...args]); return { message_id: 9 }; },
    api: {
      sendMessage: async (...args) => { calls.push(['sendMessage', ...args]); return { message_id: 10 }; },
      editMessageText: async (...args) => { calls.push(['editMessageText', ...args]); },
      editMessageReplyMarkup: async (...args) => { calls.push(['apiEditMarkup', ...args]); },
    },
  };
}

function makeDeps(overrides = {}) {
  const db = new Proxy({}, {
    get: (_target, prop) => async () => {
      if (prop === 'getWorkspace') return { id: 77, network_enabled: true };
      if (prop === 'getBarterOfferPublic') return { id: 88, owner_user_id: 4, workspace_id: 77 };
      return null;
    },
  });

  const base = {
    BRAND_GOALS_KEYS: new Set(),
    BRAND_REQ_KEYS: new Set(),
    BX_HOME: { MENU: 'menu', BX_OPEN: 'bx_open' },
    BX_PRESETS: [],
    CFG: {
      INTRO_RETRY_AFTER_HOURS: 24,
      INTRO_RETRY_EXPIRES_DAYS: 7,
      OFFICIAL_PUBLISH_ENABLED: true,
      OFFICIAL_PUBLISH_MODE: 'manual',
    },
    CRM_STAGES: {},
    InlineKeyboard: FakeKeyboard,
    UI_MODES: { BRAND: 'brand' },
    db,
    escapeHtml: (value) => String(value ?? ''),
    k: (parts) => parts.join(':'),
    logger: { warn() {}, error() {}, info() {} },
    navKb: () => new FakeKeyboard(),
    normBxRet: (value, fallback) => String(value || fallback || ''),
    normBxTagFilterKey: (value) => String(value || ''),
    opaqueLogRef: (value) => String(value),
    safeBrandProfiles: async (fn, fallback) => {
      try { return await fn(); } catch { return fallback(); }
    },
    safeEditOrReply: async (...args) => { overrides.__calls?.push(['safeEditOrReply', ...args]); return true; },
    safeLogError: (error) => String(error?.message || error || ''),
    safeOfficialPosts: async (fn, fallback) => {
      try { return await fn(); } catch { return fallback(); }
    },
    safeUserVerifications: async (fn, fallback) => {
      try { return await fn(); } catch { return fallback(); }
    },
    ...overrides,
  };

  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return async () => null;
    },
  });
}

equal(BARTER_DISCOVERY_ACTIONS.length, 16, 'barter discovery action count');
equal(BARTER_OFFICIAL_ACTIONS.length, 9, 'official publishing action count');
equal(BARTER_CONVERSATION_ACTIONS.length, 16, 'barter conversation action count');
equal(BARTER_OFFER_ACTIONS.length, 48, 'barter offer action count');
equal(BARTER_CALLBACK_ACTIONS.length, 89, 'STEP590E2 total extracted actions');
equal(new Set(BARTER_CALLBACK_ACTIONS).size, 89, 'barter actions are unique');

for (const action of BARTER_DISCOVERY_ACTIONS) {
  check(isBarterDiscoveryAction(action), `${action} discovery policy`);
  check(isBarterCallbackAction(action), `${action} barter policy`);
  const owner = getCallbackOwnership(action);
  equal(owner?.routeId, CALLBACK_ROUTE.BARTER_DISCOVERY, `${action} discovery owner`);
  equal(owner?.phase, CALLBACK_PHASE.POST_USER, `${action} discovery phase`);
  equal(owner?.extracted, true, `${action} discovery extracted`);
}
for (const action of BARTER_OFFICIAL_ACTIONS) {
  check(isBarterOfficialAction(action), `${action} official policy`);
  check(isBarterCallbackAction(action), `${action} barter policy`);
  const owner = getCallbackOwnership(action);
  equal(owner?.routeId, CALLBACK_ROUTE.BARTER_OFFICIAL, `${action} official owner`);
  equal(owner?.phase, CALLBACK_PHASE.POST_USER, `${action} official phase`);
  equal(owner?.extracted, true, `${action} official extracted`);
}
for (const action of BARTER_CONVERSATION_ACTIONS) {
  check(isBarterConversationAction(action), `${action} conversation policy`);
  check(isBarterCallbackAction(action), `${action} barter policy`);
  const owner = getCallbackOwnership(action);
  equal(owner?.routeId, CALLBACK_ROUTE.BARTER_CONVERSATIONS, `${action} conversation owner`);
  equal(owner?.phase, CALLBACK_PHASE.POST_USER, `${action} conversation phase`);
  equal(owner?.extracted, true, `${action} conversation extracted`);
}
for (const action of BARTER_OFFER_ACTIONS) {
  check(isBarterOfferAction(action), `${action} offer policy`);
  check(isBarterCallbackAction(action), `${action} barter policy`);
  const owner = getCallbackOwnership(action);
  equal(owner?.routeId, CALLBACK_ROUTE.BARTER_OFFERS, `${action} offer owner`);
  equal(owner?.phase, CALLBACK_PHASE.POST_USER, `${action} offer phase`);
  equal(owner?.extracted, true, `${action} offer extracted`);
}

equal(await handleBarterDiscoveryCallback(makeCtx(), { a: 'a:support' }, { id: 4 }, {}), false, 'discovery rejects foreign action');
equal(await handleBarterOfficialCallback(makeCtx(), { a: 'a:support' }, { id: 4 }, {}), false, 'official rejects foreign action');
equal(await handleBarterConversationCallback(makeCtx(), { a: 'a:support' }, { id: 4 }, {}), false, 'conversation rejects foreign action');
equal(await handleBarterOfferCallback(makeCtx(), { a: 'a:support' }, { id: 4 }, {}), false, 'offer rejects foreign action');

await assert.rejects(
  () => handleBarterDiscoveryCallback(makeCtx(), { a: 'a:bx_pub', o: 88 }, { id: 4 }, {}),
  /barter_domain\.missing_dependency:/
);
assertions += 1;

{
  const ctx = makeCtx();
  let calls = 0;
  const deps = makeDeps({
    resolveBxHomeFromUi: async () => 'menu',
    renderBxPublicView: async (_ctx, userId, wsId, offerId, page, opts) => {
      calls += 1;
      equal(userId, 4, 'discovery uses hydrated actor');
      equal(wsId, 0, 'discovery preserves workspace');
      equal(offerId, 88, 'discovery preserves offer');
      equal(page, 2, 'discovery preserves page');
      equal(opts.h, 'menu', 'discovery preserves home context');
    },
  });
  equal(await handleBarterDiscoveryCallback(ctx, { a: 'a:bx_pub', o: 88, p: 2 }, { id: 4 }, deps), true, 'discovery representative handled');
  equal(calls, 1, 'discovery renderer called once');
}

{
  const ctx = makeCtx();
  let calls = 0;
  const deps = makeDeps({
    renderOfficialManageView: async (_ctx, userId, wsId, offerId, page, back) => {
      calls += 1;
      equal(userId, 4, 'official uses hydrated actor');
      equal(wsId, 77, 'official preserves workspace');
      equal(offerId, 88, 'official preserves offer');
      equal(page, 3, 'official preserves page');
      equal(back, 'my', 'official preserves back context');
    },
  });
  equal(await handleBarterOfficialCallback(ctx, { a: 'a:off_manage', ws: 77, o: 88, p: 3, back: 'my' }, { id: 4 }, deps), true, 'official representative handled');
  equal(calls, 1, 'official renderer called once');
}

{
  const ctx = makeCtx();
  const deps = makeDeps();
  equal(await handleBarterConversationCallback(ctx, { a: 'a:bx_retry_help' }, { id: 4 }, deps), true, 'conversation representative handled');
  equal(ctx.calls.filter(([kind]) => kind === 'ack').length, 1, 'conversation callback acknowledged once');
}

{
  const ctx = makeCtx();
  let calls = 0;
  const deps = makeDeps({
    kbBxPubDone: (wsId, offerId, page, back) => {
      calls += 1;
      equal(wsId, 77, 'offer receipt preserves workspace');
      equal(offerId, 88, 'offer receipt preserves offer');
      equal(page, 4, 'offer receipt preserves page');
      equal(back, 'my', 'offer receipt preserves back');
      return { inline_keyboard: [] };
    },
  });
  equal(await handleBarterOfferCallback(ctx, { a: 'a:bx_pub_done', ws: 77, o: 88, p: 4, back: 'my' }, { id: 4 }, deps), true, 'offer representative handled');
  equal(calls, 1, 'offer receipt keyboard built once');
  equal(ctx.calls.filter(([kind]) => kind === 'editMarkup').length, 1, 'offer receipt markup edited once');
}

const summary = summarizeCallbackOwnership();
equal(summary.extracted, 209, 'STEP590E2 extracted ownership total');
equal(summary.legacy, summary.total - 209, 'STEP590E2 legacy ownership total');
equal(summary.byRoute[CALLBACK_ROUTE.BARTER_DISCOVERY], 16, 'discovery route count');
equal(summary.byRoute[CALLBACK_ROUTE.BARTER_OFFICIAL], 9, 'official route count');
equal(summary.byRoute[CALLBACK_ROUTE.BARTER_CONVERSATIONS], 16, 'conversation route count');
equal(summary.byRoute[CALLBACK_ROUTE.BARTER_OFFERS], 48, 'offer route count');

equal(getCallbackOwnership('a:off_buy').routeId, CALLBACK_ROUTE.LEGACY, 'official paid checkout remains outside STEP590E2');
equal(getCallbackOwnership('a:off_buy_home').routeId, CALLBACK_ROUTE.LEGACY, 'official paid checkout home remains outside STEP590E2');
for (const action of ['a:bx_fcat', 'a:bx_fcomp', 'a:bx_ftype', 'a:bx_thread_new', 'a:bx_thread_write']) {
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.LEGACY, `${action} registry-only action remains legacy`);
}

console.log(`PASS STEP590E2 barter domain extraction tests (${assertions} assertions)`);
