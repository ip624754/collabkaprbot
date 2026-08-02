import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const bot = read('src/bot/bot.js');
const actions = read('src/bot/domains/userServices/actions.js');
const route = read('src/bot/domains/userServices/route.js');
const support = read('src/bot/domains/userServices/supportCallbacks.js');
const verification = read('src/bot/domains/userServices/verificationCallbacks.js');
const sharing = read('src/bot/domains/userServices/sharingCallbacks.js');
const account = read('src/bot/domains/userServices/accountCallbacks.js');
const ownership = read('src/bot/router/callbackOwnership.js');
const contracts = read('src/bot/router/callbackContracts.js');

const expected = [
  'a:support', 'a:support_push', 'a:support_write',
  'a:verify_home', 'a:verify_info', 'a:verify_kind',
  'a:share', 'a:share_perf', 'a:share_points', 'a:share_link', 'a:share_card',
  'a:share_history', 'a:share_rewards', 'a:share_redeem', 'a:share_redeem_do',
  'a:acc_del_q', 'a:acc_del_do', 'a:acc_restore',
];

for (const action of expected) {
  assert.ok(actions.includes(`'${action}'`), `action catalog contains ${action}`);
  const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.ok(!new RegExp(`if\\s*\\(p\\.a\\s*===\\s*['"]${escaped}['"]`).test(bot), `legacy branch removed for ${action}`);
}
assert.equal(new Set(expected).size, 18, '18 exact live user-service callbacks');
assert.ok(route.includes('USER_SUPPORT'), 'support route declared');
assert.ok(route.includes('USER_VERIFICATION'), 'verification route declared');
assert.ok(route.includes('USER_SHARING'), 'sharing route declared');
assert.ok(route.includes('USER_ACCOUNT'), 'account route declared');
assert.ok(ownership.includes('USER_SERVICE_CALLBACK_ROUTE_DEFINITIONS'), 'ownership composition includes user services');
for (const marker of [
  "USER_SUPPORT: 'user_support'",
  "USER_VERIFICATION: 'user_verification'",
  "USER_SHARING: 'user_sharing'",
  "USER_ACCOUNT: 'user_account'",
]) assert.ok(contracts.includes(marker), `callback contract declared: ${marker}`);
assert.ok(support.includes("if (p.a === 'a:support_push')"), 'support push moved');
assert.ok(verification.includes("if (p.a === 'a:verify_kind')"), 'verification submission moved');
assert.ok(sharing.includes("if (p.a === 'a:share_redeem_do')"), 'reward redemption moved');
assert.ok(account.includes("if (p.a === 'a:acc_del_do')"), 'account deletion moved');
assert.ok(account.includes("if (p.a === 'a:acc_restore')"), 'account restoration moved');
assert.ok(/if\s*\(p\.a\s*===\s*['"]a:notice['"]/.test(bot), 'user notice remains outside STEP590E6');
assert.ok(/if\s*\(p\.a\s*===\s*['"]a:founder['"]/.test(bot), 'founder purchase remains outside STEP590E6');

console.log('PASS STEP590E6 support/verification/sharing/account source contract');
