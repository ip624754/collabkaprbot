import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = read('scripts/admin-web.js');
for (const token of [
  'buildUsersPaginationMeta',
  'renderUsersPaginationControls',
  'data-users-page-action',
  'data-users-page-size',
  'aw-users-sticky-controls',
  'aw-users-table-wrap',
]) {
  assert.ok(webJs.includes(token), `admin-web users sticky/pagination UI must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-users-sticky-controls',
  '.aw-users-pagination',
  '.aw-users-table-wrap',
  '.aw-users-table thead th',
]) {
  assert.ok(css.includes(token), `admin-web users sticky/pagination CSS must include ${token}`);
}

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP522'), 'current state must mention STEP522');

console.log('✅ smoke admin-web users sticky controls / pagination contract OK');
