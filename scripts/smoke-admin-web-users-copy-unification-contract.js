import { readQueryImplementationSource } from './lib/query-source-reader.js';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readAdminWebSource } from './lib/admin-web-source-reader.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const queries = readQueryImplementationSource();
for (const token of [
  'hasUsersBannedAtColumn',
  'usersDirectoryBannedAtSelectSql',
  'buildUsersDirectoryProblemScoreSql',
]) {
  assert.ok(queries.includes(token), `users directory schema-guard must include ${token}`);
}

const webJs = readAdminWebSource();
for (const token of [
  'Сохранённые операторские пресеты',
  'Сравнение и закрепление',
  'Готовые действия по срезу',
  'Спящие плательщики',
  'Платили без канала',
  'План без канала',
  'Живые бренды',
  'Тихие креаторы',
  'Свой срез',
  'CSV текущего среза',
]) {
  assert.ok(webJs.includes(token), `users copy unification must include ${token}`);
}

const currentState = read('docs/00_CURRENT_STATE.md');
assert.ok(currentState.includes('STEP532'), 'current state must mention STEP532');

console.log('✅ smoke admin-web users copy unification + schema guard contract OK');
