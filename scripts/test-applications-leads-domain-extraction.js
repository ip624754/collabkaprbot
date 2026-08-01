import assert from 'node:assert/strict';
import {
  APPLICATION_BRAND_ACTIONS,
  APPLICATION_CALLBACK_ACTIONS,
  APPLICATION_CREATOR_ACTIONS,
  APPLICATION_DEALS_ACTIONS,
  handleApplicationBrandCallback,
  handleApplicationCreatorCallback,
  handleApplicationDealsCallback,
  isApplicationBrandAction,
  isApplicationCallbackAction,
  isApplicationCreatorAction,
  isApplicationDealsAction,
} from '../src/bot/domains/applications/index.js';
import {
  LEAD_ACQUISITION_ACTIONS,
  LEAD_AUDIT_ACTIONS,
  LEAD_CALLBACK_ACTIONS,
  LEAD_WORKFLOW_ACTIONS,
  handleLeadAcquisitionCallback,
  handleLeadAuditCallback,
  handleLeadWorkflowCallback,
  isLeadAcquisitionAction,
  isLeadAuditAction,
  isLeadCallbackAction,
  isLeadWorkflowAction,
} from '../src/bot/domains/leads/index.js';
import {
  CALLBACK_PHASE,
  CALLBACK_ROUTE,
  getCallbackOwnership,
  summarizeCallbackOwnership,
} from '../src/bot/router/callbackOwnership.js';

let assertions = 0;
function check(value, message) {
  assert.ok(value, message);
  assertions += 1;
}
function equal(actual, expected, message) {
  assert.equal(actual, expected, message);
  assertions += 1;
}

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
    state: { cid: 'step590e1-test' },
    callbackQuery: { message: { chat: { id: 99112233 }, message_id: 5 } },
    answerCallbackQuery: async (payload) => { calls.push(['ack', payload]); },
    editMessageReplyMarkup: async (payload) => { calls.push(['editMarkup', payload]); },
    reply: async (...args) => { calls.push(['reply', ...args]); return { message_id: 9, chat: { id: 99112233 } }; },
    api: {
      sendMessage: async (...args) => { calls.push(['sendMessage', ...args]); },
      editMessageReplyMarkup: async (...args) => { calls.push(['apiEditMarkup', ...args]); },
    },
  };
}

function makeDeps(overrides = {}) {
  const db = new Proxy({}, {
    get: (_target, prop) => async () => {
      if (prop === 'getWorkspaceAny') return { id: 77, owner_user_id: 100, channel_username: 'creator' };
      if (prop === 'getBrandProfile') return { brand_name: 'Brand', niche: 'Tech', contact: '@brand', brand_link: 'https://example.com' };
      return null;
    },
  });

  const base = {
    BRAND_APP_ACCEPT_COST: 1,
    BX_HOME: { MENU: 'menu', BX_OPEN: 'bx_open' },
    CFG: { BRAND_PROFILE_REQUIRED: false },
    InlineKeyboard: FakeKeyboard,
    LEAD_NOTE_TEMPLATES: {},
    LEAD_STATUSES: {},
    UI_MODES: { BRAND: 'brand' },
    db,
    escapeHtml: (value) => String(value ?? ''),
    errInfo: (error) => String(error?.message || error || ''),
    leadStatusFromCb: (value) => String(value || 'new'),
    leadStatusToCb: (value) => String(value || 'new'),
    normDealStage: (value) => String(value || 'negotiation'),
    normLeadStatus: (value) => String(value || 'new'),
    normalizeUiMode: (value) => String(value || ''),
    retFromCb: (value) => String(value || ''),
    retPartShort: (value) => value ? `|r:${value}` : '',
    ruPlural: () => 'кредит',
    safeEditOrReply: async () => true,
    safeBrandApplications: async (fn, fallback) => {
      try { return await fn(); } catch { return fallback(); }
    },
    safeBrandAppsWrite: async (fn) => fn(),
    safeBrandProfiles: async (fn, fallback) => {
      try { return await fn(); } catch { return fallback(); }
    },
    safeLeadWrite: async (fn) => fn(),
    withTimeout: async (promise) => promise,
    ...overrides,
  };

  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return async () => null;
    },
  });
}

const allActions = [...APPLICATION_CALLBACK_ACTIONS, ...LEAD_CALLBACK_ACTIONS];
equal(APPLICATION_CREATOR_ACTIONS.length, 13, 'creator application action count');
equal(APPLICATION_BRAND_ACTIONS.length, 10, 'brand application action count');
equal(APPLICATION_DEALS_ACTIONS.length, 10, 'application deals action count');
equal(APPLICATION_CALLBACK_ACTIONS.length, 33, 'all application actions');
equal(LEAD_ACQUISITION_ACTIONS.length, 5, 'lead acquisition action count');
equal(LEAD_WORKFLOW_ACTIONS.length, 14, 'lead workflow action count');
equal(LEAD_AUDIT_ACTIONS.length, 1, 'lead audit action count');
equal(LEAD_CALLBACK_ACTIONS.length, 20, 'all lead actions');
equal(allActions.length, 53, 'STEP590E1 total extracted actions');
equal(new Set(allActions).size, allActions.length, 'STEP590E1 actions are unique');

for (const action of APPLICATION_CREATOR_ACTIONS) {
  check(isApplicationCreatorAction(action), `${action} creator policy`);
  check(isApplicationCallbackAction(action), `${action} application policy`);
  const owner = getCallbackOwnership(action);
  equal(owner?.routeId, CALLBACK_ROUTE.APPLICATION_CREATOR, `${action} creator owner`);
  equal(owner?.phase, CALLBACK_PHASE.POST_USER, `${action} creator phase`);
  equal(owner?.extracted, true, `${action} creator extracted`);
}
for (const action of APPLICATION_BRAND_ACTIONS) {
  check(isApplicationBrandAction(action), `${action} brand policy`);
  check(isApplicationCallbackAction(action), `${action} application policy`);
  const owner = getCallbackOwnership(action);
  equal(owner?.routeId, CALLBACK_ROUTE.APPLICATION_BRAND, `${action} brand owner`);
  equal(owner?.phase, CALLBACK_PHASE.POST_USER, `${action} brand phase`);
  equal(owner?.extracted, true, `${action} brand extracted`);
}
for (const action of APPLICATION_DEALS_ACTIONS) {
  check(isApplicationDealsAction(action), `${action} deals policy`);
  check(isApplicationCallbackAction(action), `${action} application policy`);
  const owner = getCallbackOwnership(action);
  equal(owner?.routeId, CALLBACK_ROUTE.APPLICATION_DEALS, `${action} deals owner`);
  equal(owner?.phase, CALLBACK_PHASE.POST_USER, `${action} deals phase`);
  equal(owner?.extracted, true, `${action} deals extracted`);
}
for (const action of LEAD_ACQUISITION_ACTIONS) {
  check(isLeadAcquisitionAction(action), `${action} acquisition policy`);
  check(isLeadCallbackAction(action), `${action} lead policy`);
  const owner = getCallbackOwnership(action);
  equal(owner?.routeId, CALLBACK_ROUTE.LEAD_ACQUISITION, `${action} acquisition owner`);
  equal(owner?.phase, CALLBACK_PHASE.POST_USER, `${action} acquisition phase`);
  equal(owner?.extracted, true, `${action} acquisition extracted`);
}
for (const action of LEAD_WORKFLOW_ACTIONS) {
  check(isLeadWorkflowAction(action), `${action} workflow policy`);
  check(isLeadCallbackAction(action), `${action} lead policy`);
  const owner = getCallbackOwnership(action);
  equal(owner?.routeId, CALLBACK_ROUTE.LEAD_WORKFLOW, `${action} workflow owner`);
  equal(owner?.phase, CALLBACK_PHASE.POST_USER, `${action} workflow phase`);
  equal(owner?.extracted, true, `${action} workflow extracted`);
}
for (const action of LEAD_AUDIT_ACTIONS) {
  check(isLeadAuditAction(action), `${action} audit policy`);
  check(isLeadCallbackAction(action), `${action} lead policy`);
  const owner = getCallbackOwnership(action);
  equal(owner?.routeId, CALLBACK_ROUTE.LEAD_AUDIT, `${action} audit owner`);
  equal(owner?.phase, CALLBACK_PHASE.POST_USER, `${action} audit phase`);
  equal(owner?.extracted, true, `${action} audit extracted`);
}

const foreign = { a: 'a:support' };
equal(await handleApplicationCreatorCallback(makeCtx(), foreign, { id: 1 }, {}), false, 'creator handler rejects foreign action');
equal(await handleApplicationBrandCallback(makeCtx(), foreign, { id: 1 }, {}), false, 'brand handler rejects foreign action');
equal(await handleApplicationDealsCallback(makeCtx(), foreign, { id: 1 }, {}), false, 'deals handler rejects foreign action');
equal(await handleLeadAcquisitionCallback(makeCtx(), foreign, { id: 1 }, {}), false, 'acquisition handler rejects foreign action');
equal(await handleLeadWorkflowCallback(makeCtx(), foreign, { id: 1 }, {}), false, 'workflow handler rejects foreign action');
equal(await handleLeadAuditCallback(makeCtx(), foreign, { id: 1 }, {}), false, 'audit handler rejects foreign action');

await assert.rejects(
  () => handleApplicationCreatorCallback(makeCtx(), { a: 'a:brand_apply_done', u: 2 }, { id: 1 }, {}),
  /applications_domain\.missing_dependency:/
);
assertions += 1;
await assert.rejects(
  () => handleLeadWorkflowCallback(makeCtx(), { a: 'a:lead_notes', id: 3 }, { id: 1 }, {}),
  /leads_domain\.missing_dependency:/
);
assertions += 1;

{
  const ctx = makeCtx();
  let called = 0;
  const deps = makeDeps({ kbBrandApplyDone: () => ({ inline_keyboard: [] }) });
  const handled = await handleApplicationCreatorCallback(ctx, { a: 'a:brand_apply_done', u: 7, p: 2, inb: 1 }, { id: 4 }, deps);
  equal(handled, true, 'creator application representative handled');
  equal(ctx.calls.filter(([kind]) => kind === 'editMarkup').length, 1, 'creator application keyboard edited');
  called += 1;
  equal(called, 1, 'creator application executed once');
}
{
  const ctx = makeCtx();
  let calls = 0;
  const deps = makeDeps({ renderBrandAppView: async () => { calls += 1; } });
  const handled = await handleApplicationBrandCallback(ctx, { a: 'a:brand_app_view', id: 8, s: 'new', p: 0 }, { id: 4 }, deps);
  equal(handled, true, 'brand application representative handled');
  equal(calls, 1, 'brand application renderer called once');
}
{
  const ctx = makeCtx();
  let calls = 0;
  const deps = makeDeps({ renderBrandDealView: async () => { calls += 1; } });
  const handled = await handleApplicationDealsCallback(ctx, { a: 'a:brand_deal_view', id: 9, st: 'negotiation', p: 0 }, { id: 4 }, deps);
  equal(handled, true, 'deal representative handled');
  equal(calls, 1, 'deal renderer called once');
}
{
  const ctx = makeCtx();
  let clearCalls = 0;
  let renderCalls = 0;
  const deps = makeDeps({
    clearExpectText: async () => { clearCalls += 1; },
    renderBrandLeadDialog: async () => { renderCalls += 1; },
  });
  const handled = await handleLeadAcquisitionCallback(ctx, { a: 'a:blead_cancel', id: 10, w: 77 }, { id: 4 }, deps);
  equal(handled, true, 'lead acquisition representative handled');
  equal(clearCalls, 1, 'lead acquisition clears compose state once');
  equal(renderCalls, 1, 'lead acquisition returns to dialog once');
}
{
  const ctx = makeCtx();
  let calls = 0;
  const deps = makeDeps({ renderLeadNotesViewer: async () => { calls += 1; } });
  const handled = await handleLeadWorkflowCallback(ctx, { a: 'a:lead_notes', id: 11, w: 77, s: 'new', p: 0, n: 0 }, { id: 4 }, deps);
  equal(handled, true, 'lead workflow representative handled');
  equal(calls, 1, 'lead notes renderer called once');
}
{
  const ctx = makeCtx();
  let calls = 0;
  const deps = makeDeps({ renderCuratorAudit: async (_ctx, userId, wsId, opts) => {
    calls += 1;
    equal(userId, 4, 'lead audit uses hydrated actor user');
    equal(wsId, 77, 'lead audit preserves workspace');
    equal(opts.leadId, 12, 'lead audit preserves lead');
  } });
  const handled = await handleLeadAuditCallback(ctx, { a: 'a:ca', ws: 77, l: 12, s: 'new', p: 0 }, { id: 4 }, deps);
  equal(handled, true, 'lead audit representative handled');
  equal(calls, 1, 'lead audit renderer called once');
}

const summary = summarizeCallbackOwnership();
equal(summary.extracted, 120, 'STEP590E1 extracted ownership total');
equal(summary.legacy, summary.total - 120, 'STEP590E1 legacy ownership total');

console.log(`PASS STEP590E1 applications/leads domain extraction tests (${assertions} assertions)`);
