import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readAdminWebSource } from './lib/admin-web-source-reader.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const js = readAdminWebSource();
for (const token of [
  'Профиль',
  'Доступ и сигналы',
  'Активность',
  'Заметка оператора',
  'Последние admin-действия',
  'buildUsersListHref',
  'userDetailBackHref',
  '/api/admin-web-read?section=user',
  'set_note',
  '/api/admin-web-write?action=clear_note',
]) {
  assert.ok(js.includes(token), `admin web user card must include ${token}`);
}

const readModels = read('src/lib/adminWeb/readModels.js');
for (const token of [
  'account:',
  'access:',
  'activity:',
  'recentSummary:',
  'lightCounters:',
  'recentAdminAudit',
  'buildActivitySummary',
  'buildAccessSignals',
]) {
  assert.ok(readModels.includes(token), `user detail read model must include ${token}`);
}

const write = read('api/admin-web-write.js');
assert.ok(write.includes('set_user_note'), 'admin-web-write must audit set_user_note');
assert.ok(write.includes('clear_user_note'), 'admin-web-write must audit clear_user_note');
assert.ok(write.includes('oldJson'), 'admin-web-write must persist oldJson in note audit');
assert.ok(write.includes('newJson'), 'admin-web-write must persist newJson in note audit');

console.log('✅ smoke admin-web user-card contract OK');
