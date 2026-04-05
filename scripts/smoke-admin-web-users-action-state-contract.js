import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = read('scripts/admin-web.js');
for (const token of [
  'aw-preset-card--custom',
  'Авто при ручных изменениях',
  'data-indeterminate',
  'toggleVisibleUsers.indeterminate',
  "id=\"copyUsersBulkBtn\" ${canRunBulkCopy ? '' : 'disabled'}",
  "id=\"selectVisibleUsersBtn\" ${canSelectVisibleUsers ? '' : 'disabled'}",
  "id=\"clearUsersBasketBtn\" ${canClearUsersBasket ? '' : 'disabled'}",
]) {
  assert.ok(webJs.includes(token), `admin-web STEP535L must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-button:disabled',
  '.aw-preset-card--custom:not(.is-active)',
  '.aw-row-check:indeterminate, #toggleVisibleUsers:indeterminate',
  '.aw-row-check:disabled, #toggleVisibleUsers:disabled',
]) {
  assert.ok(css.includes(token), `admin-web STEP535L CSS must include ${token}`);
}

const html = read('admin.html');
assert.ok(html.includes('step545'), 'admin shell asset URLs must be cache-busted to step545');

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP535L'), 'current state must mention STEP535L');

console.log('✅ smoke admin-web users action-state truth + empty-state controls contract OK');
