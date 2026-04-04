import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const html = read('admin.html');
const css = read('styles/admin-web.css');
const js = read('scripts/admin-web.js');

assert.ok(html.includes('step543a'), 'admin shell asset URLs must be cache-busted to step543a');

for (const token of [
  'aw-mobile-nav-toggle',
  'aw-sidebar-backdrop',
  'ADMIN_MOBILE_NAV_MEDIA',
  'getAdminUiState()',
  'setAdminMobileNavOpen(',
  'closeAdminMobileNav()',
  'data-mobile-nav-toggle',
  'data-mobile-nav-close',
  'is-nav-open',
]) {
  assert.ok(js.includes(token), `mobile admin shell JS must include ${token}`);
}

for (const token of [
  '.aw-mobile-nav-toggle',
  '.aw-sidebar-backdrop',
  'body.is-admin-nav-open',
  '.aw-shell.is-nav-open .aw-sidebar',
  '@media (max-width: 720px)',
  '@media (max-width: 420px)',
]) {
  assert.ok(css.includes(token), `mobile admin shell CSS must include ${token}`);
}

console.log('✅ smoke admin-web mobile shell contract OK');
