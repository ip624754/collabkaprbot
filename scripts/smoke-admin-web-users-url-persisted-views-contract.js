import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = read('scripts/admin-web.js');
for (const token of [
  'Users URL-persisted working views',
  'readUsersStateFromUrl',
  'buildUsersListHref',
  'syncUsersUrlState',
  'data-users-copy-view-url',
  'userDetailBackHref',
]) {
  assert.ok(webJs.includes(token), `admin-web users URL-persisted views must include ${token}`);
}

const css = read('styles/admin-web.css');
assert.ok(css.includes('.aw-users-url-meta'), 'admin-web users URL-persisted views CSS must include .aw-users-url-meta');

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP524'), 'current state must mention STEP524');

console.log('✅ smoke admin-web users URL-persisted working views contract OK');
