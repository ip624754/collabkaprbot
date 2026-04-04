import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

assert.ok(exists('src/lib/operatorControls.js'), 'src/lib/operatorControls.js must exist');

const controls = read('src/lib/operatorControls.js');
for (const token of [
  'admin_web_login_enabled',
  'getOperatorControlSnapshot',
  'setOperatorControlToggle',
  'appendOperatorControlAudit',
  'payments_fallback',
]) {
  assert.ok(controls.includes(token), `operatorControls.js must include ${token}`);
}

const readApi = read('api/admin-web-read.js');
assert.ok(readApi.includes("section === 'control_surface'"), 'admin-web read API must expose section=control_surface');

const runtime = read('src/lib/adminWeb/runtime.js');
assert.ok(runtime.includes('out.controlSurface = await getOperatorControlSnapshot'), 'runtime summary must embed controlSurface');

const auth = read('src/lib/adminWeb/auth.js');
assert.ok(auth.includes("admin_web_login_paused"), 'admin web auth must expose admin_web_login_paused');
assert.ok(auth.includes('isAdminWebLoginEnabled'), 'admin web auth must guard start by operator control');

const webJs = read('scripts/admin-web.js');
for (const token of [
  '/api/admin-web-read?section=control_surface',
  'renderControlStatusBar()',
  'Командный обзор владельца',
  'Последние переключения',
  'Семантика безопасности',
]) {
  assert.ok(webJs.includes(token), `admin web JS must include ${token}`);
}

const bot = read('src/bot/bot.js');
for (const token of [
  'a:admin_web_login_toggle',
  '⚙️ Админка → Control Surface',
  'Web-admin login:',
  'setOperatorControlToggle(',
  'appendOperatorControlAudit(',
  'getOperatorControlSnapshot(',
]) {
  assert.ok(bot.includes(token), `bot.js must include ${token}`);
}

const registry = read('src/bot/actionRegistry.js');
assert.ok(registry.includes('"a:admin_web_login_toggle"'), 'action registry must include a:admin_web_login_toggle');

console.log('✅ smoke admin control surface contract OK');
