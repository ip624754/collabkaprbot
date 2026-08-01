#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTION_GUARD, ACTION_REGISTRY, ACTION_TYPES } from '../src/bot/actionRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const bot = read('src/bot/bot.js');
const ops = read('src/bot/adminOpsText.js');
const web = read('scripts/admin-web.js');
const models = read('src/lib/adminWeb/readModels.js');
const telegram = read('src/lib/adminWeb/telegram.js');
const auth = read('api/admin-web-auth.js');
const broadcastActions = read('src/bot/domains/broadcasts/actions.js');

function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `Missing source anchor: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, `Missing source end anchor: ${end}`);
  return source.slice(from, to);
}

function expectRegistry(action, { type, guard }) {
  const meta = ACTION_REGISTRY[action];
  assert.ok(meta, `Missing action registry entry: ${action}`);
  assert.equal(meta.type, type, `Unexpected action type: ${action}`);
  assert.equal(meta.guard, guard, `Unexpected action guard: ${action}`);
}

const composer = sliceBetween(bot, 'async function renderBroadcastSimpleComposer(ctx, banner = \'\') {', 'async function renderBroadcastAudiencePicker(ctx) {');
const preview = sliceBetween(bot, 'async function renderBroadcastPreview(ctx, draft, { banner = \'\' } = {}) {', 'async function renderBroadcastList(ctx, page = 0) {');
const comms = sliceBetween(bot, 'async function renderAdminComms(ctx) {', 'function supportThreadStatusMeta(statusRaw) {');
const templates = sliceBetween(bot, 'async function renderAdminDmTemplates(ctx, page = 0) {', 'async function renderAdminDmTemplateView(ctx, tplId, backPage = 0) {');
const outbox = sliceBetween(bot, '  async function renderAdminOutbox(ctx, page = 0) {', '  async function renderAdminOutboxView(ctx, index, backPage = 0) {');
const system = sliceBetween(bot, 'async function renderAdminSystem(ctx) {', '// Admin tool: Broadcast hard-skip list');
const verification = sliceBetween(bot, 'async function renderModVerifView(ctx, userId, page = 0) {', "  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });\n}");
const audit = sliceBetween(bot, 'async function renderAdminAudit(ctx, { afterHours = 24, page = 0 } = {}) {', 'async function sendAdminAuditExport(ctx, afterHours = 24) {');

for (const token of [
  '📤 <b>Исходящие</b>',
  'Шаблоны личных сообщений',
  'Журнал розыгрыша',
  '✅ Одобрить',
  '❌ Отклонить',
  'Журнал аудита',
  'Управление системой',
  'Редактор рассылки',
  'Проверка перед запуском',
  'Итог доставки',
  'Недоступные чаты',
]) {
  assert.ok(bot.includes(token), `Missing human-readable Telegram operator label: ${token}`);
}

for (const token of [
  'Коммуникации',
  'Черновики',
  'Снимок исходящих',
  'Отправить тест себе',
  'Недавние объявления',
]) {
  assert.ok(web.includes(token), `Missing aligned web-admin label: ${token}`);
}

for (const forbidden of ['Шаблоны DM', 'Outbox']) {
  assert.equal(comms.includes(forbidden), false, `Primary admin comms copy must not expose shorthand: ${forbidden}`);
}
for (const forbidden of ['Шаблоны сообщений (DM)', 'custom (Redis)', '<b>default</b>']) {
  assert.equal(templates.includes(forbidden), false, `Primary template copy must not expose shorthand: ${forbidden}`);
}
for (const forbidden of ['Draft recap', 'Source type', 'Sample targets', 'Clear draft']) {
  assert.equal(composer.includes(forbidden), false, `Broadcast composer still exposes English primary label: ${forbidden}`);
}
for (const forbidden of ['Broadcast preview', 'Recap before send', 'First-batch safety', 'Next action hints']) {
  assert.equal(preview.includes(forbidden), false, `Broadcast preview still exposes English primary label: ${forbidden}`);
}
for (const forbidden of ['<h2>Comms workspace', '<h2>Drafts', '<h2>Recent notices', '<h2>Outbox snapshot', 'Founder test send']) {
  assert.equal(web.includes(forbidden), false, `Web-admin still exposes English primary label: ${forbidden}`);
}
for (const forbidden of ['Untitled draft', 'Comms workspace недоступен', 'active cooldown notices', 'Недавние founder test-sends', 'Live send из web']) {
  assert.equal(models.includes(forbidden), false, `Read model still exposes mixed operator copy: ${forbidden}`);
}
assert.equal(web.includes('Approve ещё не подтверждён'), false, 'Login UI must not expose raw approve decision as primary copy');

// Precise diagnostic terms stay available below the human-readable status/action layer.
for (const token of [
  'Redis',
  'QStash',
  'broadcast_db_overload',
  'qstash_reschedule_failed',
  'official_publish_stuck',
]) {
  assert.ok(ops.includes(token) || bot.includes(token), `Missing precise Telegram diagnostic term: ${token}`);
}
for (const token of [
  'broadcasts / broadcast_sent_log',
  'runtime baseline',
]) {
  assert.ok(models.includes(token), `Missing precise web diagnostic term: ${token}`);
}
assert.ok(auth.includes("action === 'decision'"), 'Legacy decision endpoint must remain explicitly disabled');
assert.ok(telegram.includes("buildDecisionCallback(challengeId, 'approve')"), 'Approve callback decision must remain explicit');
assert.ok(telegram.includes("buildDecisionCallback(challengeId, 'deny')"), 'Deny callback decision must remain explicit');
assert.ok(telegram.includes('callback_data: approveCallback'), 'Approve must use Telegram callback identity');

// Primary surfaces keep human language while raw state/code stays secondary.
assert.ok(outbox.includes('Диагностика: <code>Redis</code>'));
assert.ok(templates.includes("Диагностика: <code>${isCustom ? 'Redis custom' : 'default bundle'}</code>"));
assert.ok(system.includes('QStash'));
assert.ok(verification.includes('✅ Одобрить'));
assert.ok(verification.includes('❌ Отклонить'));
assert.ok(audit.includes('Журнал аудита'));
assert.ok(composer.includes('Черновик'));
assert.ok(preview.includes('Проверка первой партии'));

// Existing control identities and authorization boundaries are unchanged.
for (const action of [
  'a:admin_outbox',
  'a:admin_umsg_tpls',
  'a:bc_confirm',
  'a:mod_verif_approve',
  'a:mod_verif_reject',
  'a:admin_web_login_toggle',
  'a:hs_home',
]) {
  assert.ok(bot.includes(`'${action}`) || bot.includes(`\`${action}`) || broadcastActions.includes(`'${action}'`), `Missing callback identity: ${action}`);
}
expectRegistry('a:admin_outbox', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_umsg_tpls', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:bc_confirm', { type: ACTION_TYPES.OPS, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:mod_verif_approve', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:mod_verif_reject', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_web_login_toggle', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:hs_home', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });

for (const value of ['all', 'brands', 'creators', 'curators', 'managers']) {
  assert.ok(web.includes(`value="${value}"`) || web.includes(`['all','brands','creators','curators','managers']`), `Audience machine value changed: ${value}`);
}
assert.ok(telegram.includes("buildDecisionCallback(challengeId, 'deny')"), 'Deny callback value must remain explicit');
assert.ok(auth.includes("action === 'decision'"), 'Legacy decision endpoint must remain explicitly disabled');

console.log('✅ smoke admin and operator vocabulary contract OK');
