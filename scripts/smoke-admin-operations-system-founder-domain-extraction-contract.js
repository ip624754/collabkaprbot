import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const bot = read('src/bot/bot.js');
const actions = read('src/bot/domains/adminSystem/actions.js');
const route = read('src/bot/domains/adminSystem/route.js');
const navigation = read('src/bot/domains/adminSystem/navigationCallbacks.js');
const operations = read('src/bot/domains/adminSystem/operationsCallbacks.js');
const delivery = read('src/bot/domains/adminSystem/deliveryCallbacks.js');
const audit = read('src/bot/domains/adminSystem/auditCallbacks.js');
const qstash = read('src/bot/domains/adminSystem/qstashCallbacks.js');
const founder = read('src/bot/domains/adminSystem/founderCallbacks.js');
const commActions = read('src/bot/domains/adminCommunications/actions.js');
const commTemplates = read('src/bot/domains/adminCommunications/templateCallbacks.js');
const ownership = read('src/bot/router/callbackOwnership.js');
const contracts = read('src/bot/router/callbackContracts.js');

const expected = [
  'a:admin', 'a:admin_home', 'a:admin_ops', 'a:admin_sys',
  'a:admin_ops_flush', 'a:admin_ops_pending_clear', 'a:admin_ops_pending_clear_do',
  'a:admin_invites', 'a:admin_invites_list',
  'a:hs_home', 'a:hs_hits', 'a:hs_find', 'a:hs_view', 'a:hs_unskip', 'a:hs_hits_export',
  'a:aud', 'a:aud_search', 'a:aud_reset', 'a:aud_export', 'a:admin_metrics',
  'a:admin_qstash_status', 'a:admin_qstash_ping',
  'a:admin_founder', 'a:admin_founder_toggle', 'a:admin_founder_reset',
  'a:admin_founder_set_deadline', 'a:admin_founder_set_prices', 'a:admin_founder_set_credits',
  'a:admin_founder_links', 'a:admin_founder_texts',
];

for (const action of expected) {
  assert.ok(actions.includes(`'${action}'`), `action catalog contains ${action}`);
  const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.ok(!new RegExp(`if\\s*\\(p\\.a\\s*===\\s*['\"]${escaped}['\"]`).test(bot), `legacy branch removed for ${action}`);
}
assert.equal(new Set(expected).size, 30, '30 exact live adminSystem callbacks');
assert.ok(route.includes('ADMIN_SYSTEM_NAVIGATION'), 'navigation route declared');
assert.ok(route.includes('ADMIN_SYSTEM_OPERATIONS'), 'operations route declared');
assert.ok(route.includes('ADMIN_DELIVERY_HARD_SKIP'), 'hard-skip route declared');
assert.ok(route.includes('ADMIN_AUDIT_METRICS'), 'audit/metrics route declared');
assert.ok(route.includes('ADMIN_QSTASH_CONTROLS'), 'QStash route declared');
assert.ok(route.includes('ADMIN_FOUNDER_CONTROLS'), 'founder route declared');
assert.ok(ownership.includes('ADMIN_SYSTEM_CALLBACK_ROUTE_DEFINITIONS'), 'ownership composition includes adminSystem routes');
for (const marker of [
  "ADMIN_SYSTEM_NAVIGATION: 'admin_system_navigation'",
  "ADMIN_SYSTEM_OPERATIONS: 'admin_system_operations'",
  "ADMIN_DELIVERY_HARD_SKIP: 'admin_delivery_hard_skip'",
  "ADMIN_AUDIT_METRICS: 'admin_audit_metrics'",
  "ADMIN_QSTASH_CONTROLS: 'admin_qstash_controls'",
  "ADMIN_FOUNDER_CONTROLS: 'admin_founder_controls'",
]) assert.ok(contracts.includes(marker), `callback contract declared: ${marker}`);
assert.ok(navigation.includes("if (p.a === 'a:admin')"), 'admin alias moved');
assert.ok(operations.includes("if (p.a === 'a:admin_ops_pending_clear_do')"), 'pending snapshot clear moved');
assert.ok(delivery.includes("if (p.a === 'a:hs_hits_export')"), 'hard-skip export moved');
assert.ok(audit.includes("if (p.a === 'a:aud_export')"), 'audit export moved');
assert.ok(qstash.includes("if (p.a === 'a:admin_qstash_ping')"), 'QStash ping moved');
assert.ok(founder.includes("if (p.a === 'a:admin_founder_reset')"), 'founder reset moved');
assert.ok(commActions.includes("ADM_PH: 'a:adm_ph'"), 'placeholder helper catalogued in communications');
assert.ok(commTemplates.includes("if (p.a === 'a:adm_ph')"), 'placeholder helper moved to communications handler');
assert.ok(!/if\s*\(p\.a\s*===\s*['"]a:adm_ph['"]/.test(bot), 'placeholder helper removed from legacy dispatcher');
assert.ok(/if\s*\(p\.a\s*===\s*['"]a:founder['"]/.test(bot), 'user founder flow remains legacy-owned');
assert.ok(/if\s*\(p\.a\s*===\s*['"]a:off_buy['"]/.test(bot), 'official checkout remains legacy-owned');
assert.ok(/if\s*\(p\.a\s*===\s*['"]a:off_buy_home['"]/.test(bot), 'official checkout home remains legacy-owned');

console.log('PASS STEP590E5D admin operations/system/founder source contract');
