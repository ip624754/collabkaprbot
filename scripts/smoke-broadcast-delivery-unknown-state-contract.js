import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const queries = read('src/db/queries.js');
for (const token of [
  "status = 'delivery_unknown'",
  "delivery_attempt_id = gen_random_uuid()",
  "status in ('queued','retry','deferred','quarantined')",
  'quarantineStaleBroadcastDeliveries',
  'markBroadcastDeliveryUnknown',
  'getBroadcastDeliveryReceipt',
  'resolveBroadcastUnknownDelivery',
  "status = 'delivery_unknown'",
]) {
  assert.ok(queries.includes(token), `queries must include ${token}`);
}
assert.ok(
  !queries.includes("or (status = 'sending' and last_attempt_at"),
  'stale sending must not be automatically reclaimed'
);

const qstash = read('api/qstash/broadcast-deliver.js');
for (const token of [
  'persistBroadcastSentOrUnknown',
  'persistBroadcastRejectedOrUnknown',
  'persistBroadcastUnknown',
  "automatic_resend: false",
  "delivery_state: receipt.state",
  "messageIds: outcome.messageIds || []",
  "redis.call('SADD'",
  "redis.call('EXPIRE'",
  "redis.call('SCARD'",
]) {
  assert.ok(qstash.includes(token), `QStash worker must include ${token}`);
}
assert.ok(!qstash.includes('await redis.sadd(key'), '429 distinct-user accounting must not use split SADD/EXPIRE/SCARD calls');

const cron = read('src/bot/cron.js');
for (const token of [
  'claimBroadcastDelivery',
  'persistBroadcastSentOrUnknown',
  'persistBroadcastRejectedOrUnknown',
  'quarantineStaleBroadcastDeliveries',
  'batch_delivery_unknown',
  'attachBroadcastPartialDeliveryEvidence',
]) {
  assert.ok(cron.includes(token), `legacy cron path must include ${token}`);
}

const migration = read('migrations/049_broadcast_delivery_unknown_state.sql');
for (const token of [
  'delivery_attempt_id uuid',
  'delivery_unknown_at timestamptz',
  'telegram_message_ids jsonb',
  'resolved_by_tg_id bigint',
  'idx_broadcast_sent_log_delivery_unknown',
]) {
  assert.ok(migration.includes(token), `migration must include ${token}`);
}

const readModels = read('src/lib/adminWeb/readModels.js');
assert.ok(readModels.includes('deliveryUnknown'), 'admin read model must expose unknown count');
assert.ok(readModels.includes('unknownDeliveries'), 'admin read model must expose unknown rows');

const comms = read('src/lib/adminWeb/comms.js');
assert.ok(comms.includes('resolveUnknownBroadcastDeliveryForActor'), 'admin comms must expose manual reconciliation');
assert.ok(comms.includes('automaticResend: false'), 'manual reconciliation must never resend');
assert.ok(comms.includes('reconciliation_note_required'), 'manual reconciliation must require a durable reason');

const apiWrite = read('api/admin-web-write.js');
assert.ok(apiWrite.includes("action === 'resolve_broadcast_delivery_unknown'"), 'admin write must route reconciliation');
assert.ok(apiWrite.includes('founder_only'), 'reconciliation must remain founder-only');

const ui = read('scripts/admin-web.js');
for (const token of ['Неопределённые доставки', 'Повторной отправки не будет', 'data-resolve-unknown']) {
  assert.ok(ui.includes(token), `admin UI must include ${token}`);
}

console.log('✅ broadcast delivery unknown-state source contract PASS');
