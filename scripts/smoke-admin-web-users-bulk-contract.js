import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

assert.ok(exists('src/lib/adminWeb/usersBulk.js'), 'users bulk helper must exist');

const helper = read('src/lib/adminWeb/usersBulk.js');
for (const token of [
  'buildUsersBulkPayload',
  'getUsersBulkOptions',
  'selection_basket',
  'usernames',
  'tg_ids',
]) {
  assert.ok(helper.includes(token), `usersBulk helper must include ${token}`);
}

const apiRead = read('api/admin-web-read.js');
for (const token of [
  "section === 'users_bulk'",
  "action: 'copy_users_bulk'",
  "targetType: 'users_bulk'",
  'buildUsersBulkPayload(',
]) {
  assert.ok(apiRead.includes(token), `admin-web read API must include ${token}`);
}

const webJs = read('scripts/admin-web.js');
for (const token of [
  'Bulk utility rail',
  'copyUsersBulkBtn',
  'clearUsersBasketBtn',
  'data-user-check',
  'Копирований bulk utility пока не было.',
]) {
  assert.ok(webJs.includes(token), `admin-web users bulk UI must include ${token}`);
}

const models = read('src/lib/adminWeb/readModels.js');
for (const token of [
  'bulkOptions: getUsersBulkOptions()',
  "action || '') === 'copy_users_bulk'",
  'bulkMeta:',
]) {
  assert.ok(models.includes(token), `users read model must include ${token}`);
}

const queries = read('src/db/queries.js');
assert.ok(queries.includes('export async function getUsersDirectoryByIds'), 'queries must expose selection basket lookup helper');

console.log('✅ smoke admin-web users bulk utility contract OK');
