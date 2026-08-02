import { readQueryImplementationSource } from './lib/query-source-reader.js';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readAdminWebSource } from './lib/admin-web-source-reader.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

assert.ok(exists('src/lib/adminWeb/usersExport.js'), 'users export helper must exist');

const helper = read('src/lib/adminWeb/usersExport.js');
for (const token of [
  'buildUsersCsvExport',
  'normalizeUsersExportScope',
  'getUsersExportOptions',
  'audit_snapshot',
  'has_note',
]) {
  assert.ok(helper.includes(token), `usersExport helper must include ${token}`);
}

const apiRead = read('api/admin-web-read.js');
for (const token of [
  "section === 'users_export'",
  'buildUsersCsvExport(',
  "action: 'export_users_csv'",
  "targetType: 'users_export'",
  'Content-Disposition',
]) {
  assert.ok(apiRead.includes(token), `admin-web read API must include ${token}`);
}

const webJs = readAdminWebSource();
for (const token of [
  "section: 'users_export'",
  'usersExportScope',
  'exportUsersBtn',
  'Выгрузок из web-admin пока не было.',
]) {
  assert.ok(webJs.includes(token), `admin-web users UI must include ${token}`);
}

const models = read('src/lib/adminWeb/readModels.js');
for (const token of [
  'exportOptions: getUsersExportOptions()',
  "action || '') === 'export_users_csv'",
  'exportMeta:',
]) {
  assert.ok(models.includes(token), `users read model must include ${token}`);
}

const queries = readQueryImplementationSource();
for (const token of ['hasUsersBannedAtColumn', 'usersDirectoryBannedAtSelectSql', 'buildUsersDirectoryProblemScoreSql']) {
  assert.ok(queries.includes(token), `users export queries must include ${token}`);
}

console.log('✅ smoke admin-web users export contract OK');
