import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const js = read('scripts/admin-web.js');
for (const token of [
  '/admin/comms',
  '/api/admin-web-read?section=comms',
  'create_notice_draft',
  'update_notice_draft',
  'test_send_notice',
  'Черновики',
  'Недавние объявления',
  'Снимок исходящих',
  'Отправить тест себе',
  'Последние действия',
  'Неопределённые доставки',
  'data-resolve-unknown',
]) {
  assert.ok(js.includes(token), `comms UI must include ${token}`);
}

const models = read('src/lib/adminWeb/readModels.js');
for (const token of [
  'export async function getCommsSummary()',
  'recentNotices',
  'recentAdminAudit',
  'draftsWithoutTest',
  'recentTestSends',
  'unknownDeliveries',
  'deliveryUnknown',
]) {
  assert.ok(models.includes(token), `comms read model must include ${token}`);
}

const comms = read('src/lib/adminWeb/comms.js');
for (const token of [
  'createNoticeDraftForActor',
  'updateNoticeDraftForActor',
  'testSendNoticeDraftToActor',
  'create_notice_draft',
  'test_send_notice',
  'resolveUnknownBroadcastDeliveryForActor',
  'reconciliation_note_required',
]) {
  assert.ok(comms.includes(token), `comms write helper must include ${token}`);
}

const apiRead = read('api/admin-web-read.js');
assert.ok(apiRead.includes("section === 'comms'"), 'admin-web-read must handle comms section');

const apiWrite = read('api/admin-web-write.js');
for (const token of [
  "action === 'create_notice_draft'",
  "action === 'update_notice_draft'",
  "action === 'test_send_notice'",
  "action === 'resolve_broadcast_delivery_unknown'",
  "founder_only",
]) {
  assert.ok(apiWrite.includes(token), `admin-web-write must include ${token}`);
}

console.log('✅ smoke admin-web comms contract OK');
