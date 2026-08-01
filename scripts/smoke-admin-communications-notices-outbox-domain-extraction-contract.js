import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const bot = read('src/bot/bot.js');
const actions = read('src/bot/domains/adminCommunications/actions.js');
const route = read('src/bot/domains/adminCommunications/route.js');
const communications = read('src/bot/domains/adminCommunications/communicationsCallbacks.js');
const notices = read('src/bot/domains/adminCommunications/noticeCallbacks.js');
const outbox = read('src/bot/domains/adminCommunications/outboxCallbacks.js');
const templates = read('src/bot/domains/adminCommunications/templateCallbacks.js');
const ownership = read('src/bot/router/callbackOwnership.js');
const contracts = read('src/bot/router/callbackContracts.js');

const expected = [
  'a:admin_comms',
  'a:admin_notice', 'a:admin_notice_toggle', 'a:admin_notice_sev', 'a:admin_notice_target',
  'a:admin_notice_cta', 'a:admin_notice_expire', 'a:admin_notice_clear',
  'a:admin_notice_publish', 'a:admin_notice_text',
  'a:admin_outbox', 'a:admin_outbox_v', 'a:admin_outbox_note', 'a:admin_outbox_repeat',
  'a:admin_outbox_to_tpl', 'a:admin_outbox_clear_q', 'a:admin_outbox_clear',
  'a:adm_umsg_tpl', 'a:admin_umsg_tpls', 'a:admin_umsg_tpl_view', 'a:admin_umsg_tpl_add',
  'a:admin_umsg_tpl_edit', 'a:admin_umsg_tpl_del_q', 'a:admin_umsg_tpl_del',
  'a:admin_umsg_tpl_reset_q', 'a:admin_umsg_tpl_reset',
];

for (const action of expected) {
  assert.ok(actions.includes(`'${action}'`), `action catalog contains ${action}`);
  assert.ok(!new RegExp(`if\\s*\\(p\\.a\\s*===\\s*['\"]${action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['\"]`).test(bot), `legacy branch removed for ${action}`);
}
assert.equal(new Set(expected).size, 26, '26 exact live callbacks');
assert.ok(route.includes('ADMIN_COMMUNICATIONS'), 'communications route declared');
assert.ok(route.includes('ADMIN_NOTICE_MANAGEMENT'), 'notice route declared');
assert.ok(route.includes('ADMIN_OUTBOX'), 'outbox route declared');
assert.ok(route.includes('ADMIN_MESSAGE_TEMPLATES'), 'templates route declared');
assert.ok(ownership.includes('ADMIN_COMMUNICATION_CALLBACK_ROUTE_DEFINITIONS'), 'ownership composition includes communications routes');
assert.ok(contracts.includes("ADMIN_COMMUNICATIONS: 'admin_communications'"), 'communications callback contract declared');
assert.ok(communications.includes("if (p.a === 'a:admin_comms')"), 'communications callback moved');
assert.ok(notices.includes("if (p.a === 'a:admin_notice_publish')"), 'notice publish moved');
assert.ok(outbox.includes("if (p.a === 'a:admin_outbox_repeat')"), 'outbox repeat moved');
assert.ok(templates.includes("if (p.a === 'a:adm_umsg_tpl')"), 'template selection moved');
assert.ok(templates.includes("if (p.a === 'a:admin_umsg_tpl_reset')"), 'template reset moved');
assert.ok(new RegExp("if\\s*\\(p\\.a\\s*===\\s*['\"]a:notice['\"]").test(bot), 'user-facing notice view remains legacy-owned');
assert.ok(!bot.includes("from './domains/adminCommunications/index.js';\nimport {\n  handleAdminCommunicationsCallback"), 'no duplicate malformed import composition');

console.log('PASS STEP590E5C admin communications/notices/outbox source contract');
