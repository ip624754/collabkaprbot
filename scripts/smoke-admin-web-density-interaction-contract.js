import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-side-stat-grid',
  '.aw-action-card-state',
  '.aw-priority-pill--sort.is-active',
  '.aw-priority-pill--cohort.is-active',
  '.aw-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-start; }',
  '.aw-button.is-confirmed',
  '.aw-surface.is-compact-empty',
]) {
  assert.ok(css.includes(token), `density/interaction CSS must include ${token}`);
}
assert.ok(css.includes('content: "";'), 'preset active overlay must keep a valid pseudo-element content rule');

const js = read('scripts/admin-web.js');
for (const token of [
  'function attachInteractiveFeedback(root = document)',
  'function renderUsersSliceActionCards(state = {}, cohortTopline = {})',
  'aria-pressed="${currentCohortView === item.id ? \'true\' : \'false\'}"',
  'aw-priority-pill aw-priority-pill--sort',
  'aw-priority-pill aw-priority-pill--cohort',
  "const followUpAllZero = ['noAction', 'watch', 'review', 'urgent'].every",
  'aw-side-stat-grid ${followUpAllZero ? \'is-all-zero\' : \'\'}',
]) {
  assert.ok(js.includes(token), `density/interaction UI must include ${token}`);
}

const html = read('admin.html');
assert.ok(html.includes('step535l'), 'admin shell asset URLs must be cache-busted to step535l');

console.log('✅ smoke admin-web density/interaction contract OK');
