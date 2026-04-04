import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = read('scripts/admin-web.js');
for (const token of [
  'STEP530: приоритет колонок',
  'aw-users-table-priority',
  'usersSignalsPriorityChips',
  'usersSegmentBadges',
  'aw-activity-inline',
]) {
  assert.ok(webJs.includes(token), `admin-web users column priority polish must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-users-table-priority',
  '.aw-cell-meta-inline',
  '.aw-activity-inline',
  '.aw-users-table-priority .aw-stat-chip.is-overflow',
]) {
  assert.ok(css.includes(token), `users column priority CSS must include ${token}`);
}

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP530'), 'current state must mention STEP530');

console.log('✅ smoke admin-web users column priority compression contract OK');
