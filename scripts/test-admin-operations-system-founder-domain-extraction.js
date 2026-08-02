import assert from 'node:assert/strict';
import {
  ADMIN_AUDIT_METRIC_ACTIONS,
  ADMIN_DELIVERY_HARD_SKIP_ACTIONS,
  ADMIN_FOUNDER_CONTROL_ACTIONS,
  ADMIN_QSTASH_ACTIONS,
  ADMIN_SYSTEM_CALLBACK_ACTIONS,
  ADMIN_SYSTEM_NAVIGATION_ACTIONS,
  ADMIN_SYSTEM_OPERATION_ACTIONS,
} from '../src/bot/domains/adminSystem/actions.js';
import { handleAdminAuditMetricCallback } from '../src/bot/domains/adminSystem/auditCallbacks.js';
import { handleAdminDeliveryHardSkipCallback } from '../src/bot/domains/adminSystem/deliveryCallbacks.js';
import { handleAdminFounderControlCallback } from '../src/bot/domains/adminSystem/founderCallbacks.js';
import { handleAdminSystemNavigationCallback } from '../src/bot/domains/adminSystem/navigationCallbacks.js';
import { handleAdminSystemOperationCallback } from '../src/bot/domains/adminSystem/operationsCallbacks.js';
import { handleAdminQStashCallback } from '../src/bot/domains/adminSystem/qstashCallbacks.js';
import {
  isAdminAuditMetricAction,
  isAdminDeliveryHardSkipAction,
  isAdminFounderControlAction,
  isAdminQStashAction,
  isAdminSystemCallbackAction,
  isAdminSystemNavigationAction,
  isAdminSystemOperationAction,
} from '../src/bot/domains/adminSystem/policy.js';
import { handleAdminMessageTemplateCallback } from '../src/bot/domains/adminCommunications/templateCallbacks.js';
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
class InputFile {
  constructor(data, filename) { this.data = data; this.filename = filename; }
}

function makeCtx() {
  const calls = [];
  return {
    calls,
    from: { id: 1001, username: 'owner' },
    chat: { id: 1001, type: 'private' },
    state: { cid: 'e5d-test' },
    callbackQuery: { message: { message_id: 11, message_thread_id: 0 } },
    answerCallbackQuery: async (payload) => { calls.push(['ack', payload]); return true; },
    replyWithDocument: async (...args) => { calls.push(['document', ...args]); return true; },
    api: { sendMessage: async (...args) => { calls.push(['sendMessage', ...args]); return true; } },
  };
}

function makeDeps({ admin = true } = {}) {
  const calls = [];
  const call = async (...args) => { calls.push(['call', ...args]); return null; };
  const redisStore = new Map();
  const deps = {
    calls,
    InputFile,
    InlineKeyboard,
    SYS_KEYS: { founder_sale: 'founder_sale' },
    adminClearBroadcastPendingSnapshot: async () => ({ ok: true }),
    adminDmPlaceholdersHelpHtml: () => '<b>placeholders</b>',
    adminGetBroadcastPendingSnapshot: async () => ({ ok: true, snap: null }),
    adminHardSkipHitsExport: async () => ({ ok: true, items: [], total: 0, scanN: 0 }),
    adminHardSkipUnskip: call,
    clearAdminAuditQuery: call,
    clearDraft: call,
    clearExpectText: call,
    delSysKey: call,
    escapeHtml: (value) => String(value ?? ''),
    flushOpsAlerts: async () => ({ flushed: true, sent: 1, events: 2 }),
    getBot: () => ({ api: {} }),
    getFounderSaleState: async () => ({ effective: { enabled: false } }),
    getQStashDeliveryUrl: () => 'https://example.test/api/qstash/ping',
    getQStashLibHealth: () => ({ available: true }),
    getSysObj: async () => ({}),
    isSuperAdminTg: () => admin,
    k: (parts) => parts.join(':'),
    kbAdminFooter: (kb) => kb,
    navKb: () => new InlineKeyboard(),
    qstashPublishJSON: call,
    randomToken: () => 'nonce123',
    redis: {
      get: async (key) => redisStore.get(String(key)) ?? null,
      set: async (key, value) => { redisStore.set(String(key), value); return true; },
      del: async (key) => { redisStore.delete(String(key)); return true; },
    },
    renderAdminAudit: call,
    renderAdminFounder: call,
    renderAdminFounderLinks: call,
    renderAdminFounderTexts: call,
    renderAdminHardSkipHits: call,
    renderAdminHardSkipHome: call,
    renderAdminHardSkipView: call,
    renderAdminHome: call,
    renderAdminInviteVisibilityHome: call,
    renderAdminInviteVisibilityList: call,
    renderAdminMetrics: call,
    renderAdminOps: call,
    renderAdminQStashStatus: call,
    renderAdminSystem: call,
    safeEditOrReply: call,
    sendAdminAuditExport: call,
    setExpectText: call,
    setSysObj: call,

    // Existing adminCommunications handler dependencies used by a:adm_ph.
    DEFAULT_ADMIN_DM_TEMPLATES: [],
    TG_SAFE_BODY_MAX: 3000,
    applyAdminDmPlaceholders: (text) => ({ text: String(text || ''), used: [], unknown: [] }),
    buildAdminDmPlaceholderValues: async () => ({}),
    clearAdminOutbox: call,
    clipCodepoints: (value) => ({ text: String(value || ''), wasClipped: false, origLen: 0, newLen: 0 }),
    clipText: (value) => String(value || ''),
    commsCb: {},
    containsUrl: () => false,
    db: {},
    findAdminDmTemplate: () => null,
    getAdminDmTemplatesWithMeta: async () => ({ tpls: { version: 1, items: [] } }),
    getAdminOutboxItemByIndex: async () => null,
    getSysNotice: async () => null,
    normalizeNoticeSeverity: (value) => value,
    normalizeNoticeTarget: (value) => value,
    renderAdminComms: call,
    renderAdminDmTemplateView: call,
    renderAdminDmTemplates: call,
    renderAdminDmUserMessageHtml: (value) => String(value || ''),
    renderAdminOutbox: call,
    renderAdminOutboxView: call,
    renderAdminSysNotice: call,
    renderAdminUserNote: call,
    resetAdminDmTemplates: call,
    sendAdminMessageToUser: call,
    setAdminDmTemplates: call,
    setAdminUserNoteReturn: call,
    setSysNotice: call,
  };
  return deps;
}

const groups = [
  [ADMIN_SYSTEM_NAVIGATION_ACTIONS, isAdminSystemNavigationAction, CALLBACK_ROUTE.ADMIN_SYSTEM_NAVIGATION],
  [ADMIN_SYSTEM_OPERATION_ACTIONS, isAdminSystemOperationAction, CALLBACK_ROUTE.ADMIN_SYSTEM_OPERATIONS],
  [ADMIN_DELIVERY_HARD_SKIP_ACTIONS, isAdminDeliveryHardSkipAction, CALLBACK_ROUTE.ADMIN_DELIVERY_HARD_SKIP],
  [ADMIN_AUDIT_METRIC_ACTIONS, isAdminAuditMetricAction, CALLBACK_ROUTE.ADMIN_AUDIT_METRICS],
  [ADMIN_QSTASH_ACTIONS, isAdminQStashAction, CALLBACK_ROUTE.ADMIN_QSTASH_CONTROLS],
  [ADMIN_FOUNDER_CONTROL_ACTIONS, isAdminFounderControlAction, CALLBACK_ROUTE.ADMIN_FOUNDER_CONTROLS],
];

equal(ADMIN_SYSTEM_NAVIGATION_ACTIONS.length, 4, 'navigation action count');
equal(ADMIN_SYSTEM_OPERATION_ACTIONS.length, 5, 'operations action count');
equal(ADMIN_DELIVERY_HARD_SKIP_ACTIONS.length, 6, 'hard-skip action count');
equal(ADMIN_AUDIT_METRIC_ACTIONS.length, 5, 'audit/metrics action count');
equal(ADMIN_QSTASH_ACTIONS.length, 2, 'QStash action count');
equal(ADMIN_FOUNDER_CONTROL_ACTIONS.length, 8, 'founder control action count');
equal(new Set(ADMIN_SYSTEM_CALLBACK_ACTIONS).size, 30, '30 exact adminSystem callbacks');

for (const [actions, predicate, routeId] of groups) {
  for (const action of actions) {
    check(predicate(action), `${action} group predicate`);
    check(isAdminSystemCallbackAction(action), `${action} aggregate predicate`);
    equal(getCallbackOwnership(action).routeId, routeId, `${action} exact owner`);
    equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} phase`);
  }
}

equal(getCallbackOwnership('a:adm_ph').routeId, CALLBACK_ROUTE.ADMIN_MESSAGE_TEMPLATES, 'placeholder helper closes under communications owner');
equal(getCallbackOwnership('a:founder').routeId, CALLBACK_ROUTE.LEGACY, 'user founder flow remains outside admin system');
equal(getCallbackOwnership('a:off_buy').routeId, CALLBACK_ROUTE.LEGACY, 'official purchase remains outside admin system');
equal(getCallbackOwnership('a:off_buy_home').routeId, CALLBACK_ROUTE.LEGACY, 'official purchase home remains outside admin system');

const handlers = [
  [handleAdminSystemNavigationCallback, ADMIN_SYSTEM_NAVIGATION_ACTIONS],
  [handleAdminSystemOperationCallback, ADMIN_SYSTEM_OPERATION_ACTIONS],
  [handleAdminDeliveryHardSkipCallback, ADMIN_DELIVERY_HARD_SKIP_ACTIONS],
  [handleAdminAuditMetricCallback, ADMIN_AUDIT_METRIC_ACTIONS],
  [handleAdminQStashCallback, ADMIN_QSTASH_ACTIONS],
  [handleAdminFounderControlCallback, ADMIN_FOUNDER_CONTROL_ACTIONS],
];

for (const [handler, actions] of handlers) {
  equal(await handler(makeCtx(), { a: 'a:menu' }, { id: 1 }, makeDeps()), false, 'handler rejects unrelated action');
  for (const action of actions) {
    const deps = makeDeps({ admin: false });
    equal(await handler(makeCtx(), { a: action }, { id: 1 }, deps), true, `${action} unauthorized execution handled`);
    equal(deps.calls.length, 0, `${action} unauthorized execution cannot reach mutation/render dependencies`);
  }
}

for (const [handler, action] of [
  [handleAdminSystemNavigationCallback, 'a:admin_home'],
  [handleAdminSystemOperationCallback, 'a:admin_invites'],
  [handleAdminDeliveryHardSkipCallback, 'a:hs_view'],
  [handleAdminAuditMetricCallback, 'a:admin_metrics'],
  [handleAdminQStashCallback, 'a:admin_qstash_status'],
  [handleAdminFounderControlCallback, 'a:admin_founder'],
]) {
  const deps = makeDeps();
  equal(await handler(makeCtx(), { a: action, tg: 2002, d: 14 }, { id: 1 }, deps), true, `${action} authorized execution handled`);
  check(deps.calls.some(([name]) => name === 'call'), `${action} reaches bounded dependency`);
}

{
  const deps = makeDeps();
  const payload = { a: 'a:admin' };
  equal(await handleAdminSystemNavigationCallback(makeCtx(), payload, { id: 1 }, deps), true, 'legacy admin alias handled');
  equal(payload.a, 'a:admin_home', 'legacy admin alias resolves to admin home');
}
{
  const deps = makeDeps();
  equal(await handleAdminMessageTemplateCallback(makeCtx(), { a: 'a:adm_ph', r: 'tpl_list', p: 0 }, { id: 1 }, deps), true, 'placeholder helper handled by communications domain');
  check(deps.calls.some(([name]) => name === 'call'), 'placeholder helper renders help');
}

await assert.rejects(
  () => handleAdminSystemNavigationCallback(makeCtx(), { a: 'a:admin_home' }, { id: 1 }, {}),
  /admin_system_domain\.missing_dependency:/
); assertions += 1;
await assert.rejects(
  () => handleAdminQStashCallback(makeCtx(), { a: 'a:admin_qstash_status' }, { id: 1 }, {}),
  /admin_system_domain\.missing_dependency:/
); assertions += 1;

const summary = summarizeCallbackOwnership();
equal(summary.extracted, 482, 'STEP590E6 cumulative extracted ownership');
equal(summary.legacy, 78, 'STEP590E6 cumulative legacy ownership');
equal(summary.byRoute[CALLBACK_ROUTE.ADMIN_SYSTEM_NAVIGATION], 4, 'navigation route count');
equal(summary.byRoute[CALLBACK_ROUTE.ADMIN_SYSTEM_OPERATIONS], 5, 'operations route count');
equal(summary.byRoute[CALLBACK_ROUTE.ADMIN_DELIVERY_HARD_SKIP], 6, 'hard-skip route count');
equal(summary.byRoute[CALLBACK_ROUTE.ADMIN_AUDIT_METRICS], 5, 'audit/metrics route count');
equal(summary.byRoute[CALLBACK_ROUTE.ADMIN_QSTASH_CONTROLS], 2, 'QStash route count');
equal(summary.byRoute[CALLBACK_ROUTE.ADMIN_FOUNDER_CONTROLS], 8, 'founder route count');
equal(summary.byRoute[CALLBACK_ROUTE.ADMIN_MESSAGE_TEMPLATES], 10, 'communications templates include placeholder helper');

console.log(`PASS STEP590E5D admin operations/system/founder extraction tests (${assertions} assertions)`);
