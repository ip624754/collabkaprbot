import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const js = read('scripts/admin-web.js');
for (const token of [
  'Payments review plane',
  'Review buckets',
  'Next-action rail',
  'Кейсы для ручного review',
  'Payment detail',
  'User card',
]) {
  assert.ok(js.includes(token), `payments review UI must include ${token}`);
}

const models = read('src/lib/adminWeb/readModels.js');
for (const token of [
  'buildPaymentReviewBuckets(',
  'buildPaymentActionRail(',
  'reviewBuckets:',
  'actionRail:',
  'userId: Number(item.userId || 0) || 0',
]) {
  assert.ok(models.includes(token), `payments review model must include ${token}`);
}

console.log('✅ smoke admin-web payments review contract OK');
