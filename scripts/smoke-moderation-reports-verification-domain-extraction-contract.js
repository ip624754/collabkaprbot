import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [bot, actions, callbacks, route, ownership, contracts] = await Promise.all([
  read('src/bot/bot.js'),
  read('src/bot/domains/moderation/actions.js'),
  Promise.all([
    read('src/bot/domains/moderation/reportsCallbacks.js'),
    read('src/bot/domains/moderation/verificationCallbacks.js'),
  ]).then((parts) => parts.join('\n')),
  read('src/bot/domains/moderation/route.js'),
  read('src/bot/router/callbackOwnership.js'),
  read('src/bot/router/callbackContracts.js'),
]);

const reports = [
  'a:mod_home', 'a:mod_reports', 'a:mod_report',
  'a:mod_r_freeze', 'a:mod_r_close', 'a:mod_r_resolve',
];
const verification = [
  'a:mod_verifs', 'a:mod_verif_view', 'a:mod_verif_approve', 'a:mod_verif_reject',
];
for (const action of [...reports, ...verification]) {
  const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(actions, new RegExp(escaped));
  assert.match(callbacks, new RegExp(escaped));
  assert.doesNotMatch(bot, new RegExp(`if \\(p\\.a === ['\"]${escaped}['\"]\\)`));
}
assert.match(route, /CALLBACK_ROUTE\.MODERATION_REPORTS/);
assert.match(route, /CALLBACK_ROUTE\.MODERATION_VERIFICATION/);
assert.match(ownership, /MODERATION_CALLBACK_ROUTE_DEFINITIONS/);
assert.match(contracts, /MODERATION_REPORTS: 'moderation_reports'/);
assert.match(contracts, /MODERATION_VERIFICATION: 'moderation_verification'/);
assert.match(bot, /handleModerationReportsCallback/);
assert.match(bot, /handleModerationVerificationCallback/);
assert.match(callbacks, /moderation_domain\.missing_dependency:/);
assert.match(callbacks, /Number\.isInteger\(rid\)/);
assert.match(callbacks, /Number\.isInteger\(targetUserId\)/);
assert.match(callbacks, /moderatorFreezeBarterOffer/);
assert.match(callbacks, /moderatorCloseBarterThread/);
assert.match(callbacks, /resolveBarterReport/);
assert.match(callbacks, /setVerificationStatus/);
assert.match(callbacks, /safeUserVerifications/);
assert.doesNotMatch(actions, /a:admin_mod_add/);
assert.doesNotMatch(actions, /a:admin_mod_list/);
assert.doesNotMatch(actions, /a:admin_mod_rm/);
console.log('PASS STEP590E5A moderation reports/verification bounded-domain source contract');
