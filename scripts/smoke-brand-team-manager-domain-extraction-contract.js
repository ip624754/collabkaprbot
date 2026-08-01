import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [bot, actions, callbacks, route, ownership, contracts] = await Promise.all([
  read('src/bot/bot.js'),
  read('src/bot/domains/brands/actions.js'),
  Promise.all([
    read('src/bot/domains/brands/managerCallbacks.js'),
    read('src/bot/domains/brands/teamCallbacks.js'),
  ]).then((parts) => parts.join('\n')),
  read('src/bot/domains/brands/route.js'),
  read('src/bot/router/callbackOwnership.js'),
  read('src/bot/router/callbackContracts.js'),
]);

const actionsList = [
  'a:bm_home', 'a:bm_help', 'a:bm_mode_set', 'a:bm_pick_brand', 'a:bms', 'a:bm_set_brand',
  'a:brand_team_help', 'a:brand_team', 'a:bm_invite', 'a:bm_add_username', 'a:bm_list', 'a:bm_rm_q', 'a:bm_rm_ok',
];
for (const action of actionsList) {
  assert.match(actions, new RegExp(action.replace(':', '\\:')));
  assert.match(callbacks, new RegExp(action.replace(':', '\\:')));
}
for (const action of ['a:bm_home', 'a:bm_help', 'a:bm_mode_set', 'a:bm_pick_brand', 'a:brand_team_help', 'a:brand_team', 'a:bm_invite', 'a:bm_add_username', 'a:bm_list', 'a:bm_rm_q', 'a:bm_rm_ok']) {
  assert.doesNotMatch(bot, new RegExp(`if \\(p\\.a === ['\"]${action.replace(':', '\\:')}['\"]\\)`));
}
assert.doesNotMatch(bot, /if \(p\.a === 'a:bms' \|\| p\.a === 'a:bm_set_brand'\)/);
assert.match(route, /CALLBACK_ROUTE\.BRAND_MANAGER_MODE/);
assert.match(route, /CALLBACK_ROUTE\.BRAND_TEAM_MEMBERSHIP/);
assert.match(ownership, /BRAND_CALLBACK_ROUTE_DEFINITIONS/);
assert.match(contracts, /BRAND_MANAGER_MODE: 'brand_manager_mode'/);
assert.match(contracts, /BRAND_TEAM_MEMBERSHIP: 'brand_team_membership'/);
assert.match(bot, /handleBrandManagerModeCallback/);
assert.match(bot, /handleBrandTeamMembershipCallback/);
assert.match(callbacks, /brand_domain\.missing_dependency:/);
assert.match(callbacks, /removeBrandManager/);
assert.match(callbacks, /setBrandManagerMode/);
assert.match(callbacks, /const wsId = Number\(p\.w \|\| p\.ws \|\| 0\);/);
assert.doesNotMatch(actions, /a:cur_home/);
assert.doesNotMatch(actions, /a:brand_buy/);
assert.doesNotMatch(actions, /a:brand_apps/);
console.log('PASS STEP590E4B brand team/manager bounded-domain source contract');
