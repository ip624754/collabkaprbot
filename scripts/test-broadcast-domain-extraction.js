import assert from 'node:assert/strict';
import {
  BROADCAST_ACTION,
  BROADCAST_AUDIENCE_ACTIONS,
  BROADCAST_COMPOSER_ACTIONS,
  BROADCAST_CRITICAL_CALLBACK_ACTIONS,
  BROADCAST_DISPATCH_ACTIONS,
  BROADCAST_OPERATIONS_ACTIONS,
  handleBroadcastAudienceCallback,
  handleBroadcastComposerCallback,
  handleBroadcastDispatchCallback,
  handleBroadcastOperationsCallback,
  isBroadcastAudienceAction,
  isBroadcastComposerAction,
  isBroadcastCriticalCallbackAction,
  isBroadcastDispatchAction,
  isBroadcastOperationsAction,
} from '../src/bot/domains/broadcasts/index.js';

let assertions = 0;
function check(value, message) {
  assert.ok(value, message);
  assertions += 1;
}
function equal(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}
async function rejects(fn, pattern, message) {
  await assert.rejects(fn, pattern, message);
  assertions += 1;
}

class FakeKeyboard {
  constructor() { this.rows = [[]]; }
  text(label, data) {
    this.rows[this.rows.length - 1].push({ label, data });
    return this;
  }
  row() {
    this.rows.push([]);
    return this;
  }
}

function makeCtx({ admin = true } = {}) {
  const events = [];
  return {
    from: { id: admin ? 777 : 778, username: admin ? 'owner' : 'guest' },
    events,
    async answerCallbackQuery(payload) {
      events.push({ type: 'ack', payload: payload || null });
      return true;
    },
  };
}

function baseDeps(overrides = {}) {
  const calls = [];
  let draft = {
    type: 'text',
    mode: 'simple',
    text: 'hello',
    audience: 'all',
    buttons: [],
  };
  let rememberedAudience = 'all';
  let broadcastStatus = 'RUNNING';

  const deps = {
    InlineKeyboard: FakeKeyboard,
    commsCb: {
      bcStart: () => 'a:bc_start',
      bcSimpleButton: () => 'a:bc_simple_button',
      bcBtnDone: () => 'a:bc_btn_done',
      bcButtons: () => 'a:bc_buttons',
      bcView: (id) => `a:bc_view|id:${id}`,
      bcList: (page) => `a:bc_list|p:${page}`,
    },
    isAdmin: (ctx) => ctx.from.id === 777,
    safeEditOrReply: async (_ctx, text, options = {}) => calls.push(['edit', text, options]),
    clearExpectText: async (tgId) => calls.push(['clearExpectText', tgId]),
    setExpectText: async (tgId, state, ttl) => calls.push(['setExpectText', tgId, state, ttl]),
    clearDraft: async (tgId) => { calls.push(['clearDraft', tgId]); draft = null; },
    getDraft: async (tgId) => { calls.push(['getDraft', tgId]); return draft; },
    setDraft: async (tgId, next, ttl) => { calls.push(['setDraft', tgId, structuredClone(next), ttl]); draft = structuredClone(next); },
    renderBroadcastSimpleComposer: async (_ctx, banner) => calls.push(['renderSimple', banner]),
    renderBroadcastSimpleButtonPicker: async (_ctx, value) => calls.push(['renderButtonPicker', structuredClone(value)]),
    broadcastSimpleButtonPresets: () => [{ key: 'bot', label: 'Открыть бота', url: 'https://t.me/example' }],
    getBroadcastRememberedAudience: async (tgId) => { calls.push(['getRememberedAudience', tgId]); return rememberedAudience; },
    setBroadcastRememberedAudience: async (tgId, audience) => { calls.push(['setRememberedAudience', tgId, audience]); rememberedAudience = audience; },
    renderBroadcastAudiencePicker: async () => calls.push(['renderAudiencePicker']),
    broadcastDraftHasContent: (value) => !!(value?.text || value?.fileId || value?.draftText),
    sendBroadcastPreviewToOperator: async (_ctx, value) => calls.push(['sendPreview', structuredClone(value)]),
    renderBroadcastPreview: async (_ctx, value, options) => calls.push(['renderPreview', structuredClone(value), options]),
    buildBroadcastPayloadFromDraft: (value) => ({
      draftType: value.type,
      draftText: value.text,
      buttons: value.buttons,
    }),
    audienceLabel: (audience) => audience === 'brands' ? 'Бренды' : 'Все',
    buildBroadcastFirstBatchSafetyText: () => ['Сначала малая партия', 'Проверь счётчики', 'Не повторяй вслепую'],
    renderBroadcastList: async (_ctx, page) => calls.push(['renderList', page]),
    renderBroadcastView: async (_ctx, id) => calls.push(['renderView', id]),
    renderBroadcastBlocked: async (_ctx, id, page, tab) => calls.push(['renderBlocked', id, page, tab]),
    renderAdminHome: async () => calls.push(['renderAdminHome']),
    renderAdminSystem: async () => calls.push(['renderAdminSystem']),
    getOperatorControlSnapshot: async (options) => { calls.push(['getControl', options]); return { byId: { broadcast_qstash_fanout: { value: false } } }; },
    setOperatorControlToggle: async (...args) => calls.push(['setControl', ...args]),
    rateLimit: async (key, options) => { calls.push(['rateLimit', key, options]); return { ok: true, allowed: true }; },
    key: (parts) => parts.join(':'),
    kbAdminFooter: (kb, label, callback) => { calls.push(['footer', label, callback]); kb.text(label, callback); return kb; },
    escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    logger: { error: (meta, message) => calls.push(['logError', meta, message]) },
    db: {
      async upsertUser(tgId, username) { calls.push(['upsertUser', tgId, username]); return { id: 12 }; },
      async countBroadcastAudience(audience) { calls.push(['countAudience', audience]); return 25; },
      async createBroadcastIdempotent(payload, options) {
        calls.push(['createBroadcast', structuredClone(payload), structuredClone(options)]);
        return { ok: true, deduped: false, broadcast: { id: 44 } };
      },
      async getBroadcast(id) { calls.push(['getBroadcast', id]); return { id, status: broadcastStatus }; },
      async updateBroadcast(id, patch) { calls.push(['updateBroadcast', id, structuredClone(patch)]); broadcastStatus = patch.status || broadcastStatus; return true; },
    },
  };

  Object.assign(deps, overrides);
  return {
    deps,
    calls,
    getDraftValue: () => draft,
    setDraftValue: (value) => { draft = value; },
    setBroadcastStatus: (value) => { broadcastStatus = value; },
  };
}

// Static action taxonomy and ownership groups.
equal(BROADCAST_COMPOSER_ACTIONS.length, 17, 'composer action count');
equal(BROADCAST_AUDIENCE_ACTIONS.length, 2, 'audience action count');
equal(BROADCAST_DISPATCH_ACTIONS.length, 2, 'dispatch action count');
equal(BROADCAST_OPERATIONS_ACTIONS.length, 7, 'operations action count');
equal(BROADCAST_CRITICAL_CALLBACK_ACTIONS.length, 28, 'critical action count');
equal(new Set(BROADCAST_CRITICAL_CALLBACK_ACTIONS).size, 28, 'critical action keys unique');
check(Object.isFrozen(BROADCAST_COMPOSER_ACTIONS), 'composer actions frozen');
check(Object.isFrozen(BROADCAST_CRITICAL_CALLBACK_ACTIONS), 'critical actions frozen');
for (const action of BROADCAST_COMPOSER_ACTIONS) check(isBroadcastComposerAction(action), `${action} composer policy`);
for (const action of BROADCAST_AUDIENCE_ACTIONS) check(isBroadcastAudienceAction(action), `${action} audience policy`);
for (const action of BROADCAST_DISPATCH_ACTIONS) check(isBroadcastDispatchAction(action), `${action} dispatch policy`);
for (const action of BROADCAST_OPERATIONS_ACTIONS) check(isBroadcastOperationsAction(action), `${action} operations policy`);
for (const action of BROADCAST_CRITICAL_CALLBACK_ACTIONS) check(isBroadcastCriticalCallbackAction(action), `${action} critical policy`);
check(!isBroadcastCriticalCallbackAction('a:menu'), 'unrelated action excluded');

// Unrelated callbacks are not claimed by bounded handlers.
{
  const ctx = makeCtx();
  const { deps } = baseDeps();
  equal(await handleBroadcastComposerCallback(ctx, { a: 'a:menu' }, { id: 1 }, deps), false, 'composer declines unrelated');
  equal(await handleBroadcastAudienceCallback(ctx, { a: 'a:menu' }, { id: 1 }, deps), false, 'audience declines unrelated');
  equal(await handleBroadcastDispatchCallback(ctx, { a: 'a:menu' }, { id: 1 }, deps), false, 'dispatch declines unrelated');
  equal(await handleBroadcastOperationsCallback(ctx, { a: 'a:menu' }, { id: 1 }, deps), false, 'operations declines unrelated');
}

// Every route fails closed for non-admin actors without side effects.
for (const [handler, action] of [
  [handleBroadcastComposerCallback, BROADCAST_ACTION.START],
  [handleBroadcastAudienceCallback, BROADCAST_ACTION.SIMPLE_AUDIENCE],
  [handleBroadcastDispatchCallback, BROADCAST_ACTION.CONFIRM],
  [handleBroadcastOperationsCallback, BROADCAST_ACTION.LIST],
]) {
  const ctx = makeCtx({ admin: false });
  const { deps, calls } = baseDeps();
  equal(await handler(ctx, { a: action }, { id: 1 }, deps), true, `${action} unauthorized consumed`);
  equal(ctx.events[0]?.payload?.text, 'Нет доступа.', `${action} unauthorized toast`);
  equal(calls.length, 0, `${action} unauthorized no side effects`);
}

// Composer start clears text mode and renders the canonical simple editor.
{
  const ctx = makeCtx();
  const { deps, calls } = baseDeps();
  equal(await handleBroadcastComposerCallback(ctx, { a: BROADCAST_ACTION.START }, { id: 1 }, deps), true, 'start handled');
  check(calls.some((row) => row[0] === 'clearExpectText'), 'start clears expect text');
  check(calls.some((row) => row[0] === 'renderSimple'), 'start renders simple composer');
}

// Advanced editor preserves exact input mode and TTL.
{
  const ctx = makeCtx();
  const { deps, calls } = baseDeps();
  equal(await handleBroadcastComposerCallback(ctx, { a: BROADCAST_ACTION.START_ADVANCED }, { id: 1 }, deps), true, 'advanced handled');
  check(calls.some((row) => row[0] === 'clearDraft'), 'advanced clears draft');
  equal(calls.find((row) => row[0] === 'setExpectText')?.slice(2), [{ type: 'bc_content' }, 1800], 'advanced expect mode preserved');
}

// Media clear removes only media fields and preserves text/audience.
{
  const ctx = makeCtx();
  const state = baseDeps();
  state.setDraftValue({ type: 'photo', mode: 'simple', text: 'caption', mediaType: 'photo', fileId: 'f1', caption: 'caption', audience: 'brands', buttons: [] });
  equal(await handleBroadcastComposerCallback(ctx, { a: BROADCAST_ACTION.SIMPLE_MEDIA_CLEAR }, { id: 1 }, state.deps), true, 'media clear handled');
  const value = state.getDraftValue();
  equal(value.mediaType, undefined, 'media type removed');
  equal(value.fileId, undefined, 'file id removed');
  equal(value.caption, undefined, 'caption removed');
  equal(value.text, 'caption', 'text preserved');
  equal(value.audience, 'brands', 'audience preserved');
}

// Preset button stores exactly one URL button.
{
  const ctx = makeCtx();
  const state = baseDeps();
  equal(await handleBroadcastComposerCallback(ctx, { a: BROADCAST_ACTION.SIMPLE_BUTTON_PRESET, k: 'bot' }, { id: 1 }, state.deps), true, 'preset handled');
  equal(state.getDraftValue().buttons, [{ text: 'Открыть бота', url: 'https://t.me/example' }], 'preset button saved exactly');
  check(state.calls.some((row) => row[0] === 'renderSimple' && String(row[1]).includes('Открыть бота')), 'preset confirmation rendered');
}

// Unknown preset is bounded and writes nothing.
{
  const ctx = makeCtx();
  const state = baseDeps();
  const before = structuredClone(state.getDraftValue());
  equal(await handleBroadcastComposerCallback(ctx, { a: BROADCAST_ACTION.SIMPLE_BUTTON_PRESET, k: 'missing' }, { id: 1 }, state.deps), true, 'unknown preset consumed');
  equal(state.getDraftValue(), before, 'unknown preset leaves draft unchanged');
  equal(ctx.events.at(-1)?.payload?.text, 'Готовый вариант недоступен.', 'unknown preset feedback');
}

// Preview without content performs no Telegram preview send.
{
  const ctx = makeCtx();
  const state = baseDeps();
  state.setDraftValue({ mode: 'simple', audience: 'all', buttons: [] });
  equal(await handleBroadcastComposerCallback(ctx, { a: BROADCAST_ACTION.PREVIEW }, { id: 1 }, state.deps), true, 'empty preview consumed');
  check(!state.calls.some((row) => row[0] === 'sendPreview'), 'empty preview does not send');
  equal(ctx.events.at(-1)?.payload?.text, 'Нет контента для preview.', 'empty preview feedback');
}

// Preview with content sends once and returns to the composer.
{
  const ctx = makeCtx();
  const state = baseDeps();
  equal(await handleBroadcastComposerCallback(ctx, { a: BROADCAST_ACTION.PREVIEW }, { id: 1 }, state.deps), true, 'preview handled');
  equal(state.calls.filter((row) => row[0] === 'sendPreview').length, 1, 'preview sends exactly once');
  equal(state.calls.filter((row) => row[0] === 'renderSimple').length, 1, 'preview returns to simple composer once');
}

// Clear resets to a bounded simple draft and remembers audience.
{
  const ctx = makeCtx();
  const state = baseDeps();
  equal(await handleBroadcastComposerCallback(ctx, { a: BROADCAST_ACTION.SIMPLE_CLEAR }, { id: 1 }, state.deps), true, 'simple clear handled');
  equal(state.getDraftValue(), { mode: 'simple', audience: 'all', buttons: [] }, 'simple clear exact draft');
}

// Template selection preserves the expected type/kind contract.
for (const [action, kind] of [
  [BROADCAST_ACTION.TEMPLATE_GIVEAWAY, 'gw'],
  [BROADCAST_ACTION.TEMPLATE_BRAND_PROFILE, 'bp'],
  [BROADCAST_ACTION.TEMPLATE_OFFER, 'offer'],
]) {
  const ctx = makeCtx();
  const state = baseDeps();
  equal(await handleBroadcastComposerCallback(ctx, { a: action }, { id: 1 }, state.deps), true, `${action} handled`);
  equal(state.calls.find((row) => row[0] === 'setExpectText')?.slice(2), [{ type: 'bc_btn_tpl_id', kind }, 600], `${action} expect contract`);
}

// Audience picker and audience persistence remain separate exact actions.
{
  const ctx = makeCtx();
  const state = baseDeps();
  equal(await handleBroadcastAudienceCallback(ctx, { a: BROADCAST_ACTION.SIMPLE_AUDIENCE }, { id: 1 }, state.deps), true, 'simple audience handled');
  check(state.calls.some((row) => row[0] === 'renderAudiencePicker'), 'simple audience renders picker');
}
{
  const ctx = makeCtx();
  const state = baseDeps();
  equal(await handleBroadcastAudienceCallback(ctx, { a: BROADCAST_ACTION.AUDIENCE, aud: 'brands' }, { id: 1 }, state.deps), true, 'audience selection handled');
  equal(state.getDraftValue().audience, 'brands', 'audience persisted in draft');
  check(state.calls.some((row) => row[0] === 'setRememberedAudience' && row[2] === 'brands'), 'audience remembered');
  check(state.calls.some((row) => row[0] === 'renderSimple' && String(row[1]).includes('Бренды')), 'audience banner rendered');
}

// Confirm is rate-limited before DB job creation.
{
  const ctx = makeCtx();
  const state = baseDeps({ rateLimit: async () => ({ ok: false, allowed: false }) });
  equal(await handleBroadcastDispatchCallback(ctx, { a: BROADCAST_ACTION.CONFIRM }, { id: 1 }, state.deps), true, 'rate-limited confirm consumed');
  check(!state.calls.some((row) => row[0] === 'createBroadcast'), 'rate-limited confirm creates no job');
  check(state.calls.some((row) => row[0] === 'edit' && String(row[1]).includes('Подожди минуту')), 'rate-limit recovery rendered');
}

// Confirm uses one idempotent DB boundary and does not send recipients directly.
{
  const ctx = makeCtx();
  const state = baseDeps();
  equal(await handleBroadcastDispatchCallback(ctx, { a: BROADCAST_ACTION.CONFIRM }, { id: 1 }, state.deps), true, 'confirm handled');
  equal(state.calls.filter((row) => row[0] === 'createBroadcast').length, 1, 'createBroadcastIdempotent called once');
  const create = state.calls.find((row) => row[0] === 'createBroadcast');
  equal(create[1].createdByUserId, 12, 'created-by user preserved');
  equal(create[1].audience, 'all', 'audience preserved');
  equal(create[1].draftType, 'text', 'draft type preserved');
  equal(create[2], { statementTimeoutMs: 8000, dedupWindowSec: 45 }, 'idempotency options preserved');
  check(state.calls.some((row) => row[0] === 'clearDraft'), 'successful confirm clears draft');
  check(state.calls.some((row) => row[0] === 'edit' && String(row[1]).includes('Рассылка #44')), 'success screen rendered');
  check(!state.calls.some((row) => row[0] === 'sendPreview'), 'confirm does not reuse preview send path');
}

// Busy idempotency result does not clear the operator draft.
{
  const ctx = makeCtx();
  const state = baseDeps();
  state.deps.db.createBroadcastIdempotent = async () => ({ ok: false, error: 'busy' });
  equal(await handleBroadcastDispatchCallback(ctx, { a: BROADCAST_ACTION.CONFIRM }, { id: 1 }, state.deps), true, 'busy confirm consumed');
  check(!state.calls.some((row) => row[0] === 'clearDraft'), 'busy result preserves draft');
  check(state.calls.some((row) => row[0] === 'edit' && String(row[1]).includes('Уже создаю')), 'busy feedback rendered');
}

// Cancel clears both state machines and returns home.
{
  const ctx = makeCtx();
  const state = baseDeps();
  equal(await handleBroadcastDispatchCallback(ctx, { a: BROADCAST_ACTION.CANCEL }, { id: 1 }, state.deps), true, 'cancel handled');
  check(state.calls.some((row) => row[0] === 'clearExpectText'), 'cancel clears input mode');
  check(state.calls.some((row) => row[0] === 'clearDraft'), 'cancel clears draft');
  check(state.calls.some((row) => row[0] === 'renderAdminHome'), 'cancel returns admin home');
}

// Operations renders list/view/blocked exactly once.
for (const [action, payload, expected] of [
  [BROADCAST_ACTION.LIST, { p: '2' }, ['renderList', 2]],
  [BROADCAST_ACTION.VIEW, { id: '44' }, ['renderView', 44]],
  [BROADCAST_ACTION.BLOCKED, { id: '44', p: '3', t: 'retry' }, ['renderBlocked', 44, 3, 'retry']],
]) {
  const ctx = makeCtx();
  const state = baseDeps();
  equal(await handleBroadcastOperationsCallback(ctx, { a: action, ...payload }, { id: 1 }, state.deps), true, `${action} handled`);
  equal(state.calls.find((row) => row[0] === expected[0]), expected, `${action} renderer contract`);
}

// Pause, resume and stop preserve exact status transitions.
{
  const ctx = makeCtx();
  const state = baseDeps();
  equal(await handleBroadcastOperationsCallback(ctx, { a: BROADCAST_ACTION.PAUSE, id: '44' }, { id: 1 }, state.deps), true, 'pause handled');
  equal(state.calls.find((row) => row[0] === 'updateBroadcast'), ['updateBroadcast', 44, { status: 'PAUSED' }], 'pause transition');
}
{
  const ctx = makeCtx();
  const state = baseDeps();
  state.setBroadcastStatus('PAUSED');
  equal(await handleBroadcastOperationsCallback(ctx, { a: BROADCAST_ACTION.RESUME, id: '44' }, { id: 1 }, state.deps), true, 'resume handled');
  equal(state.calls.find((row) => row[0] === 'updateBroadcast'), ['updateBroadcast', 44, { status: 'RUNNING' }], 'resume transition');
}
{
  const ctx = makeCtx();
  const state = baseDeps();
  equal(await handleBroadcastOperationsCallback(ctx, { a: BROADCAST_ACTION.STOP, id: '44' }, { id: 1 }, state.deps), true, 'stop handled');
  const patch = state.calls.find((row) => row[0] === 'updateBroadcast')?.[2];
  equal(patch.status, 'STOPPED', 'stop status');
  check(/^\d{4}-\d{2}-\d{2}T/.test(patch.finished_at), 'stop timestamp ISO');
}

// Invalid transition is fail-closed and read-only.
{
  const ctx = makeCtx();
  const state = baseDeps();
  state.setBroadcastStatus('DONE');
  equal(await handleBroadcastOperationsCallback(ctx, { a: BROADCAST_ACTION.PAUSE, id: '44' }, { id: 1 }, state.deps), true, 'invalid pause consumed');
  check(!state.calls.some((row) => row[0] === 'updateBroadcast'), 'invalid pause has no DB write');
  equal(ctx.events.at(-1)?.payload?.text, 'Нельзя приостановить.', 'invalid pause feedback');
}

// QStash toggle preserves actor audit metadata and rerenders system state.
{
  const ctx = makeCtx();
  const state = baseDeps();
  equal(await handleBroadcastOperationsCallback(ctx, { a: BROADCAST_ACTION.QSTASH_TOGGLE }, { id: 1 }, state.deps), true, 'qstash toggle handled');
  const setControl = state.calls.find((row) => row[0] === 'setControl');
  equal(setControl[1], 'broadcast_qstash_fanout', 'control id preserved');
  equal(setControl[2], true, 'control value inverted');
  equal(setControl[3], { actorTgId: 777, actorUsername: 'owner', note: 'telegram_admin' }, 'control audit actor preserved');
  check(state.calls.some((row) => row[0] === 'renderAdminSystem'), 'system rerendered');
}

// Missing dependencies fail closed instead of silently returning to legacy.
await rejects(
  () => handleBroadcastComposerCallback(makeCtx(), { a: BROADCAST_ACTION.START }, { id: 1 }, { isAdmin: () => true }),
  /broadcast_domain\.missing_dependency:InlineKeyboard/,
  'missing composer dependency explicit'
);
await rejects(
  () => handleBroadcastOperationsCallback(makeCtx(), { a: BROADCAST_ACTION.LIST }, { id: 1 }, { isAdmin: () => true }),
  /broadcast_domain\.missing_dependency:renderBroadcastList/,
  'missing operations dependency explicit'
);

console.log(`PASS STEP590C4 broadcast domain extraction tests (${assertions} assertions)`);
