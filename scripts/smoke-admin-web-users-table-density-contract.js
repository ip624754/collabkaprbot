import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readAdminWebSource } from './lib/admin-web-source-reader.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = readAdminWebSource();
for (const token of [
  'STEP529: плотность строк таблицы',
  'aw-users-table-density',
  'aw-user-secondary',
  'aw-row-actions-compact',
  'aw-cell-stack-dense',
]) {
  assert.ok(webJs.includes(token), `admin-web users density polish must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-users-table-density',
  '.aw-user-secondary',
  '.aw-row-actions-compact',
  '.aw-cell-stack-dense',
  '.aw-stat-chip-dense',
]) {
  assert.ok(css.includes(token), `users density CSS must include ${token}`);
}

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP529'), 'current state must mention STEP529');

console.log('✅ smoke admin-web users table density polish contract OK');
