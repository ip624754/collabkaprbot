import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const js = read('scripts/admin-web.js');
const authApi = read('api/admin-web-auth.js');
const auth = read('src/lib/adminWeb/auth.js');
const telegram = read('src/lib/adminWeb/telegram.js');
const bot = read('src/bot/bot.js');
const callbackRoute = read('src/bot/adminWebAuthCallback.js');
const callbackOwnership = read('src/bot/router/callbackOwnership.js');

for (const token of [
  'LOGIN_STATE_KEY',
  'readPersistedLoginState()',
  'writeLoginState(',
  'startLoginStatusPolling({ immediate: true })',
  'checkLoginChallengeStatus({ silent: true })',
  "params.set('challenge', next.challengeId)",
  'Challenge работает только в этом браузере',
  'Шаг 2 — Telegram approve',
  'exchangeLoginChallenge(',
  "action=exchange",
  'ensureSession()',
  'resetChallengeBtn',
  'newChallengeBtn',
]) {
  assert.ok(js.includes(token), `scripts/admin-web.js must include ${token}`);
}

for (const token of [
  "action === 'decision'",
  'Ссылка подтверждения отключена',
  "action === 'exchange'",
  'consumeAdminAuthRateLimit',
  'getChallengeStatusForBrowser',
  'issueSession(req, res, challengeId)',
]) {
  assert.ok(authApi.includes(token), `api/admin-web-auth.js must include ${token}`);
}

for (const token of [
  'LOGIN_VERIFIER_COOKIE_NAME',
  'browserVerifierHash',
  "status = 'consumed'",
  "approvedBy = 'telegram_callback'",
  'codeAttempts',
  'codeLockedAt',
  'ADMIN_WEB_IDLE_TIMEOUT_SEC',
]) {
  assert.ok(auth.includes(token), `auth.js must include ${token}`);
}

assert.ok(telegram.includes('callback_data: approveCallback'), 'Telegram approval must use callback_data');
assert.ok(telegram.includes('callback_data: denyCallback'), 'Telegram denial must use callback_data');
assert.equal(telegram.includes('url: approveUrl'), false, 'Telegram approval must not use transferable web URL');
assert.ok(bot.includes("import { handleAdminWebAuthDecisionCallback } from './adminWebAuthCallback.js'"), 'Telegram callback router must import the admin auth route');
assert.ok(bot.includes('dispatchPreUserCallback(ctx, p'), 'Telegram callback router must execute the pre-user ownership phase');
assert.ok(bot.includes('admin_web_auth: (ctx2, p2) => handleAdminWebAuthDecisionCallback(ctx2, p2)'), 'Telegram callback router must wire the admin auth owner');
assert.equal(bot.includes('if (await handleAdminWebAuthDecisionCallback(ctx, p)) return;'), false, 'direct callback bypass must be removed');
assert.ok(callbackOwnership.includes("actions: Object.freeze(['a:aw_auth_dec'])"), 'ownership registry must assign the admin auth action');
assert.ok(callbackRoute.includes("String(p?.a || '') === 'a:aw_auth_dec'"), 'admin auth callback module must own the action match');

console.log('✅ smoke admin-web login contract OK');
