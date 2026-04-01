import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

function assertExists(rel) {
  assert.ok(exists(rel), `${rel} must exist`);
}

assertExists('admin.html');
assertExists('styles/admin-web.css');
assertExists('scripts/admin-web.js');
assertExists('api/admin-web-auth.js');
assertExists('api/admin-web-read.js');
assertExists('api/admin-web-write.js');
assertExists('src/lib/adminWeb/auth.js');
assertExists('src/lib/adminWeb/readModels.js');
assertExists('src/lib/adminWeb/notes.js');
assertExists('src/lib/adminWeb/runtime.js');
assertExists('src/lib/adminWeb/telegram.js');

const vercel = read('vercel.json');
assert.ok(vercel.includes('"source": "/admin"') && vercel.includes('admin.html'), 'vercel.json must rewrite /admin to admin.html');
assert.ok(vercel.includes('"source": "/admin/(.*)"'), 'vercel.json must rewrite /admin/* to admin.html');

const cfg = read('src/lib/config.js');
for (const token of [
  'ADMIN_WEB_ENABLED',
  'ADMIN_WEB_SECRET',
  'ADMIN_WEB_SESSION_SECRET',
  'ADMIN_WEB_APPROVER_TG_IDS',
  'ADMIN_WEB_LOGIN_TTL_SEC',
  'ADMIN_WEB_SESSION_TTL_SEC',
]) {
  assert.ok(cfg.includes(token), `config.js must include ${token}`);
}

const html = read('admin.html');
assert.ok(html.includes('/styles/admin-web.css'), 'admin shell must reference admin css');
assert.ok(html.includes('/scripts/admin-web.js'), 'admin shell must reference admin js');

const js = read('scripts/admin-web.js');
for (const token of ['/api/admin-web-read?section=overview', '/api/admin-web-read?section=users', '/api/admin-web-read?section=user', '/api/admin-web-read?section=runtime']) {
  assert.ok(js.includes(token), `admin web JS must call ${token}`);
}
assert.ok(js.includes('No polling') || js.includes('no polling') || js.includes('manual'), 'admin web JS should present manual-refresh / no-polling operator UX');

console.log('✅ smoke admin-web-shell contract OK');

assert.ok(!exists('api/admin-web/overview.js'), 'legacy split admin-web routes must be removed from api/');
assert.ok(!exists('api/admin-web/auth/start.js'), 'legacy split auth routes must be removed from api/');
