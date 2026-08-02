import assert from 'node:assert/strict';
import {
  BRAND_DIRECTORY_ACTIONS,
  BRAND_PROFILE_ACTIONS,
} from '../src/bot/domains/brands/actions.js';
import { handleBrandDirectoryCallback } from '../src/bot/domains/brands/directoryCallbacks.js';
import { handleBrandProfileCallback } from '../src/bot/domains/brands/profileCallbacks.js';
import {
  isBrandCallbackAction,
  isBrandDirectoryAction,
  isBrandProfileAction,
} from '../src/bot/domains/brands/policy.js';
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
    state: { cid: 'test-cid' },
    callbackQuery: { message: { message_id: 3001 } },
    answerCallbackQuery: async (payload) => { calls.push(['ack', payload]); },
  };
}

function makeDb() {
  const calls = [];
  const profile = {
    brand_name: 'Brand',
    brand_link: 'https://brand.test',
    contact: '@brand',
    niche: 'Beauty',
    collab_types: '',
    meta: {},
  };
  return new Proxy({ calls }, {
    get(target, prop) {
      if (prop === 'calls') return calls;
      return async (...args) => {
        calls.push([String(prop), ...args]);
        if (prop === 'getBrandProfile') return profile;
        if (prop === 'upsertBrandProfile') return { ...profile, ...(args[1] || {}) };
        if (prop === 'deleteBrandProfile') return { deleted: true };
        return null;
      };
    },
  });
}

function makeDeps() {
  const call = async () => null;
  const db = makeDb();
  const filter = {
    category: null,
    offerType: null,
    compensationType: null,
    budgetBucket: null,
    goalsTags: [],
    reqTags: [],
  };
  return {
    BRAND_BUDGET_KEYS: new Set(['micro']),
    BRAND_COLLAB_KEYS: new Set(['ugc']),
    BRAND_GOALS_KEYS: new Set(['awareness']),
    BRAND_REQ_KEYS: new Set(['brief']),
    BX_CATEGORIES: [{ key: 'beauty', label: 'Beauty' }],
    BX_HOME: { BX_OPEN: 'bx_open', MENU: 'menu' },
    InlineKeyboard,
    brandCbSuffix: () => '',
    brandCollabTypesToCsv: (values) => values.join(','),
    brandFieldPrompt: () => 'Prompt',
    brandFieldPromptKb: () => new InlineKeyboard(),
    copySafetyRecoveryKb: () => new InlineKeyboard(),
    copySafetyUnavailableHtml: (value) => String(value),
    db,
    errInfo: (error) => ({ message: String(error?.message || error || '') }),
    getBrandDirFilter: async () => ({ ...filter }),
    isBrandBasicComplete: () => true,
    navKb: () => new InlineKeyboard(),
    num: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    parseBrandCollabTypes: () => [],
    parseBrandMeta: (value) => (value && typeof value === 'object' ? { ...value } : {}),
    renderBrandBudgetBucketPicker: call,
    renderBrandCollabTypesPicker: call,
    renderBrandDirFilterPick: call,
    renderBrandDirFilters: call,
    renderBrandDirMultiPick: call,
    renderBrandDirectoryCard: call,
    renderBrandGoalsTagsPicker: call,
    renderBrandNichePicker: call,
    renderBrandPass: call,
    renderBrandPlan: call,
    renderBrandProfileHome: call,
    renderBrandProfileMore: call,
    renderBrandReqTagsPicker: call,
    renderBrandsDirectory: call,
    renderWsLeadCompose: call,
    reportCopySafetyDiagnostic: () => null,
    resolveBmBrandContext: async () => ({ enabled: false }),
    resolveBxHomeFromUi: async () => 'menu',
    safeBrandProfiles: async (primary, fallback) => {
      try { return await primary(); } catch { return fallback ? fallback() : null; }
    },
    safeEditOrReply: call,
    setBrandDirFilter: call,
    setExpectText: call,
    updateBrandMeta: call,
    withTimeout: async (promise) => promise,
  };
}

const user = { id: 55 };
const actionPayload = {
  ws: 7,
  w: 7,
  p: 0,
  u: 55,
  k: 'beauty',
  v: 'all',
  f: 'bn',
  ret: 'brand',
  from: 'home',
};

const profilePayload = (action) => ({
  ...actionPayload,
  a: action,
  k: action === 'a:brand_ty_t' ? 'ugc'
    : action === 'a:brand_bb_set' ? 'micro'
      : action === 'a:brand_gt_t' ? 'awareness'
        : action === 'a:brand_rt_t' ? 'brief'
          : actionPayload.k,
});

const directoryPayload = (action) => ({
  ...actionPayload,
  a: action,
  k: action === 'a:bd_mt' ? 'goals' : 'cat',
  v: action === 'a:bd_mt' ? 'awareness' : 'all',
});

equal(BRAND_DIRECTORY_ACTIONS.length, 10, 'brand directory action count');
equal(BRAND_PROFILE_ACTIONS.length, 28, 'brand profile action count');
equal(new Set([...BRAND_DIRECTORY_ACTIONS, ...BRAND_PROFILE_ACTIONS]).size, 38, 'STEP590E4A actions unique');

for (const action of BRAND_DIRECTORY_ACTIONS) {
  check(isBrandDirectoryAction(action), `${action} directory predicate`);
  check(isBrandCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.BRAND_DIRECTORY, `${action} route owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} route phase`);
  const handled = await handleBrandDirectoryCallback(makeCtx(), directoryPayload(action), user, makeDeps());
  equal(handled, true, `${action} executable directory handler contract`);
}

for (const action of BRAND_PROFILE_ACTIONS) {
  check(isBrandProfileAction(action), `${action} profile predicate`);
  check(isBrandCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.BRAND_PROFILE, `${action} route owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} route phase`);
  const handled = await handleBrandProfileCallback(makeCtx(), profilePayload(action), user, makeDeps());
  equal(handled, true, `${action} executable profile handler contract`);
}

equal(await handleBrandDirectoryCallback(makeCtx(), { a: 'a:brand_profile' }, user, makeDeps()), false, 'directory rejects profile action');
equal(await handleBrandProfileCallback(makeCtx(), { a: 'a:brands_home' }, user, makeDeps()), false, 'profile rejects directory action');
equal(await handleBrandProfileCallback(makeCtx(), { a: 'a:brand_buy' }, user, makeDeps()), false, 'profile rejects payment action');

{
  const deps = makeDeps();
  equal(await handleBrandProfileCallback(makeCtx(), profilePayload('a:brand_prof_reset_ok'), user, deps), true, 'brand profile reset confirmation handled');
  equal(deps.db.calls.filter(([name]) => name === 'deleteBrandProfile').length, 1, 'brand profile reset deletes exactly once');
}

{
  const deps = makeDeps();
  equal(await handleBrandProfileCallback(makeCtx(), profilePayload('a:brand_niche_set'), user, deps), true, 'brand niche set handled');
  equal(deps.db.calls.filter(([name]) => name === 'upsertBrandProfile').length, 1, 'brand niche set writes exactly once');
}

await assert.rejects(
  () => handleBrandDirectoryCallback(makeCtx(), { a: 'a:brands_home' }, user, {}),
  /brand_domain\.missing_dependency:/
);
assertions += 1;
await assert.rejects(
  () => handleBrandProfileCallback(makeCtx(), { a: 'a:brand_profile' }, user, {}),
  /brand_domain\.missing_dependency:/
);
assertions += 1;

const summary = summarizeCallbackOwnership();
equal(summary.extracted, 482, 'STEP590E6 cumulative extracted ownership');
equal(summary.legacy, 78, 'STEP590E6 cumulative legacy ownership');
equal(summary.byRoute[CALLBACK_ROUTE.BRAND_DIRECTORY], 10, 'brand directory route count');
equal(summary.byRoute[CALLBACK_ROUTE.BRAND_PROFILE], 28, 'brand profile route count');
equal(getCallbackOwnership('a:brand_buy').routeId, CALLBACK_ROUTE.PAYMENT_PURCHASE, 'brand checkout remains payment-owned');
equal(getCallbackOwnership('a:brand_plan_buy').routeId, CALLBACK_ROUTE.PAYMENT_PURCHASE, 'brand plan checkout remains payment-owned');
equal(getCallbackOwnership('a:brand_apps').routeId, CALLBACK_ROUTE.APPLICATION_BRAND, 'brand applications remain application-owned');
equal(getCallbackOwnership('a:brand_deals').routeId, CALLBACK_ROUTE.APPLICATION_DEALS, 'brand deals remain application-owned');
equal(getCallbackOwnership('a:bm_home').routeId, CALLBACK_ROUTE.BRAND_MANAGER_MODE, 'brand manager moved to STEP590E4B owner');
equal(getCallbackOwnership('a:brand_team').routeId, CALLBACK_ROUTE.BRAND_TEAM_MEMBERSHIP, 'brand team moved to STEP590E4B owner');
equal(getCallbackOwnership('a:cur_home').routeId, CALLBACK_ROUTE.CURATOR_OPERATIONS, 'curator operations extracted in STEP590E4C');

console.log(`PASS STEP590E4A brands directory/profile extraction tests (${assertions} assertions)`);
