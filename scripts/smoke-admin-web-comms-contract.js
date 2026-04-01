import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const js = read('scripts/admin-web.js');
for (const token of [
  '/admin/comms',
  '/api/admin-web-read?section=comms',
  'Comms workspace',
  'Recent notices',
  'Outbox groups',
  'Явных comms-предупреждений нет.',
]) {
  assert.ok(js.includes(token), `comms UI must include ${token}`);
}

const models = read('src/lib/adminWeb/readModels.js');
for (const token of [
  'export async function getCommsSummary()',
  'recentBroadcasts',
  'buildCommsWarnings',
  'buildCommsHints',
  'normalizeBroadcastStatus',
]) {
  assert.ok(models.includes(token), `comms read model must include ${token}`);
}

const apiRead = read('api/admin-web-read.js');
assert.ok(apiRead.includes("section === 'comms'"), 'admin-web-read must handle comms section');

console.log('✅ smoke admin-web comms contract OK');
