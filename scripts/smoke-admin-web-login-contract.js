import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const js = read('scripts/admin-web.js');
const authApi = read('api/admin-web-auth.js');

for (const token of [
  'LOGIN_STATE_KEY',
  'readPersistedLoginState()',
  'writeLoginState(',
  'startLoginStatusPolling()',
  'checkLoginChallengeStatus({ silent: true })',
  "params.set('challenge', next.challengeId)",
  'Challenge уже создан. Оставь это окно открытым',
  'resetChallengeBtn',
  'newChallengeBtn',
]) {
  assert.ok(js.includes(token), `scripts/admin-web.js must include ${token}`);
}

for (const token of [
  'reusedApprovedChallenge',
  'Вернуться в веб-админку',
  'Веб-админка может автоматически подтянуть этот статус',
]) {
  assert.ok(authApi.includes(token), `api/admin-web-auth.js must include ${token}`);
}

console.log('✅ smoke admin-web login contract OK');
