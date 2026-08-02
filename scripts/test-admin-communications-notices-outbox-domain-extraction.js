import assert from 'node:assert/strict';
import {
  ADMIN_COMMUNICATION_HOME_ACTIONS,
  ADMIN_MESSAGE_TEMPLATE_ACTIONS,
  ADMIN_NOTICE_ACTIONS,
  ADMIN_OUTBOX_ACTIONS,
} from '../src/bot/domains/adminCommunications/actions.js';
import { handleAdminCommunicationsCallback } from '../src/bot/domains/adminCommunications/communicationsCallbacks.js';
import { handleAdminNoticeCallback } from '../src/bot/domains/adminCommunications/noticeCallbacks.js';
import { handleAdminOutboxCallback } from '../src/bot/domains/adminCommunications/outboxCallbacks.js';
import { handleAdminMessageTemplateCallback } from '../src/bot/domains/adminCommunications/templateCallbacks.js';
import {
  isAdminCommunicationCallbackAction,
  isAdminCommunicationHomeAction,
  isAdminMessageTemplateAction,
  isAdminNoticeAction,
  isAdminOutboxAction,
} from '../src/bot/domains/adminCommunications/policy.js';
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
    state: { cid: 'e5c-test' },
    callbackQuery: { message: { message_id: 11, message_thread_id: 0 } },
    answerCallbackQuery: async (payload) => { calls.push(['ack', payload]); return true; },
    api: {
      sendMessage: async (...args) => { calls.push(['sendMessage', ...args]); return { message_id: 9001 }; },
    },
  };
}

function makeDeps({ admin = true } = {}) {
  const calls = [];
  const redisStore = new Map();
  const call = async (...args) => { calls.push(['call', ...args]); return null; };
  const deps = {
    calls,
    DEFAULT_ADMIN_DM_TEMPLATES: [
      { id: 'ack', label: 'Принято', text: 'Принято' },
      { id: 'done', label: 'Готово', text: 'Готово' },
    ],
    InlineKeyboard,
    TG_SAFE_BODY_MAX: 3000,
    adminDmPlaceholdersHelpHtml: () => '<b>placeholders</b>',
    applyAdminDmPlaceholders: (text) => ({ text: String(text || ''), used: [], unknown: [] }),
    buildAdminDmPlaceholderValues: async () => ({}),
    clearAdminOutbox: call,
    clearDraft: call,
    clearExpectText: call,
    clipCodepoints: (value) => ({ text: String(value || ''), wasClipped: false, origLen: String(value || '').length, newLen: String(value || '').length }),
    clipText: (value, max = 140) => String(value || '').slice(0, max),
    commsCb: {
      adminNotice: () => 'a:admin_notice',
      adminOutbox: (page = 0) => `a:admin_outbox|p:${page}`,
      adminOutboxView: (index, page = 0) => `a:admin_outbox_v|i:${index}|p:${page}`,
      adminOutboxClear: (page = 0) => `a:admin_outbox_clear|p:${page}`,
    },
    containsUrl: () => false,
    db: new Proxy({}, {
      get(_target, prop) {
        return async () => {
          calls.push(['db', String(prop)]);
          if (prop === 'getUserTgIdByUserId') return { id: 77, tg_id: 2002, tg_username: 'target' };
          return true;
        };
      },
    }),
    escapeHtml: (value) => String(value ?? ''),
    findAdminDmTemplate: (items, id) => (items || []).find((item) => String(item.id) === String(id)) || null,
    getAdminDmTemplatesWithMeta: async () => ({ tpls: { version: 1, items: [{ id: 'ack', label: 'Принято', text: 'Принято' }] } }),
    getAdminOutboxItemByIndex: async () => ({ target_user_id: 77, target_tg_id: 2002, target_username: 'target', snippet: 'Тест', ts: new Date().toISOString() }),
    getSysNotice: async () => ({ active: false, severity: 'info', target: 'all' }),
    isSuperAdminTg: () => admin,
    k: (parts) => parts.join(':'),
    kbAdminFooter: (kb) => kb,
    normalizeNoticeSeverity: (value) => String(value || 'info'),
    normalizeNoticeTarget: (value) => String(value || 'all'),
    randomToken: () => 'token123',
    redis: {
      get: async (key) => redisStore.get(String(key)) ?? null,
      set: async (key, value) => { redisStore.set(String(key), value); return true; },
      del: async (key) => { redisStore.delete(String(key)); return true; },
    },
    renderAdminComms: call,
    renderAdminDmTemplateView: call,
    renderAdminDmTemplates: call,
    renderAdminDmUserMessageHtml: (html) => String(html || ''),
    renderAdminOutbox: call,
    renderAdminOutboxView: call,
    renderAdminSysNotice: call,
    renderAdminUserNote: call,
    resetAdminDmTemplates: call,
    safeEditOrReply: call,
    sendAdminMessageToUser: call,
    setAdminDmTemplates: call,
    setAdminUserNoteReturn: call,
    setExpectText: call,
    setSysNotice: call,
  };
  return deps;
}

const all = [
  ...ADMIN_COMMUNICATION_HOME_ACTIONS,
  ...ADMIN_NOTICE_ACTIONS,
  ...ADMIN_OUTBOX_ACTIONS,
  ...ADMIN_MESSAGE_TEMPLATE_ACTIONS,
];

equal(ADMIN_COMMUNICATION_HOME_ACTIONS.length, 1, 'communications home action count');
equal(ADMIN_NOTICE_ACTIONS.length, 9, 'notice action count');
equal(ADMIN_OUTBOX_ACTIONS.length, 7, 'outbox action count');
equal(ADMIN_MESSAGE_TEMPLATE_ACTIONS.length, 10, 'message template action count after STEP590E5D ownership closure');
equal(new Set(all).size, 27, 'communications actions unique after STEP590E5D ownership closure');

for (const action of ADMIN_COMMUNICATION_HOME_ACTIONS) {
  check(isAdminCommunicationHomeAction(action), `${action} communications predicate`);
  check(isAdminCommunicationCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.ADMIN_COMMUNICATIONS, `${action} owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} phase`);
}
for (const action of ADMIN_NOTICE_ACTIONS) {
  check(isAdminNoticeAction(action), `${action} notice predicate`);
  check(isAdminCommunicationCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.ADMIN_NOTICE_MANAGEMENT, `${action} owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} phase`);
}
for (const action of ADMIN_OUTBOX_ACTIONS) {
  check(isAdminOutboxAction(action), `${action} outbox predicate`);
  check(isAdminCommunicationCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.ADMIN_OUTBOX, `${action} owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} phase`);
}
for (const action of ADMIN_MESSAGE_TEMPLATE_ACTIONS) {
  check(isAdminMessageTemplateAction(action), `${action} template predicate`);
  check(isAdminCommunicationCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.ADMIN_MESSAGE_TEMPLATES, `${action} owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} phase`);
}

equal(await handleAdminCommunicationsCallback(makeCtx(), { a: 'a:admin_notice' }, { id: 1 }, makeDeps()), false, 'home handler rejects notice action');
equal(await handleAdminNoticeCallback(makeCtx(), { a: 'a:admin_outbox' }, { id: 1 }, makeDeps()), false, 'notice handler rejects outbox action');
equal(await handleAdminOutboxCallback(makeCtx(), { a: 'a:admin_umsg_tpls' }, { id: 1 }, makeDeps()), false, 'outbox handler rejects template action');
equal(await handleAdminMessageTemplateCallback(makeCtx(), { a: 'a:admin_comms' }, { id: 1 }, makeDeps()), false, 'template handler rejects communications action');

for (const [handler, actions] of [
  [handleAdminCommunicationsCallback, ADMIN_COMMUNICATION_HOME_ACTIONS],
  [handleAdminNoticeCallback, ADMIN_NOTICE_ACTIONS],
  [handleAdminOutboxCallback, ADMIN_OUTBOX_ACTIONS],
  [handleAdminMessageTemplateCallback, ADMIN_MESSAGE_TEMPLATE_ACTIONS],
]) {
  for (const action of actions) {
    const deps = makeDeps({ admin: false });
    equal(await handler(makeCtx(), { a: action }, { id: 1 }, deps), true, `${action} unauthorized execution handled`);
    equal(deps.calls.filter(([name]) => name === 'db').length, 0, `${action} unauthorized execution cannot mutate DB`);
  }
}

await assert.rejects(
  () => handleAdminCommunicationsCallback(makeCtx(), { a: 'a:admin_comms' }, { id: 1 }, {}),
  /admin_communications_domain\.missing_dependency:/
);
assertions += 1;
await assert.rejects(
  () => handleAdminNoticeCallback(makeCtx(), { a: 'a:admin_notice' }, { id: 1 }, {}),
  /admin_communications_domain\.missing_dependency:/
);
assertions += 1;
await assert.rejects(
  () => handleAdminOutboxCallback(makeCtx(), { a: 'a:admin_outbox' }, { id: 1 }, {}),
  /admin_communications_domain\.missing_dependency:/
);
assertions += 1;
await assert.rejects(
  () => handleAdminMessageTemplateCallback(makeCtx(), { a: 'a:admin_umsg_tpls' }, { id: 1 }, {}),
  /admin_communications_domain\.missing_dependency:/
);
assertions += 1;

{
  const deps = makeDeps();
  equal(await handleAdminCommunicationsCallback(makeCtx(), { a: 'a:admin_comms' }, { id: 1 }, deps), true, 'communications home handled');
  check(deps.calls.some(([name]) => name === 'call'), 'communications renderer called');
}
{
  const deps = makeDeps();
  equal(await handleAdminNoticeCallback(makeCtx(), { a: 'a:admin_notice_toggle' }, { id: 1 }, deps), true, 'notice toggle handled');
  check(deps.calls.filter(([name]) => name === 'call').length >= 2, 'notice persisted and rendered');
}
{
  const deps = makeDeps();
  equal(await handleAdminOutboxCallback(makeCtx(), { a: 'a:admin_outbox_clear', p: 0 }, { id: 1 }, deps), true, 'outbox clear handled');
  check(deps.calls.filter(([name]) => name === 'call').length >= 2, 'outbox cleared and rendered');
}
{
  const deps = makeDeps();
  equal(await handleAdminMessageTemplateCallback(makeCtx(), { a: 'a:admin_umsg_tpl_reset', p: 0 }, { id: 1 }, deps), true, 'template reset handled');
  check(deps.calls.filter(([name]) => name === 'call').length >= 2, 'templates reset and rendered');
}

const summary = summarizeCallbackOwnership();
equal(summary.extracted, 464, 'STEP590E5D cumulative extracted ownership');
equal(summary.legacy, 96, 'STEP590E5D cumulative legacy ownership');
equal(summary.byRoute[CALLBACK_ROUTE.ADMIN_COMMUNICATIONS], 1, 'communications route count');
equal(summary.byRoute[CALLBACK_ROUTE.ADMIN_NOTICE_MANAGEMENT], 9, 'notice route count');
equal(summary.byRoute[CALLBACK_ROUTE.ADMIN_OUTBOX], 7, 'outbox route count');
equal(summary.byRoute[CALLBACK_ROUTE.ADMIN_MESSAGE_TEMPLATES], 10, 'message templates route count');
equal(getCallbackOwnership('a:notice').routeId, CALLBACK_ROUTE.LEGACY, 'user notice view remains outside admin communications boundary');

console.log(`PASS STEP590E5C admin communications/notices/outbox extraction tests (${assertions} assertions)`);
