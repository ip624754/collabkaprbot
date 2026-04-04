import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = read('scripts/admin-web.js');
for (const token of [
  'setUsersStateExact({',
  'data-users-preset',
  'Сейчас активен: <strong>${escapeHtml(activePresetMeta.label)}</strong>',
  'Применён пресет: ${preset.label}.',
]) {
  assert.ok(webJs.includes(token), `admin-web STEP535M must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  'pointer-events: none;',
  '.aw-pagination-actions .aw-button:disabled',
  '.aw-row-check:disabled, #toggleVisibleUsers:disabled',
]) {
  assert.ok(css.includes(token), `admin-web STEP535M CSS must include ${token}`);
}

const html = read('admin.html');
assert.ok(html.includes('step543b'), 'admin shell asset URLs must be cache-busted to step543b');

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP535M'), 'current state must mention STEP535M');

console.log('✅ smoke admin-web users preset truth + disabled-state contrast contract OK');
