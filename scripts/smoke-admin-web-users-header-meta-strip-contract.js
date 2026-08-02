import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readAdminWebSource } from './lib/admin-web-source-reader.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const webJs = readAdminWebSource();
for (const token of [
  'Раздел Users · STEP529: плотность строк таблицы · STEP530: приоритет колонок',
  'renderUsersTableMetaStrip',
  'renderUsersTableHead',
  'aw-users-table-meta-strip',
  'aw-users-table-head',
]) {
  assert.ok(webJs.includes(token), `admin-web users header/meta strip must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-users-table-meta-strip',
  '.aw-users-table-meta-main',
  '.aw-users-table-meta-chips',
  '.aw-users-table-head',
]) {
  assert.ok(css.includes(token), `users header/meta strip CSS must include ${token}`);
}

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP531'), 'current state must mention STEP531');

console.log('✅ smoke admin-web users header / meta strip polish contract OK');
