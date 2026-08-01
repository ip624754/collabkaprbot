import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const exists = (rel) => fs.existsSync(new URL(`../${rel}`, import.meta.url));

const bot = read('src/bot/bot.js');
const ownership = read('src/bot/router/callbackOwnership.js');
const contracts = read('src/bot/router/callbackContracts.js');
const actions = read('src/bot/domains/adminAuth/actions.js');
const callbacks = read('src/bot/domains/adminAuth/callbacks.js');
const policy = read('src/bot/domains/adminAuth/policy.js');
const route = read('src/bot/domains/adminAuth/route.js');
const service = read('src/bot/domains/adminAuth/service.js');
const index = read('src/bot/domains/adminAuth/index.js');

for (const rel of [
  'src/bot/domains/adminAuth/actions.js',
  'src/bot/domains/adminAuth/callbacks.js',
  'src/bot/domains/adminAuth/policy.js',
  'src/bot/domains/adminAuth/route.js',
  'src/bot/domains/adminAuth/service.js',
  'src/bot/domains/adminAuth/views.js',
  'src/bot/domains/adminAuth/index.js',
]) {
  assert.ok(exists(rel), `missing bounded admin-auth module: ${rel}`);
}

assert.equal(exists('src/bot/adminWebAuthCallback.js'), false, 'legacy root callback module must be removed');
assert.ok(actions.includes("DECIDE: 'a:aw_auth_dec'"), 'domain owns the exact stable challenge key');
assert.ok(actions.includes("TOGGLE_LOGIN: 'a:admin_web_login_toggle'"), 'domain owns the exact stable control key');
assert.ok(route.includes('ADMIN_AUTH_CHALLENGE_ROUTE_DEFINITION'), 'domain publishes challenge descriptor');
assert.ok(route.includes('ADMIN_AUTH_CONTROL_ROUTE_DEFINITION'), 'domain publishes control descriptor');
assert.ok(route.includes('CALLBACK_PHASE.PRE_USER'), 'challenge descriptor preserves pre-user phase');
assert.ok(route.includes('CALLBACK_PHASE.POST_USER'), 'control descriptor preserves post-user phase');
assert.ok(ownership.includes('ADMIN_AUTH_CALLBACK_ROUTE_DEFINITIONS'), 'global ownership imports domain descriptors');
assert.ok(contracts.includes("ADMIN_WEB_AUTH: 'admin_web_auth'"), 'challenge route ID remains canonical');
assert.ok(contracts.includes("ADMIN_WEB_AUTH_CONTROL: 'admin_web_auth_control'"), 'control route ID is explicit');
assert.ok(callbacks.includes("./service.js"), 'transport delegates through bounded domain service');
assert.ok(service.includes("../../../lib/adminWeb/auth.js"), 'domain service delegates to canonical Redis auth core');
assert.ok(callbacks.includes('actorTgId = Number(ctx?.from?.id || 0)'), 'actual Telegram approver remains authoritative');
assert.ok(callbacks.includes("setControlToggle('admin_web_login', !current"), 'control handler preserves canonical operator-control mutation');
assert.ok(policy.includes('parseAdminAuthDecisionPayload'), 'challenge validation is isolated in policy');
assert.ok(index.includes('handleAdminAuthChallengeCallback'), 'domain facade exports challenge callback');
assert.ok(index.includes('handleAdminAuthControlCallback'), 'domain facade exports control callback');
assert.ok(bot.includes("from './domains/adminAuth/index.js'"), 'bot composition root imports domain facade');
assert.ok(bot.includes('admin_web_auth: (ctx2, p2) => handleAdminAuthChallengeCallback(ctx2, p2)'), 'pre-user router reaches challenge handler');
assert.ok(bot.includes('admin_web_auth_control: (ctx2, p2, u2) => handleAdminAuthControlCallback'), 'post-user router reaches control handler');
assert.equal(bot.includes("if (p.a === 'a:admin_web_login_toggle')"), false, 'legacy inline auth-control branch must be removed');
assert.equal(bot.includes('./adminWebAuthCallback.js'), false, 'bot no longer imports legacy callback module');
assert.equal(callbacks.includes('db/queries'), false, 'domain callback must not depend on DB monolith');
assert.equal(callbacks.includes("from 'grammy'"), false, 'domain callback must stay framework-independent');

console.log('PASS STEP590C1 admin/auth bounded-domain source contract');
