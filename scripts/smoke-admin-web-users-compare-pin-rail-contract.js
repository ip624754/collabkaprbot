import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = read('scripts/admin-web.js');
for (const token of [
  'Сравнение и закрепление',
  'normalizeUsersPinIds',
  'toggleUsersPin',
  'renderUsersCompareCards',
  'clearUsersPinsBtn',
  'data-user-quick="toggle_pin"',
]) {
  assert.ok(webJs.includes(token), `admin-web users compare/pin rail must include ${token}`);
}

const readModels = read('src/lib/adminWeb/readModels.js');
for (const token of [
  'getPinnedUsersCompareCards',
  'compareRail',
  'maxPins: 5',
]) {
  assert.ok(readModels.includes(token), `readModels compare rail must include ${token}`);
}

const css = read('styles/admin-web.css');
assert.ok(css.includes('.aw-compare-rail'), 'compare/pin rail CSS must include .aw-compare-rail');

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP525'), 'current state must mention STEP525');

console.log('✅ smoke admin-web users compare / pin rail contract OK');
