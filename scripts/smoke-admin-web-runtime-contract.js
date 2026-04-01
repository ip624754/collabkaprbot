import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const js = read('scripts/admin-web.js');
for (const token of [
  'Общий статус',
  'Предупреждения',
  'Конфигурация',
  'Подсказки',
  'Последние runtime-сигналы',
  'Last updated:',
]) {
  assert.ok(js.includes(token), `runtime UI must include ${token}`);
}

const runtime = read('src/lib/adminWeb/runtime.js');
for (const token of [
  'configPresence',
  'recentRuntimeEvents',
  'overall',
  'deriveOverallState',
  'QSTASH_TOKEN / QSTASH_CURRENT_SIGNING_KEY',
  'PAYMENTS_PAYLOAD_HMAC_KEY',
]) {
  assert.ok(runtime.includes(token), `runtime summary must include ${token}`);
}

assert.ok(!fs.existsSync(path.join(ROOT, 'api/admin-web/user.js')), 'legacy split api/admin-web/user.js must be removed');
assert.ok(!fs.existsSync(path.join(ROOT, 'api/admin-web/users.js')), 'legacy split api/admin-web/users.js must be removed');

console.log('✅ smoke admin-web runtime contract OK');
