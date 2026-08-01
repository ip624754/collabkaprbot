import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [bot, actions, callbacks, route, ownership, contracts] = await Promise.all([
  read('src/bot/bot.js'),
  read('src/bot/domains/adminOperations/actions.js'),
  Promise.all([
    read('src/bot/domains/adminOperations/usersCallbacks.js'),
    read('src/bot/domains/adminOperations/giftsCallbacks.js'),
    read('src/bot/domains/adminOperations/supportCallbacks.js'),
    read('src/bot/domains/adminOperations/moderatorCallbacks.js'),
  ]).then((parts) => parts.join('\n')),
  read('src/bot/domains/adminOperations/route.js'),
  read('src/bot/router/callbackOwnership.js'),
  read('src/bot/router/callbackContracts.js'),
]);

const users = [
  'a:admin_users','a:admin_users_search','a:admin_users_reset',
  'a:adm_ucard','a:adm_ucopy','a:adm_ucsv','a:adm_umsg','a:adm_umsg_free','a:adm_umsg_send',
  'a:adm_unote','a:adm_unote_edit','a:adm_unote_tag','a:adm_unote_clear_q','a:adm_unote_clear',
  'a:adm_uban_q','a:adm_uban_do','a:adm_urevoke_q','a:adm_urevoke_do','a:adm_ugift','a:adm_ugift_do',
];
const gifts = [
  'a:adm_gift','a:adm_gift_input','a:adm_gift_do','a:adm_gift_batch',
  'a:adm_gift_revoke','a:adm_gift_revoke_input','a:adm_gift_revoke_do','a:adm_gift_revoke_batch',
];
const support = [
  'a:admin_support','a:admin_support_list','a:admin_support_view','a:admin_support_set',
  'a:adm_support_qr','a:adm_support_reply','a:adm_support_reply_cancel',
];
const moderators = ['a:admin_mod_list','a:admin_mod_add','a:admin_mod_rm'];
for (const action of [...users, ...gifts, ...support, ...moderators]) {
  const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(actions, new RegExp(escaped));
  assert.match(callbacks, new RegExp(escaped));
  assert.doesNotMatch(bot, new RegExp(`if \\(p\\.a === ['\"]${escaped}['\"]\\)`));
}
assert.match(route, /CALLBACK_ROUTE\.ADMIN_USERS/);
assert.match(route, /CALLBACK_ROUTE\.ADMIN_GIFTS/);
assert.match(route, /CALLBACK_ROUTE\.ADMIN_SUPPORT/);
assert.match(route, /CALLBACK_ROUTE\.ADMIN_MODERATOR_GOVERNANCE/);
assert.match(ownership, /ADMIN_OPERATION_CALLBACK_ROUTE_DEFINITIONS/);
assert.match(contracts, /ADMIN_USERS: 'admin_users'/);
assert.match(contracts, /ADMIN_GIFTS: 'admin_gifts'/);
assert.match(contracts, /ADMIN_SUPPORT: 'admin_support'/);
assert.match(contracts, /ADMIN_MODERATOR_GOVERNANCE: 'admin_moderator_governance'/);
assert.match(bot, /handleAdminUsersCallback/);
assert.match(bot, /handleAdminGiftsCallback/);
assert.match(bot, /handleAdminSupportCallback/);
assert.match(bot, /handleAdminModeratorGovernanceCallback/);
assert.match(callbacks, /admin_operations_domain\.missing_dependency:/);
assert.match(callbacks, /setSupportThreadStatusForAdmin/);
assert.match(callbacks, /removeNetworkModerator/);
assert.match(callbacks, /banUser/);
assert.match(callbacks, /revokeBrandPlan/);
assert.match(callbacks, /markSupportThreadOperatorReply/);
assert.doesNotMatch(actions, /a:adm_umsg_tpl/);
assert.doesNotMatch(actions, /a:admin_umsg_tpls/);
assert.doesNotMatch(actions, /a:admin_outbox/);
assert.match(bot, /if \(p\.a === 'a:adm_umsg_tpl'\)/);
console.log('PASS STEP590E5B admin users/support/moderator governance bounded-domain source contract');
