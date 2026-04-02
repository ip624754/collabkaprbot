import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = read('scripts/admin-web.js');
for (const token of [
  'Users action-ready follow-up rail',
  'data-users-followup',
  'open_top_problem_users',
  'open_dormant_payers',
  'runUsersExportAction',
  'runUsersBulkCopyAction',
]) {
  assert.ok(webJs.includes(token), `admin-web users follow-up rail UI must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-action-ready-rail',
  '.aw-action-grid',
  '.aw-action-card',
]) {
  assert.ok(css.includes(token), `admin-web users follow-up rail CSS must include ${token}`);
}

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP520'), 'current state must mention STEP520');

console.log('✅ smoke admin-web users follow-up rail contract OK');
