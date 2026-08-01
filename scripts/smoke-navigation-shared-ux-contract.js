import assert from 'node:assert/strict';
import fs from 'node:fs';

const bot = fs.readFileSync(new URL('../src/bot/bot.js', import.meta.url), 'utf8');
const navActions = fs.readFileSync(new URL('../src/bot/shared/navigation/actions.js', import.meta.url), 'utf8');
const navCallbacks = fs.readFileSync(new URL('../src/bot/shared/navigation/callbacks.js', import.meta.url), 'utf8');
const navRoute = fs.readFileSync(new URL('../src/bot/shared/navigation/route.js', import.meta.url), 'utf8');
const uxActions = fs.readFileSync(new URL('../src/bot/shared/telegramUx/actions.js', import.meta.url), 'utf8');
const uxCallbacks = fs.readFileSync(new URL('../src/bot/shared/telegramUx/callbacks.js', import.meta.url), 'utf8');
const uxRoute = fs.readFileSync(new URL('../src/bot/shared/telegramUx/route.js', import.meta.url), 'utf8');
const ownership = fs.readFileSync(new URL('../src/bot/router/callbackOwnership.js', import.meta.url), 'utf8');
const contracts = fs.readFileSync(new URL('../src/bot/router/callbackContracts.js', import.meta.url), 'utf8');
const consistency = fs.readFileSync(new URL('./callback-consistency-check.js', import.meta.url), 'utf8');

const navigationActions = [
  'a:ui_mode_set', 'a:guide', 'a:menu_push', 'a:menu', 'a:role_pick',
  'a:home', 'a:home_hint_ack', 'a:home_mode', 'a:main_menu',
];
for (const action of navigationActions) {
  assert.ok(navActions.includes(`'${action}'`), `${action} declared in navigation shared layer`);
  assert.ok(!bot.includes(`if (p.a === '${action}') {`), `${action} removed from legacy dispatcher`);
}
assert.ok(uxActions.includes("USER_ACK: 'a:usr_ack'"), 'user ack declared in shared Telegram UX');
assert.ok(!bot.includes("if (p.a === 'a:usr_ack') {"), 'user ack removed from legacy dispatcher');

assert.ok(navCallbacks.includes('export async function handleNavigationCallback'), 'navigation executable handler exists');
assert.ok(navCallbacks.includes("navigation_shared.missing_dependency"), 'navigation dependency failures explicit');
assert.ok(navCallbacks.includes("console.error('menu_push_failed'"), 'menu push failure marker preserved');
assert.ok(navCallbacks.includes("clearSupportFollowupContext(ctx.from.id)"), 'menu/home support context clearing preserved');
assert.ok(navCallbacks.includes("markHomeHubHintSeen(ctx.from.id)"), 'home hint acknowledgement preserved');
assert.ok(navCallbacks.includes("db.listBrandsForManager(u.id)"), 'manager access source preserved');
assert.ok(navCallbacks.includes("setBmActiveBrand"), 'single manager brand activation preserved');
assert.ok(navCallbacks.includes("setCuratorMode(ctx.from.id, true)"), 'curator overlay activation preserved');
assert.ok(!navCallbacks.includes('createBroadcast'), 'navigation has no broadcast business mutation');
assert.ok(!navCallbacks.includes('drawAndFinalize'), 'navigation has no giveaway business mutation');
assert.ok(!navCallbacks.includes('applyPayment'), 'navigation has no payment business mutation');

assert.ok(uxCallbacks.includes('export async function handleTelegramUxCallback'), 'shared Telegram UX handler exists');
assert.ok(uxCallbacks.includes("'a:menu_push|src:admmsg'"), 'admin receipt menu navigation preserved');
assert.ok(uxCallbacks.includes("'a:support_push|src:admmsg'"), 'admin receipt support navigation preserved');
assert.ok(uxCallbacks.includes('reply_markup: undefined'), 'default ack button removal preserved');

for (const [from, to] of [
  ['a:brand_managers', 'a:brand_team'],
  ['a:brand_team_home', 'a:brand_team'],
  ['a:team', 'a:brand_team'],
  ['a:curators', 'a:cur_home'],
  ['a:curators_home', 'a:cur_home'],
  ['a:curator_home', 'a:cur_home'],
  ['a:home_hub', 'a:home'],
]) {
  assert.ok(uxActions.includes(`'${from}': '${to}'`), `${from} alias preserved`);
}
assert.ok(bot.includes('p.a = resolveCallbackActionAlias(p.a);'), 'bot uses shared alias resolver');
assert.ok(!bot.includes('const _aliasA = {'), 'inline alias table removed');
assert.ok(consistency.includes('CALLBACK_ACTION_ALIASES'), 'consistency gate reads canonical alias table');

assert.ok(navRoute.includes('NAVIGATION_SHARED_ROUTE_DEFINITION'), 'navigation route descriptor exists');
assert.ok(uxRoute.includes('TELEGRAM_UX_SHARED_ROUTE_DEFINITION'), 'Telegram UX route descriptor exists');
assert.ok(contracts.includes("NAVIGATION_SHARED: 'navigation_shared'"), 'navigation route contract exists');
assert.ok(contracts.includes("TELEGRAM_UX_SHARED: 'telegram_ux_shared'"), 'Telegram UX route contract exists');
assert.ok(ownership.includes('NAVIGATION_CALLBACK_ROUTE_DEFINITIONS'), 'ownership consumes navigation routes');
assert.ok(ownership.includes('TELEGRAM_UX_CALLBACK_ROUTE_DEFINITIONS'), 'ownership consumes Telegram UX routes');
assert.ok(bot.includes('navigation_shared: (ctx2, p2, u2) => handleNavigationCallback('), 'navigation owner wired');
assert.ok(bot.includes('telegram_ux_shared: (ctx2, p2, u2) => handleTelegramUxCallback('), 'Telegram UX owner wired');
assert.ok(bot.includes('const navigationSharedDeps = {'), 'navigation dependencies explicit');
assert.ok(bot.includes('const telegramUxSharedDeps = {'), 'Telegram UX dependencies explicit');

console.log('PASS STEP590D navigation/shared Telegram UX source contract');
