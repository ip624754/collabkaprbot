import assert from 'node:assert/strict';
import {
  NAVIGATION_ACTION,
  NAVIGATION_CALLBACK_ACTIONS,
  handleNavigationCallback,
  isNavigationCallbackAction,
} from '../src/bot/shared/navigation/index.js';
import {
  CALLBACK_ACTION_ALIASES,
  TELEGRAM_UX_ACTION,
  TELEGRAM_UX_CALLBACK_ACTIONS,
  handleTelegramUxCallback,
  isTelegramUxCallbackAction,
  resolveCallbackActionAlias,
} from '../src/bot/shared/telegramUx/index.js';

let assertions = 0;
function check(value, message) { assert.ok(value, message); assertions += 1; }
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions += 1; }
async function rejects(fn, pattern, message) { await assert.rejects(fn, pattern, message); assertions += 1; }

class FakeKeyboard {
  constructor() { this.rows = [[]]; }
  text(label, data) { this.rows[this.rows.length - 1].push({ label, data }); return this; }
  row() { this.rows.push([]); return this; }
}

function makeCtx({ replyMessage = { message_id: 91, chat: { id: 10 } }, keyboard = [] } = {}) {
  const events = [];
  return {
    from: { id: 777, username: 'owner' },
    state: { cid: 'cid-1' },
    callbackQuery: { message: { chat: { id: 10 }, message_id: 20, reply_markup: { inline_keyboard: keyboard } } },
    events,
    api: {
      async editMessageReplyMarkup(chatId, messageId, payload) { events.push(['editMarkup', chatId, messageId, payload]); return true; },
    },
    async answerCallbackQuery(payload) { events.push(['ack', payload || null]); return true; },
    async reply(text, options) { events.push(['reply', text, options]); return replyMessage; },
  };
}

function baseDeps(overrides = {}) {
  const calls = [];
  const state = {
    uiModeRaw: null,
    uiMode: null,
    curatorMode: false,
    managerMode: false,
    activeBrand: null,
    managerBrands: [],
    flags: { isCurator: false },
  };
  const deps = {
    InlineKeyboard: FakeKeyboard,
    cfg: { GUIDE_BANNER_FILE_ID: 'banner-1' },
    uiModes: { CREATOR: 'creator', BRAND: 'brand' },
    db: {
      async listBrandsForManager(userId) { calls.push(['listBrandsForManager', userId]); return state.managerBrands; },
    },
    redis: {
      async get(key) { calls.push(['redisGet', key]); return state.uiModeRaw; },
    },
    key: (parts) => parts.join(':'),
    normalizeUiMode: (mode) => String(mode || 'creator').toLowerCase(),
    disableBrandManagerState: async (tgId) => { calls.push(['disableBrandManagerState', tgId]); state.managerMode = false; state.activeBrand = null; },
    setUiMode: async (tgId, mode) => { calls.push(['setUiMode', tgId, mode]); state.uiMode = mode; },
    trackAcqRole: async (tgId, mode) => calls.push(['trackAcqRole', tgId, mode]),
    getRoleFlags: async (u, tgId) => { calls.push(['getRoleFlags', u?.id, tgId]); return state.flags; },
    getRoleFlagsCached: async (u, tgId) => { calls.push(['getRoleFlagsCached', u?.id, tgId]); return state.flags; },
    getCuratorMode: async (tgId) => { calls.push(['getCuratorMode', tgId]); return state.curatorMode; },
    setCuratorMode: async (tgId, value) => { calls.push(['setCuratorMode', tgId, value]); state.curatorMode = value; },
    getBrandManagerMode: async (tgId) => { calls.push(['getBrandManagerMode', tgId]); return state.managerMode; },
    setBrandManagerMode: async (tgId, value) => { calls.push(['setBrandManagerMode', tgId, value]); state.managerMode = value; },
    getBmActiveBrand: async (tgId) => { calls.push(['getBmActiveBrand', tgId]); return state.activeBrand; },
    setBmActiveBrand: async (tgId, value) => { calls.push(['setBmActiveBrand', tgId, value]); state.activeBrand = value; },
    resolveUiMode: async (tgId) => { calls.push(['resolveUiMode', tgId]); return state.uiMode || 'creator'; },
    safeEditOrReply: async (...args) => calls.push(['safeEditOrReply', ...args]),
    navKb: (back) => ({ back }),
    curatorModeMenuKb: (flags) => ({ curator: !!flags.isCurator }),
    renderMainMenu: async (...args) => calls.push(['renderMainMenu', ...args]),
    renderRoleHub: async (...args) => calls.push(['renderRoleHub', ...args]),
    renderRoleSelection: async (...args) => calls.push(['renderRoleSelection', ...args]),
    renderHomeHub: async (...args) => calls.push(['renderHomeHub', ...args]),
    maybeSendBanner: async (...args) => calls.push(['maybeSendBanner', ...args]),
    makeUiCtxForMessage: (ctx, message) => ({ ...ctx, callbackQuery: { message }, pushed: true }),
    clearExpectText: async (tgId) => calls.push(['clearExpectText', tgId]),
    clearSupportFollowupContext: async (tgId) => calls.push(['clearSupportFollowupContext', tgId]),
    markHomeHubHintSeen: async (tgId) => calls.push(['markHomeHubHintSeen', tgId]),
  };
  Object.assign(deps, overrides);
  return { deps, calls, state };
}

const user = { id: 12 };

equal(NAVIGATION_CALLBACK_ACTIONS.length, 9, 'navigation action count');
equal(new Set(NAVIGATION_CALLBACK_ACTIONS).size, 9, 'navigation actions unique');
check(Object.isFrozen(NAVIGATION_CALLBACK_ACTIONS), 'navigation action list frozen');
for (const action of NAVIGATION_CALLBACK_ACTIONS) check(isNavigationCallbackAction(action), `${action} classified`);
check(!isNavigationCallbackAction('a:support'), 'unrelated navigation action excluded');
equal(TELEGRAM_UX_CALLBACK_ACTIONS, ['a:usr_ack'], 'shared Telegram UX action count');
check(isTelegramUxCallbackAction(TELEGRAM_UX_ACTION.USER_ACK), 'user ack classified');
check(!isTelegramUxCallbackAction('a:menu'), 'menu excluded from Telegram UX route');
equal(Object.keys(CALLBACK_ACTION_ALIASES).length, 7, 'legacy alias count preserved');
equal(resolveCallbackActionAlias('a:home_hub'), 'a:home', 'home alias preserved');
equal(resolveCallbackActionAlias('a:team'), 'a:brand_team', 'team alias preserved');
equal(resolveCallbackActionAlias('a:menu'), 'a:menu', 'canonical action unchanged');

{
  const ctx = makeCtx();
  const { deps } = baseDeps();
  equal(await handleNavigationCallback(ctx, { a: 'a:support' }, user, deps), false, 'navigation declines unrelated');
  equal(await handleTelegramUxCallback(ctx, { a: 'a:support' }, user, { InlineKeyboard: FakeKeyboard }), false, 'Telegram UX declines unrelated');
}

{
  const ctx = makeCtx();
  const { deps, calls } = baseDeps();
  equal(await handleNavigationCallback(ctx, { a: NAVIGATION_ACTION.MENU }, user, deps), true, 'menu handled');
  check(calls.some((row) => row[0] === 'clearExpectText'), 'menu clears text input');
  check(calls.some((row) => row[0] === 'clearSupportFollowupContext'), 'menu clears support followup');
  equal(calls.filter((row) => row[0] === 'renderRoleHub').length, 1, 'menu renders role hub once');
}

{
  const ctx = makeCtx();
  const { deps, calls } = baseDeps();
  equal(await handleNavigationCallback(ctx, { a: NAVIGATION_ACTION.HOME }, user, deps), true, 'home handled');
  check(calls.some((row) => row[0] === 'clearExpectText'), 'home clears text input');
  check(calls.some((row) => row[0] === 'clearSupportFollowupContext'), 'home clears support followup');
  equal(calls.filter((row) => row[0] === 'renderHomeHub').length, 1, 'home renders home hub once');
}

{
  const ctx = makeCtx();
  const { deps, calls } = baseDeps();
  equal(await handleNavigationCallback(ctx, { a: NAVIGATION_ACTION.HOME_HINT_ACK }, user, deps), true, 'home hint ack handled');
  check(calls.some((row) => row[0] === 'markHomeHubHintSeen'), 'home hint persisted');
  equal(calls.find((row) => row[0] === 'renderHomeHub')?.[4], { edit: true, noHint: true }, 'home hint rerender noHint preserved');
}

{
  const ctx = makeCtx();
  const { deps, calls } = baseDeps();
  equal(await handleNavigationCallback(ctx, { a: NAVIGATION_ACTION.ROLE_PICK }, user, deps), true, 'role pick handled');
  equal(calls.filter((row) => row[0] === 'renderRoleSelection').length, 1, 'role selection rendered once');
}

{
  const ctx = makeCtx();
  const { deps, calls } = baseDeps();
  equal(await handleNavigationCallback(ctx, { a: NAVIGATION_ACTION.MAIN_MENU }, user, deps), true, 'main menu handled');
  equal(calls.filter((row) => row[0] === 'renderRoleHub').length, 1, 'main menu renders role hub once');
}

{
  const ctx = makeCtx();
  const { deps, calls, state } = baseDeps();
  state.uiModeRaw = null;
  equal(await handleNavigationCallback(ctx, { a: NAVIGATION_ACTION.UI_MODE_SET, m: 'brand' }, user, deps), true, 'ui mode set handled');
  equal(state.uiMode, 'brand', 'ui mode persisted');
  check(calls.some((row) => row[0] === 'disableBrandManagerState'), 'ui mode disables manager context');
  check(calls.some((row) => row[0] === 'trackAcqRole' && row[2] === 'brand'), 'first ui mode tracks acquisition');
  equal(calls.filter((row) => row[0] === 'renderMainMenu').length, 1, 'ui mode renders main menu once');
}

{
  const ctx = makeCtx();
  const { deps, calls, state } = baseDeps();
  state.uiModeRaw = 'creator';
  state.flags = { isCurator: true };
  state.curatorMode = true;
  equal(await handleNavigationCallback(ctx, { a: NAVIGATION_ACTION.UI_MODE_SET, m: 'creator' }, user, deps), true, 'curator overlay ui mode handled');
  check(!calls.some((row) => row[0] === 'trackAcqRole'), 'existing ui mode does not retrack acquisition');
  check(calls.some((row) => row[0] === 'safeEditOrReply' && String(row[2]).includes('Режим куратора')), 'curator overlay copy preserved');
  check(!calls.some((row) => row[0] === 'renderMainMenu'), 'curator overlay skips regular menu');
}

for (const mode of ['creator', 'brand']) {
  const ctx = makeCtx();
  const { deps, calls, state } = baseDeps();
  state.uiModeRaw = null;
  equal(await handleNavigationCallback(ctx, { a: NAVIGATION_ACTION.HOME_MODE, m: mode }, user, deps), true, `${mode} home mode handled`);
  equal(state.uiMode, mode, `${mode} home mode persisted`);
  check(calls.some((row) => row[0] === 'renderRoleHub'), `${mode} renders role hub`);
  check(calls.some((row) => row[0] === 'trackAcqRole' && row[2] === mode), `${mode} first pick tracked`);
}

{
  const ctx = makeCtx();
  const { deps, calls, state } = baseDeps();
  state.managerBrands = [];
  equal(await handleNavigationCallback(ctx, { a: NAVIGATION_ACTION.HOME_MODE, m: 'brand_manager' }, user, deps), true, 'manager denial consumed');
  check(calls.some((row) => row[0] === 'safeEditOrReply' && String(row[2]).includes('не добавили')), 'manager denial copy preserved');
  check(!calls.some((row) => row[0] === 'setBrandManagerMode'), 'manager denial has no manager mutation');
}

{
  const ctx = makeCtx();
  const { deps, calls, state } = baseDeps();
  state.managerBrands = [{ brand_user_id: 44 }];
  equal(await handleNavigationCallback(ctx, { a: NAVIGATION_ACTION.HOME_MODE, m: 'brand_manager' }, user, deps), true, 'manager mode handled');
  equal(state.managerMode, true, 'manager mode enabled');
  equal(state.activeBrand, 44, 'single managed brand auto-selected');
  check(calls.some((row) => row[0] === 'renderRoleHub'), 'manager mode renders role hub');
}

{
  const ctx = makeCtx();
  const { deps, calls, state } = baseDeps();
  state.flags = { isCurator: false };
  equal(await handleNavigationCallback(ctx, { a: NAVIGATION_ACTION.HOME_MODE, m: 'curator' }, user, deps), true, 'curator denial consumed');
  check(calls.some((row) => row[0] === 'safeEditOrReply' && String(row[2]).includes('Доступ к кабинету куратора')), 'curator denial copy preserved');
  check(!calls.some((row) => row[0] === 'setCuratorMode' && row[2] === true), 'curator denial does not enable overlay');
}

{
  const ctx = makeCtx();
  const { deps, calls, state } = baseDeps();
  state.flags = { isCurator: true };
  equal(await handleNavigationCallback(ctx, { a: NAVIGATION_ACTION.HOME_MODE, m: 'curator' }, user, deps), true, 'curator mode handled');
  equal(state.curatorMode, true, 'curator mode enabled');
  equal(state.uiMode, 'creator', 'curator remains creator-side overlay');
  check(calls.some((row) => row[0] === 'renderRoleHub'), 'curator mode renders role hub');
}

{
  const ctx = makeCtx();
  const { deps, calls } = baseDeps();
  equal(await handleNavigationCallback(ctx, { a: NAVIGATION_ACTION.HOME_MODE, m: 'unknown' }, user, deps), true, 'unknown mode bounded');
  equal(calls.filter((row) => row[0] === 'renderHomeHub').length, 1, 'unknown mode refreshes home');
}

for (const [mode, expected] of [['creator', 'Мои каналы'], ['brand', 'Сделки']]) {
  const ctx = makeCtx();
  const { deps, calls, state } = baseDeps();
  state.uiMode = mode;
  equal(await handleNavigationCallback(ctx, { a: NAVIGATION_ACTION.GUIDE }, user, deps), true, `${mode} guide handled`);
  const edit = calls.find((row) => row[0] === 'safeEditOrReply');
  check(String(edit?.[2]).includes(expected), `${mode} guide copy preserved`);
  equal(calls.filter((row) => row[0] === 'maybeSendBanner').length, 1, `${mode} guide banner called once`);
}

{
  const ctx = makeCtx();
  const { deps, calls } = baseDeps();
  equal(await handleNavigationCallback(ctx, { a: NAVIGATION_ACTION.MENU_PUSH, src: 'admmsg' }, user, deps), true, 'admin receipt menu push handled');
  check(!ctx.events.some((row) => row[0] === 'editMarkup'), 'admin receipt buttons retained');
  equal(calls.filter((row) => row[0] === 'renderRoleHub').length, 1, 'menu push renders new message once');
}

{
  const ctx = makeCtx();
  const { deps, calls } = baseDeps();
  equal(await handleNavigationCallback(ctx, { a: NAVIGATION_ACTION.MENU_PUSH, src: 'system' }, user, deps), true, 'system menu push handled');
  equal(ctx.events.filter((row) => row[0] === 'editMarkup').length, 1, 'system source buttons hidden once');
  equal(calls.filter((row) => row[0] === 'renderRoleHub').length, 1, 'system menu push renders role hub');
}

{
  const ctx = makeCtx({ replyMessage: null });
  const { deps, calls } = baseDeps();
  equal(await handleNavigationCallback(ctx, { a: NAVIGATION_ACTION.MENU_PUSH }, user, deps), true, 'menu push send fallback handled');
  equal(calls.filter((row) => row[0] === 'renderRoleHub').length, 1, 'menu push fallback renders current message');
}

{
  const ctx = makeCtx();
  equal(await handleTelegramUxCallback(ctx, { a: TELEGRAM_UX_ACTION.USER_ACK, src: 'admmsg' }, user, { InlineKeyboard: FakeKeyboard }), true, 'admin receipt ack handled');
  const edit = ctx.events.find((row) => row[0] === 'editMarkup');
  check(edit?.[3]?.reply_markup instanceof FakeKeyboard, 'admin receipt ack keeps navigation keyboard');
  equal(edit[3].reply_markup.rows[0].map((button) => button.data), ['a:menu_push|src:admmsg', 'a:support_push|src:admmsg'], 'admin receipt navigation exact');
}

{
  const keyboard = [[{ callback_data: 'a:menu_push|src:admmsg' }]];
  const ctx = makeCtx({ keyboard });
  equal(await handleTelegramUxCallback(ctx, { a: TELEGRAM_UX_ACTION.USER_ACK }, user, { InlineKeyboard: FakeKeyboard }), true, 'legacy receipt source inference handled');
  const edit = ctx.events.find((row) => row[0] === 'editMarkup');
  check(edit?.[3]?.reply_markup instanceof FakeKeyboard, 'legacy receipt inference keeps navigation');
}

{
  const ctx = makeCtx();
  equal(await handleTelegramUxCallback(ctx, { a: TELEGRAM_UX_ACTION.USER_ACK, src: 'system' }, user, { InlineKeyboard: FakeKeyboard }), true, 'default ack handled');
  const edit = ctx.events.find((row) => row[0] === 'editMarkup');
  equal(edit?.[3]?.reply_markup, undefined, 'default ack removes buttons');
}

await rejects(
  () => handleNavigationCallback(makeCtx(), { a: NAVIGATION_ACTION.MENU }, user, {}),
  /navigation_shared\.missing_dependency:getRoleFlags/,
  'navigation dependency failure explicit'
);
await rejects(
  () => handleTelegramUxCallback(makeCtx(), { a: TELEGRAM_UX_ACTION.USER_ACK }, user, {}),
  /telegram_ux_shared\.missing_dependency:InlineKeyboard/,
  'Telegram UX dependency failure explicit'
);

console.log(`PASS STEP590D navigation/shared Telegram UX tests (${assertions} assertions)`);
