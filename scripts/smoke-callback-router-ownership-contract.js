import fs from 'node:fs';
import assert from 'node:assert/strict';

const bot = fs.readFileSync(new URL('../src/bot/bot.js', import.meta.url), 'utf8');
const facade = fs.readFileSync(new URL('../src/bot/routes/callbacks.js', import.meta.url), 'utf8');
const router = fs.readFileSync(new URL('../src/bot/router/callbackRouter.js', import.meta.url), 'utf8');
const ownership = fs.readFileSync(new URL('../src/bot/router/callbackOwnership.js', import.meta.url), 'utf8');
const adminAuthActions = fs.readFileSync(new URL('../src/bot/domains/adminAuth/actions.js', import.meta.url), 'utf8');
const adminAuthRoute = fs.readFileSync(new URL('../src/bot/domains/adminAuth/route.js', import.meta.url), 'utf8');
const giveawayRoute = fs.readFileSync(new URL('../src/bot/domains/giveaways/route.js', import.meta.url), 'utf8');

const requiredBotFragments = [
  'dispatchPreUserCallback(ctx, p',
  'admin_web_auth: (ctx2, p2) => handleAdminAuthChallengeCallback(ctx2, p2)',
  'giveaway_access: (ctx2, p2, u2) => handleGiveawayAccessCallback(',
  'giveaway_participant: (ctx2, p2, u2) => handleGiveawayParticipantCallback(',
  'giveaway_lifecycle: (ctx2, p2, u2) => handleGiveawayLifecycleCallback(',
  'await dispatchCallback(ctx, p, u',
];
for (const fragment of requiredBotFragments) {
  assert.ok(bot.includes(fragment), `bot.js missing callback router wiring: ${fragment}`);
}

assert.ok(!bot.includes('if (await handleAdminAuthChallengeCallback(ctx, p)) return;'), 'direct auth bypass must be removed');
assert.ok(bot.includes('admin_web_auth_control: (ctx2, p2, u2) => handleAdminAuthControlCallback'), 'post-user auth control must be routed explicitly');
assert.ok(facade.includes('dispatchOwnedCallback'), 'transport facade must use pure executable router');
assert.ok(facade.includes('CALLBACK_PHASE.PRE_USER'), 'transport facade must expose pre-user phase');
assert.ok(facade.includes('CALLBACK_PHASE.POST_USER'), 'transport facade must expose post-user phase');
assert.ok(router.includes('callback_dispatch.missing_handler'), 'missing extracted owner must fail closed');
assert.ok(router.includes('callback_dispatch.extracted_handler_contract'), 'extracted owner cannot silently decline');
assert.ok(ownership.includes('ADMIN_AUTH_CALLBACK_ROUTE_DEFINITIONS'), 'admin auth ownership must come from the bounded domain descriptor');
assert.ok(adminAuthActions.includes("DECIDE: 'a:aw_auth_dec'"), 'admin auth domain must own exact action key');
assert.ok(adminAuthRoute.includes('CALLBACK_PHASE.PRE_USER'), 'admin auth challenge route must preserve pre-user phase');
assert.ok(adminAuthRoute.includes('CALLBACK_PHASE.POST_USER'), 'admin auth control route must preserve post-user phase');
assert.ok(ownership.includes('GIVEAWAY_CALLBACK_ROUTE_DEFINITIONS'), 'giveaway ownership must come from bounded domain descriptors');
assert.ok(giveawayRoute.includes('GIVEAWAY_PARTICIPANT_ROUTE_DEFINITION'), 'giveaway participant route must be explicit');
assert.ok(giveawayRoute.includes('GIVEAWAY_LIFECYCLE_ROUTE_DEFINITION'), 'giveaway lifecycle route must be explicit');
assert.ok(ownership.includes('callback_route.duplicate_action_owner'), 'duplicate action ownership must hard fail');
assert.ok(ownership.includes('callback_route.unknown_action'), 'unknown extracted action must hard fail');

console.log('PASS STEP590C3 callback router ownership source contract');
