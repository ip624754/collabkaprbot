import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const [bot, actions, callbacks, route, ownership, contracts] = await Promise.all([
  read('src/bot/bot.js'),
  read('src/bot/domains/brands/actions.js'),
  Promise.all([
    read('src/bot/domains/brands/directoryCallbacks.js'),
    read('src/bot/domains/brands/profileCallbacks.js'),
  ]).then((parts) => parts.join('\n')),
  read('src/bot/domains/brands/route.js'),
  read('src/bot/router/callbackOwnership.js'),
  read('src/bot/router/callbackContracts.js'),
]);

const actionsList = [
  'a:brands_home', 'a:brands_filters', 'a:bd_fpick', 'a:bd_freset', 'a:bd_fset',
  'a:bd_mclear', 'a:bd_mdone', 'a:bd_mpick', 'a:bd_mt', 'a:brand_dir_open',
  'a:brand_profile', 'a:brand_profile_edit', 'a:brand_profile_more', 'a:brand_continue',
  'a:brand_prof_more', 'a:brand_prof_set', 'a:brand_niche_pick', 'a:brand_niche_set',
  'a:brand_niche_clear', 'a:brand_ty_t', 'a:brand_ty_clear', 'a:brand_ty_done',
  'a:brand_bb_pick', 'a:brand_bb_set', 'a:brand_bb_clear', 'a:brand_bb_done',
  'a:brand_gt_pick', 'a:brand_gt_t', 'a:brand_gt_clear', 'a:brand_gt_done',
  'a:brand_rt_pick', 'a:brand_rt_t', 'a:brand_rt_clear', 'a:brand_rt_done',
  'a:brand_prof_reset', 'a:brand_prof_reset_ok', 'a:brand_pass', 'a:brand_plan',
];

for (const action of actionsList) {
  assert.match(actions, new RegExp(action.replace(':', '\\:')));
  assert.match(callbacks, new RegExp(action.replace(':', '\\:')));
  assert.doesNotMatch(bot, new RegExp(`if \\(p\\.a === ['\"]${action.replace(':', '\\:')}['\"]\\)`));
}

assert.match(route, /CALLBACK_ROUTE\.BRAND_DIRECTORY/);
assert.match(route, /CALLBACK_ROUTE\.BRAND_PROFILE/);
assert.match(ownership, /BRAND_CALLBACK_ROUTE_DEFINITIONS/);
assert.match(contracts, /BRAND_DIRECTORY: 'brand_directory'/);
assert.match(contracts, /BRAND_PROFILE: 'brand_profile'/);
assert.match(bot, /handleBrandDirectoryCallback/);
assert.match(bot, /handleBrandProfileCallback/);
assert.match(bot, /brandDomainDeps/);
assert.match(callbacks, /brand_domain\.missing_dependency:/);
assert.match(callbacks, /deleteBrandProfile/);
assert.match(callbacks, /resolveBmBrandContext/);
assert.match(callbacks, /renderBrandsDirectory/);

assert.doesNotMatch(actions, /a:brand_buy/);
assert.doesNotMatch(actions, /a:brand_plan_buy/);
assert.doesNotMatch(actions, /a:brand_apps/);
assert.doesNotMatch(actions, /a:brand_deals/);
assert.match(actions, /a:bm_home/);
assert.doesNotMatch(actions, /a:cur_home/);

console.log('PASS STEP590E4A brands directory/profile bounded-domain source contract');
