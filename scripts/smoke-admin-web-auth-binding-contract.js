import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const auth = read('src/lib/adminWeb/auth.js');
const policy = read('src/lib/adminWeb/authPolicy.js');
const api = read('api/admin-web-auth.js');
const telegram = read('src/lib/adminWeb/telegram.js');
const bot = read('src/bot/bot.js');
const callbackRoute = read('src/bot/adminWebAuthCallback.js');
const callbackFacade = read('src/bot/routes/callbacks.js');
const callbackOwnership = read('src/bot/router/callbackOwnership.js');
const common = read('src/lib/adminWeb/common.js');
const config = read('src/lib/config.js');
const registry = read('src/bot/actionRegistry.js');
const web = read('scripts/admin-web.js');
const controls = read('src/lib/operatorControls.js');

for (const token of [
  'LOGIN_VERIFIER_COOKIE_NAME',
  'browserVerifierHash',
  'browserVerifierHash: browserVerifierHash(challengeId, verifier)',
  'approveChallengeFromTelegram',
  "approvedBy = 'telegram_callback'",
  "record.status = 'consumed'",
  'sessionKeyPrefix()',
  'codeAttempts',
  'codeLockedAt',
  'fallbackActorTgId',
  'record.codeMaxAttempts or ARGV[4]',
  'consumeAdminAuthRateLimit',
  'isAdminSessionIdleExpired',
  'ADMIN_WEB_AUTH_VERSION = 2',
  'authVersion = tonumber(ARGV[7])',
  'Number(session.authVersion || 0) !== ADMIN_WEB_AUTH_VERSION',
]) {
  assert.ok(auth.includes(token), `auth.js must include ${token}`);
}

assert.ok(auth.match(/evalJson\(/g)?.length >= 5, 'critical auth transitions must use Redis Lua through the fail-closed wrapper');
assert.ok(auth.includes('getAdminWebLoginGateState'), 'login gate must expose storage failure instead of defaulting open');
assert.ok(controls.includes("return { ok: false, enabled: false, error: 'auth_store_unavailable' }"), 'operator login gate must fail closed on Redis read failure');
assert.equal(auth.includes('export async function updateChallenge'), false, 'non-atomic GET -> SET challenge updater must be removed');
assert.equal(auth.includes('buildDecisionUrl'), false, 'transferable signed decision URL must be removed');
assert.equal(auth.includes('sessionId) {\n  const ch = await getChallenge'), false, 'session issuance must not use non-atomic challenge read');

assert.ok(api.includes("action === 'decision'"), 'legacy decision route must be explicit');
assert.ok(api.includes('return html(res, 410'), 'legacy GET decision route must be non-mutating and gone');
assert.ok(api.includes("action === 'exchange'"), 'session exchange must be a separate POST action');
assert.ok(api.includes("req.method !== 'POST'"), 'state-changing auth actions must require POST');
assert.ok(api.includes("if (!result?.ok) {\n    json(res, 503"), 'rate-limit storage failure must stop auth fail-closed');
const statusBlock = api.slice(api.indexOf("if (action === 'status')"), api.indexOf("if (action === 'exchange')"));
assert.equal(statusBlock.includes('issueSession'), false, 'status GET must be read-only');

assert.ok(telegram.includes('callback_data: approveCallback'), 'approval must use Telegram callback_data');
assert.ok(telegram.includes('callback_data: denyCallback'), 'denial must use Telegram callback_data');
assert.equal(telegram.includes('url: approveUrl'), false, 'approval must not use web URL');
assert.ok(telegram.includes('Number(id) === Number(fallbackActorTgId || 0)'), 'fallback code must be disclosed only to the explicit fallback actor');
assert.ok(bot.includes("import { handleAdminWebAuthDecisionCallback } from './adminWebAuthCallback.js'"), 'bot must import the executable auth callback route');
assert.ok(bot.includes('dispatchPreUserCallback(ctx, p'), 'canonical callback router must invoke pre-user ownership before legacy dispatch');
assert.ok(bot.includes('admin_web_auth: (ctx2, p2) => handleAdminWebAuthDecisionCallback(ctx2, p2)'), 'bot must wire the exact admin auth owner to the domain handler');
assert.equal(bot.includes('if (await handleAdminWebAuthDecisionCallback(ctx, p)) return;'), false, 'direct callback bypass must be removed');
assert.ok(callbackRoute.includes("String(p?.a || '') === 'a:aw_auth_dec'"), 'auth callback module must own the action match');
assert.ok(callbackRoute.includes('actorTgId = Number(ctx?.from?.id || 0)'), 'actual Telegram callback actor must be authoritative');
assert.ok(callbackFacade.includes('CALLBACK_PHASE.PRE_USER'), 'callback facade must expose the pre-user phase');
assert.ok(callbackOwnership.includes("actions: Object.freeze(['a:aw_auth_dec'])"), 'ownership registry must assign the exact admin auth action');
assert.ok(callbackOwnership.includes('phase: CALLBACK_PHASE.PRE_USER'), 'admin auth ownership must be pre-user');
const callbackRouterStart = bot.indexOf('// --- Callback router ---');
const authRouteCall = bot.indexOf('dispatchPreUserCallback(ctx, p', callbackRouterStart);
const callbackUserHydration = bot.indexOf('const u = await db.upsertUser(ctx.from.id', callbackRouterStart);
assert.ok(callbackRouterStart >= 0 && authRouteCall > callbackRouterStart && callbackUserHydration > authRouteCall, 'auth callback must route before callback application-user hydration');
assert.ok(registry.includes('"a:aw_auth_dec"'), 'auth callback must be in action registry');

assert.ok(common.includes('crypto.randomInt(0, 1_000_000)'), 'fallback code must use cryptographic RNG');
assert.ok(config.includes('ADMIN_WEB_FALLBACK_CODE_ENABLED: parseBoolSafe(process.env.ADMIN_WEB_FALLBACK_CODE_ENABLED, false)'), 'fallback code must default OFF');
assert.ok(config.includes('ADMIN_WEB_FALLBACK_ACTOR_TG_ID'), 'fallback actor must be explicit');
assert.ok(config.includes('ADMIN_WEB_CODE_MAX_ATTEMPTS'), 'attempt cap must be configurable and bounded');
assert.ok(config.includes('ADMIN_WEB_START_RATE_LIMIT'), 'start throttle must be configured');
assert.ok(config.includes('ADMIN_WEB_CODE_RATE_LIMIT'), 'code throttle must be configured');

assert.ok(web.includes("action=exchange"), 'browser must exchange approved challenge through POST');
assert.ok(web.includes('Challenge работает только в этом браузере'), 'login UX must state browser binding');
assert.ok(web.includes('fallbackCodeEnabled'), 'fallback code UI must be conditional');
assert.ok(policy.includes('replay cannot mint') === false, 'policy module must stay runtime-focused, not test prose');

console.log('✅ smoke admin web auth binding contract PASS');
