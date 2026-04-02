import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = read('scripts/admin-web.js');
for (const token of [
  'Level 1 · рабочий срез',
  'Level 2 · operator helpers',
  'aw-users-rail-group-primary',
  'aw-users-primary-grid',
  'renderUsersOperatorPresetPills',
  'aw-action-grid aw-action-grid-compact',
]) {
  assert.ok(webJs.includes(token), `admin-web users rails hierarchy compression must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-users-rail-group',
  '.aw-users-primary-grid',
  '.aw-preset-pill',
  '.aw-filter-grid-compact',
  '.aw-action-grid-compact',
]) {
  assert.ok(css.includes(token), `users rails hierarchy compression CSS must include ${token}`);
}

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP528'), 'current state must mention STEP528');

console.log('✅ smoke admin-web users rails hierarchy compression contract OK');
