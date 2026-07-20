import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const health = read('api/health.js');
const policy = read('src/lib/healthPolicy.js');
const webhook = read('api/webhook.js');
const middleware = read('src/bot/middleware/logging.js');
const logger = read('src/lib/logger.js');
const callbacks = read('src/bot/routes/callbacks.js');

for (const token of [
  "resolveHealthView(_req)",
  "healthView === 'liveness'",
  "healthView === 'diagnostics'",
  "await requireSession(_req, res)",
  'await pingDb()',
  'buildPublicReadinessPayload(out)',
  'healthStatusCode(status.system_status)',
  'out.ok = status.system_status === \'GO\'',
]) {
  assert.ok(health.includes(token), `health runtime must include ${token}`);
}

assert.ok(policy.includes("return 'readiness'"), 'public default must be readiness');
assert.ok(policy.includes("return 'diagnostics'"), 'full/admin diagnostics routing required');
assert.ok(policy.includes("reason_codes"), 'public readiness must expose codes only');
assert.ok(!policy.includes('hint: row'), 'public readiness must not project hints');
assert.ok(policy.includes("delete next.qstash.reschedule_failed.last_payload"), 'diagnostics must drop QStash payload');
assert.ok(policy.includes("delete next.ops.digest_preview.tail"), 'diagnostics must drop ops event tail');

assert.ok(webhook.includes('telegramUpdateLogSummary(update)'), 'webhook must use privacy-safe summary');
assert.ok(webhook.includes("logger.info(summary, 'webhook.in')"), 'webhook must use structured logger');
assert.ok(!webhook.includes('message.text'), 'webhook must not read raw message text for logs');
assert.ok(!webhook.includes('callback_query.data'), 'webhook must not read raw callback data for logs');
assert.ok(!webhook.includes('console.log'), 'webhook must not bypass structured logger');

for (const forbidden of ['from_id:', 'chat_id:', 'username:', 'cb:', 'callbackQuery.data']) {
  assert.ok(!middleware.includes(forbidden), `middleware must not contain raw log field ${forbidden}`);
}
assert.ok(middleware.includes('contextLogSummary(ctx)'), 'middleware must use privacy-safe context summary');
assert.ok(middleware.includes('safeLogError(error)'), 'middleware errors must be sanitized');

for (const token of ["'tgId'", "'actorTgId'", "'username'", "'cb_data'", "'payload'"]) {
  assert.ok(logger.includes(token), `pino redaction must include ${token}`);
}
assert.ok(callbacks.includes('opaqueLogRef(ctx?.from?.id'), 'callback logs must pseudonymize actor');
assert.ok(!callbacks.includes('data: String(ctx?.callbackQuery?.data'), 'callback logs must not include full callback data');

console.log('✅ health/logging privacy/readiness source contract PASS');
