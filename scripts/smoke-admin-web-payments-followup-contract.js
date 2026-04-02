import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const js = read('scripts/admin-web.js');
for (const token of [
  'Operator follow-up',
  'Кейсы для follow-up',
  'Follow-up',
  'paymentFollowUpClass',
  'paymentFollowUpLabel',
]) {
  assert.ok(js.includes(token), `payments follow-up UI must include ${token}`);
}

const models = read('src/lib/adminWeb/readModels.js');
for (const token of [
  'buildPaymentFollowUp(',
  'buildPaymentFollowUpGroups(',
  'buildPaymentFollowUpQueue(',
  'buildPaymentOperatorHints(',
  'followUpGroups',
  'followUpQueue',
  'followUp:',
]) {
  assert.ok(models.includes(token), `payments follow-up model must include ${token}`);
}

console.log('✅ smoke admin-web payments follow-up contract OK');
