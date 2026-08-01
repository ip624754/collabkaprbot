import assert from 'node:assert/strict';
import fs from 'node:fs';

const bot = fs.readFileSync(new URL('../src/bot/bot.js', import.meta.url), 'utf8');
const actions = fs.readFileSync(new URL('../src/bot/domains/broadcasts/actions.js', import.meta.url), 'utf8');
const callbacks = fs.readFileSync(new URL('../src/bot/domains/broadcasts/callbacks.js', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../src/bot/domains/broadcasts/route.js', import.meta.url), 'utf8');
const ownership = fs.readFileSync(new URL('../src/bot/router/callbackOwnership.js', import.meta.url), 'utf8');
const contracts = fs.readFileSync(new URL('../src/bot/router/callbackContracts.js', import.meta.url), 'utf8');

const criticalActions = [
  'a:bc_start',
  'a:bc_start_adv',
  'a:bc_simple_text',
  'a:bc_simple_media',
  'a:bc_simple_media_clear',
  'a:bc_simple_button',
  'a:bc_simple_btn_preset',
  'a:bc_simple_btn_custom',
  'a:bc_simple_btn_clear',
  'a:bc_simple_audience',
  'a:bc_preview',
  'a:bc_send_q',
  'a:bc_simple_clear',
  'a:bc_audience',
  'a:bc_buttons',
  'a:bc_tpl_gw',
  'a:bc_tpl_bp',
  'a:bc_tpl_offer',
  'a:bc_btn_done',
  'a:bc_confirm',
  'a:bc_cancel',
  'a:bc_list',
  'a:bc_view',
  'a:bc_blocked',
  'a:bc_pause',
  'a:bc_resume',
  'a:bc_stop',
  'a:admin_bc_qstash_toggle',
];

for (const action of criticalActions) {
  assert.ok(actions.includes(`'${action}'`), `${action} must be declared in broadcast domain`);
  assert.ok(!bot.includes(`if (p.a === '${action}') {`), `${action} must be removed from legacy bot dispatcher`);
}

assert.ok(callbacks.includes('export async function handleBroadcastComposerCallback'), 'composer handler canonical');
assert.ok(callbacks.includes('export async function handleBroadcastAudienceCallback'), 'audience handler canonical');
assert.ok(callbacks.includes('export async function handleBroadcastDispatchCallback'), 'dispatch handler canonical');
assert.ok(callbacks.includes('export async function handleBroadcastOperationsCallback'), 'operations handler canonical');
assert.ok(callbacks.includes('db.createBroadcastIdempotent('), 'confirm uses idempotent DB creation boundary');
assert.ok(callbacks.includes('statementTimeoutMs: 8000'), 'bounded statement timeout preserved');
assert.ok(callbacks.includes('dedupWindowSec: 45'), 'double-click dedup window preserved');
assert.ok(callbacks.includes("key(['rl', 'bc_confirm', ctx.from.id])"), 'confirm rate-limit key preserved');
assert.ok(!callbacks.includes('ctx.api.sendMessage'), 'domain does not introduce direct recipient send path');
assert.ok(!callbacks.includes('qstashPublishJSON'), 'domain does not introduce direct QStash fanout');
assert.ok(!callbacks.includes('broadcastDeliveryReceipt'), 'domain does not duplicate receipt core');
assert.ok(!callbacks.includes('broadcastDeliverySafety'), 'domain does not duplicate safety core');
assert.ok(callbacks.includes("status: 'PAUSED'"), 'pause transition preserved');
assert.ok(callbacks.includes("status: 'RUNNING'"), 'resume transition preserved');
assert.ok(callbacks.includes("status: 'STOPPED'"), 'stop transition preserved');
assert.ok(callbacks.includes("'broadcast_qstash_fanout'"), 'operator control id preserved');
assert.ok(callbacks.includes("console.error('[ADMIN] broadcast confirm error', error)"), 'legacy confirm error marker preserved');

assert.ok(route.includes('BROADCAST_COMPOSER_ROUTE_DEFINITION'), 'composer route descriptor exists');
assert.ok(route.includes('BROADCAST_AUDIENCE_ROUTE_DEFINITION'), 'audience route descriptor exists');
assert.ok(route.includes('BROADCAST_DISPATCH_ROUTE_DEFINITION'), 'dispatch route descriptor exists');
assert.ok(route.includes('BROADCAST_OPERATIONS_ROUTE_DEFINITION'), 'operations route descriptor exists');
assert.ok(contracts.includes("BROADCAST_COMPOSER: 'broadcast_composer'"), 'composer route contract exists');
assert.ok(contracts.includes("BROADCAST_AUDIENCE: 'broadcast_audience'"), 'audience route contract exists');
assert.ok(contracts.includes("BROADCAST_DISPATCH: 'broadcast_dispatch'"), 'dispatch route contract exists');
assert.ok(contracts.includes("BROADCAST_OPERATIONS: 'broadcast_operations'"), 'operations route contract exists');
assert.ok(ownership.includes('BROADCAST_CALLBACK_ROUTE_DEFINITIONS'), 'ownership consumes broadcast route descriptors');

assert.ok(bot.includes('handleBroadcastComposerCallback,'), 'bot imports composer handler');
assert.ok(bot.includes('handleBroadcastAudienceCallback,'), 'bot imports audience handler');
assert.ok(bot.includes('handleBroadcastDispatchCallback,'), 'bot imports dispatch handler');
assert.ok(bot.includes('handleBroadcastOperationsCallback,'), 'bot imports operations handler');
assert.ok(bot.includes('broadcast_composer: (ctx2, p2, u2) => handleBroadcastComposerCallback('), 'composer owner wired');
assert.ok(bot.includes('broadcast_audience: (ctx2, p2, u2) => handleBroadcastAudienceCallback('), 'audience owner wired');
assert.ok(bot.includes('broadcast_dispatch: (ctx2, p2, u2) => handleBroadcastDispatchCallback('), 'dispatch owner wired');
assert.ok(bot.includes('broadcast_operations: (ctx2, p2, u2) => handleBroadcastOperationsCallback('), 'operations owner wired');
assert.ok(bot.includes('const broadcastDomainDeps = {'), 'broadcast dependencies explicit');

console.log('PASS STEP590C4 broadcast bounded-domain source contract');
