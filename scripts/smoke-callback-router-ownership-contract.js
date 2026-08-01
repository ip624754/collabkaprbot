import fs from 'node:fs';
import assert from 'node:assert/strict';

const bot = fs.readFileSync(new URL('../src/bot/bot.js', import.meta.url), 'utf8');
const facade = fs.readFileSync(new URL('../src/bot/routes/callbacks.js', import.meta.url), 'utf8');
const router = fs.readFileSync(new URL('../src/bot/router/callbackRouter.js', import.meta.url), 'utf8');
const ownership = fs.readFileSync(new URL('../src/bot/router/callbackOwnership.js', import.meta.url), 'utf8');

const requiredBotFragments = [
  'dispatchPreUserCallback(ctx, p',
  'admin_web_auth: (ctx2, p2) => handleAdminWebAuthDecisionCallback(ctx2, p2)',
  'giveaway_access: (ctx2, p2, u2) => handleGwAccessRoute(ctx2, p2, u2',
  'await dispatchCallback(ctx, p, u',
];
for (const fragment of requiredBotFragments) {
  assert.ok(bot.includes(fragment), `bot.js missing callback router wiring: ${fragment}`);
}

assert.ok(!bot.includes('if (await handleAdminWebAuthDecisionCallback(ctx, p)) return;'), 'direct auth bypass must be removed');
assert.ok(facade.includes('dispatchOwnedCallback'), 'transport facade must use pure executable router');
assert.ok(facade.includes('CALLBACK_PHASE.PRE_USER'), 'transport facade must expose pre-user phase');
assert.ok(facade.includes('CALLBACK_PHASE.POST_USER'), 'transport facade must expose post-user phase');
assert.ok(router.includes('callback_dispatch.missing_handler'), 'missing extracted owner must fail closed');
assert.ok(router.includes('callback_dispatch.extracted_handler_contract'), 'extracted owner cannot silently decline');
assert.ok(ownership.includes("'a:aw_auth_dec'"), 'admin auth action must have exact owner');
assert.ok(ownership.includes("'a:gw_access_user_prompt'"), 'giveaway access family must have exact owner');
assert.ok(ownership.includes('callback_route.duplicate_action_owner'), 'duplicate action ownership must hard fail');
assert.ok(ownership.includes('callback_route.unknown_action'), 'unknown extracted action must hard fail');

console.log('PASS STEP590B callback router ownership source contract');
