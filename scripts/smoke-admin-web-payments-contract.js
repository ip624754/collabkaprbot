import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const js = read('scripts/admin-web.js');
for (const token of [
  '/admin/payments',
  '/api/admin-web-read?section=payments',
  '/api/admin-web-read?section=payment',
  'Payments',
  'Последние платежи',
  'Status groups',
  'Payment detail',
  'Последние payment-сигналы',
  'Явных payment-предупреждений нет.',
]) {
  assert.ok(js.includes(token), `payments UI must include ${token}`);
}

const models = read('src/lib/adminWeb/readModels.js');
for (const token of [
  'export async function getPaymentsSummary()',
  'export async function getPaymentDetail(',
  'recentPayments',
  'buildPaymentWarnings',
  'buildPaymentEventTrace',
  'groups:',
  'needsReview',
]) {
  assert.ok(models.includes(token), `payments read model must include ${token}`);
}

const apiRead = read('api/admin-web-read.js');
assert.ok(apiRead.includes("section === 'payments'"), 'admin-web-read must handle payments section');
assert.ok(apiRead.includes("section === 'payment'"), 'admin-web-read must handle payment detail section');

console.log('✅ smoke admin-web payments contract OK');
