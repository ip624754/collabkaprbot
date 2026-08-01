import assert from 'node:assert/strict';
import fs from 'node:fs';

const bot = fs.readFileSync(new URL('../src/bot/bot.js', import.meta.url), 'utf8');
const actions = fs.readFileSync(new URL('../src/bot/domains/giveaways/actions.js', import.meta.url), 'utf8');
const callbacks = fs.readFileSync(new URL('../src/bot/domains/giveaways/callbacks.js', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../src/bot/domains/giveaways/route.js', import.meta.url), 'utf8');
const ownership = fs.readFileSync(new URL('../src/bot/router/callbackOwnership.js', import.meta.url), 'utf8');
const contracts = fs.readFileSync(new URL('../src/bot/router/callbackContracts.js', import.meta.url), 'utf8');

const criticalActions = [
  'a:gw_access',
  'a:gw_access_recheck',
  'a:gw_access_checkme',
  'a:gw_access_user_prompt',
  'a:gw_join',
  'a:gw_check',
  'a:gw_end_now',
  'a:gw_end_do',
  'a:gw_wv',
  'a:gw_draw_now',
  'a:gw_draw_do',
];
for (const action of criticalActions) {
  assert.ok(actions.includes(`'${action}'`), `${action} must be declared in giveaway domain`);
}
for (const action of ['a:gw_join', 'a:gw_check', 'a:gw_end_now', 'a:gw_end_do', 'a:gw_wv', 'a:gw_draw_now', 'a:gw_draw_do']) {
  assert.ok(!bot.includes(`if (p.a === '${action}') {`), `${action} must be removed from legacy bot dispatcher`);
}

assert.ok(callbacks.includes('export async function handleGiveawayAccessCallback'), 'access handler must be canonical');
assert.ok(callbacks.includes('export async function handleGiveawayParticipantCallback'), 'participant handler must be canonical');
assert.ok(callbacks.includes('export async function handleGiveawayLifecycleCallback'), 'lifecycle handler must be canonical');
assert.ok(callbacks.includes('db.drawAndFinalizeGiveawayWinnersAtomic(gwId, {'), 'manual draw must call atomic DB boundary');
assert.ok(callbacks.includes("source: 'manual'"), 'manual draw source must remain explicit');
assert.ok(!callbacks.includes('db.setWinners('), 'domain must not introduce split winner writes');
assert.ok(!callbacks.includes('makeXorShift32'), 'domain must not reintroduce JS draw algorithm');
assert.ok(callbacks.includes("const lockKey = key(['lock', 'gw_draw', gwId]);"), 'Redis draw lock remains UX/load guard');
assert.ok(callbacks.includes('await releaseLock(lockKey, lock?.token)'), 'all acquired draw locks are released');
assert.ok(callbacks.includes('await db.atomicEndGiveaway(gwId)'), 'manual end remains atomic');
assert.ok(callbacks.includes('await doEligibilityCheck(ctx, gwId, telegramUserId)'), 'eligibility uses actual Telegram actor');

assert.ok(route.includes('GIVEAWAY_ACCESS_ROUTE_DEFINITION'), 'access route descriptor exists');
assert.ok(route.includes('GIVEAWAY_PARTICIPANT_ROUTE_DEFINITION'), 'participant route descriptor exists');
assert.ok(route.includes('GIVEAWAY_LIFECYCLE_ROUTE_DEFINITION'), 'lifecycle route descriptor exists');
assert.ok(contracts.includes("GIVEAWAY_PARTICIPANT: 'giveaway_participant'"), 'participant route contract exists');
assert.ok(contracts.includes("GIVEAWAY_LIFECYCLE: 'giveaway_lifecycle'"), 'lifecycle route contract exists');
assert.ok(ownership.includes('GIVEAWAY_CALLBACK_ROUTE_DEFINITIONS'), 'ownership consumes bounded-domain route descriptors');

assert.ok(bot.includes('handleGiveawayAccessCallback,'), 'bot imports access handler from bounded domain');
assert.ok(bot.includes('handleGiveawayParticipantCallback,'), 'bot imports participant handler from bounded domain');
assert.ok(bot.includes('handleGiveawayLifecycleCallback,'), 'bot imports lifecycle handler from bounded domain');
assert.ok(bot.includes('giveaway_access: (ctx2, p2, u2) => handleGiveawayAccessCallback('), 'access owner wired');
assert.ok(bot.includes('giveaway_participant: (ctx2, p2, u2) => handleGiveawayParticipantCallback('), 'participant owner wired');
assert.ok(bot.includes('giveaway_lifecycle: (ctx2, p2, u2) => handleGiveawayLifecycleCallback('), 'lifecycle owner wired');
assert.ok(bot.includes('const giveawayDomainDeps = {'), 'domain dependencies are explicit');
assert.ok(!bot.includes("import { handleGwAccessRoute } from './routes/gwAccess.js';"), 'bot no longer imports legacy access route');

console.log('PASS STEP590C3 giveaway bounded-domain source contract');
