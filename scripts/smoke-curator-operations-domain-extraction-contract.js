import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [bot, actions, callbacks, route, ownership, contracts] = await Promise.all([
  read('src/bot/bot.js'),
  read('src/bot/domains/curators/actions.js'),
  Promise.all([
    read('src/bot/domains/curators/operationsCallbacks.js'),
    read('src/bot/domains/curators/managementCallbacks.js'),
  ]).then((parts) => parts.join('\n')),
  read('src/bot/domains/curators/route.js'),
  read('src/bot/router/callbackOwnership.js'),
  read('src/bot/router/callbackContracts.js'),
]);

const operations = [
  'a:cur_mode_set', 'a:cur_home', 'a:cur_inbox', 'a:cur_leave_q', 'a:cur_leave_do',
  'a:cur_gw_open', 'a:cur_gw_stats', 'a:cur_gw_log', 'a:cur_gw_remind_q',
  'a:cur_gw_remind_send', 'a:cur_gw_owner_q', 'a:cur_gw_owner_send',
  'a:cur_gw_check_q', 'a:cur_gw_check_do', 'a:cur_gw_note_q', 'a:cur_note_cancel',
];
const management = [
  'a:cur_manage', 'a:cur_invite', 'a:cur_add_username', 'a:cur_list',
  'a:cur_audit', 'a:cur_rm_q', 'a:cur_rm_do',
];
for (const action of [...operations, ...management]) {
  const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(actions, new RegExp(escaped));
  assert.match(callbacks, new RegExp(escaped));
  assert.doesNotMatch(bot, new RegExp(`if \\(p\\.a === ['\"]${escaped}['\"]\\)`));
}
assert.match(route, /CALLBACK_ROUTE\.CURATOR_OPERATIONS/);
assert.match(route, /CALLBACK_ROUTE\.CURATOR_MANAGEMENT/);
assert.match(ownership, /CURATOR_CALLBACK_ROUTE_DEFINITIONS/);
assert.match(contracts, /CURATOR_OPERATIONS: 'curator_operations'/);
assert.match(contracts, /CURATOR_MANAGEMENT: 'curator_management'/);
assert.match(bot, /handleCuratorOperationsCallback/);
assert.match(bot, /handleCuratorManagementCallback/);
assert.match(callbacks, /curator_domain\.missing_dependency:/);
assert.match(callbacks, /removeCurator/);
assert.match(callbacks, /getGiveawayForCurator/);
assert.match(callbacks, /setCurGwChecked/);
assert.match(callbacks, /share\/url\?url=/);
assert.doesNotMatch(actions, /a:cur_ws['"]/);
assert.doesNotMatch(actions, /a:curator_home/);
assert.doesNotMatch(actions, /a:curators_home/);
assert.doesNotMatch(actions, /a:brand_team/);
console.log('PASS STEP590E4C curator operations bounded-domain source contract');
