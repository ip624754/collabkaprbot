import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = read('scripts/admin-web.js');
for (const token of [
  'id="applyUsersFilterDraft"',
  'id="resetUsersFilterDraft"',
  'data-users-filter-control',
  'usersFilterDraftStatus',
  'usersHasPendingFilterDraft',
  'readUsersFilterDraftFromDom',
  'Пока изменения не подтверждены, список, CSV и bulk copy остаются на предыдущем рабочем срезе.',
]) {
  assert.ok(webJs.includes(token), `admin-web STEP535N must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-filter-rail.is-dirty',
  '.aw-filter-rail-actions',
  '.aw-filter-draft-pill.is-dirty',
  '.aw-pagination-actions .aw-button:disabled',
]) {
  assert.ok(css.includes(token), `admin-web STEP535N CSS must include ${token}`);
}

const html = read('admin.html');
assert.ok(html.includes('step535n'), 'admin shell asset URLs must be cache-busted to step535n');

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP535N'), 'current state must mention STEP535N');

console.log('✅ smoke admin-web users filter apply contract + disabled-state finish OK');
