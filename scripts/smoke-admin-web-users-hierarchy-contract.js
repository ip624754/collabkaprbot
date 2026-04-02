import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = read('scripts/admin-web.js');
for (const token of [
  'usersPlanMeta',
  'usersCreditsMeta',
  'usersSignalChips',
  'usersActivityMeta',
  'Last activity',
  'aw-users-table',
  'aw-stat-chip',
  'Плотный ops/audit список',
]) {
  assert.ok(webJs.includes(token), `admin-web users hierarchy polish must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-users-table',
  '.aw-user-cell',
  '.aw-user-primary',
  '.aw-inline-chips',
  '.aw-stat-chip',
]) {
  assert.ok(css.includes(token), `admin-web users hierarchy polish CSS must include ${token}`);
}

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP516'), 'current state must mention STEP516');

console.log('✅ smoke admin-web users hierarchy polish contract OK');
