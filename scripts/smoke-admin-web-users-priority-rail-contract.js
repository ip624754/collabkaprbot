import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const queries = read('src/db/queries.js');
for (const token of [
  'USERS_DIRECTORY_SORTS',
  'buildUsersDirectoryOrderSql',
  'payments_count',
  'problem_score',
  'sortBy',
]) {
  assert.ok(queries.includes(token), `queries must include ${token}`);
}

const apiRead = read('api/admin-web-read.js');
assert.ok(apiRead.includes('sort_by'), 'admin-web read API must include sort_by for users surfaces');

const webJs = read('scripts/admin-web.js');
for (const token of [
  'Сортировка и приоритет',
  'usersSortBy',
  'data-users-priority',
  'problem = блок / платили без канала / план без канала / залежавшиеся кредиты',
  'Платящие',
  'Проблемные',
]) {
  assert.ok(webJs.includes(token), `admin-web users priority rail UI must include ${token}`);
}

const css = read('styles/admin-web.css');
for (const token of [
  '.aw-priority-rail',
  '.aw-priority-pills',
  '.aw-priority-pill',
]) {
  assert.ok(css.includes(token), `admin-web users priority rail CSS must include ${token}`);
}

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP517'), 'current state must mention STEP517');

console.log('✅ smoke admin-web users priority rail contract OK');
