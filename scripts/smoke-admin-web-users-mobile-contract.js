import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const html = read('admin.html');
assert.ok(html.includes('step590h'), 'admin shell asset URLs must be cache-busted to step590h');

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-toolbar-users .aw-toolbar-main',
  '.aw-filter-rail-actions',
  '.aw-priority-pills',
  '.aw-users-sticky-state .aw-basket-pill',
  '.aw-users-table {',
  'min-width: 940px;',
  'min-width: 840px;',
  'grid-template-columns: repeat(2, minmax(0, 1fr));',
]) {
  assert.ok(css.includes(token), `users mobile working-slice CSS must include ${token}`);
}

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP543B') || currentState.includes('STEP543b'), 'current state must mention STEP543B');

console.log('✅ smoke admin-web users mobile working-slice contract OK');
