import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const queries = read('src/db/queries.js');
for (const token of [
  'normalizeUsersDirectoryFilters',
  'USERS_DIRECTORY_META_SQL',
  'planState',
  'creditsState',
  'channelState',
  'activityWindow',
  'paymentsState',
  'last_known_activity_at',
]) {
  assert.ok(queries.includes(token), `queries must include ${token}`);
}

const apiRead = read('api/admin-web-read.js');
for (const token of [
  "plan_state",
  "credits_state",
  "channel_state",
  "activity_window",
  "payments_state",
]) {
  assert.ok(apiRead.includes(token), `admin-web read API must include ${token}`);
}

const webJs = read('scripts/admin-web.js');
for (const token of [
  'Фильтры среза',
  'usersPlanState',
  'usersCreditsState',
  'usersChannelState',
  'usersActivityWindow',
  'usersPaymentsState',
  'активность 7д',
]) {
  assert.ok(webJs.includes(token), `admin-web users UI must include ${token}`);
}

const exportHelper = read('src/lib/adminWeb/usersExport.js');
assert.ok(exportHelper.includes('last_known_activity_msk'), 'users export helper must include last_known_activity_msk');

const bulkHelper = read('src/lib/adminWeb/usersBulk.js');
assert.ok(bulkHelper.includes('normalizeUsersDirectoryFilters'), 'users bulk helper must normalize filter rail state');

console.log('✅ smoke admin-web users filter rail v2 contract OK');
