#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTION_GUARD, ACTION_REGISTRY, ACTION_TYPES } from '../src/bot/actionRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function assertMatch(src, re, msg) {
  assert.ok(re.test(src), msg || `expected source to match ${re}`);
}

function extractBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `marker not found: ${startMarker}`);
  const end = src.indexOf(endMarker, start);
  assert.ok(end > start, `end marker not found after ${startMarker}: ${endMarker}`);
  return src.slice(start, end);
}

function expectRegistry(action, { type, guard, breakGlass = undefined }) {
  const meta = ACTION_REGISTRY[action];
  assert.ok(meta, `missing action registry entry: ${action}`);
  assert.equal(meta.type, type, `unexpected type for ${action}`);
  assert.equal(meta.guard, guard, `unexpected guard for ${action}`);
  if (breakGlass !== undefined) {
    assert.equal(!!meta.breakGlass, !!breakGlass, `unexpected breakGlass for ${action}`);
  }
}

const botSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'bot.js'), 'utf8');

const renderAdminOutboxSrc = extractBetween(
  botSource,
  'async function renderAdminOutbox(ctx, page = 0) {',
  '\n\n  async function renderAdminOutboxView(ctx, index, backPage = 0) {'
);
const renderAdminOutboxViewSrc = extractBetween(
  botSource,
  'async function renderAdminOutboxView(ctx, index, backPage = 0) {',
  '\n\n\n\n\nasync function renderAdminFounder(ctx) {'
);
const outboxCallbackSrc = extractBetween(
  botSource,
  '    // --- Admin: Outbox (Redis-only) (STEP193) ---',
  '\n    // --- Admin: DM Templates (Redis-only) ---'
);

assert.ok(renderAdminOutboxSrc.includes('let text = `📤 <b>Outbox</b>'), 'Admin → Outbox must keep stable title');
assert.ok(renderAdminOutboxSrc.includes('`Хранение: <b>Redis-only</b> (последние ${ADMIN_OUTBOX_MAX})'), 'Admin → Outbox must keep Redis-only storage line');
assert.ok(renderAdminOutboxSrc.includes("text += 'Пока пусто.';"), 'Admin → Outbox must keep empty-state copy');
assert.ok(renderAdminOutboxSrc.includes("'🔒 Скрыто (открой Outbox в личке с ботом)'"), 'Admin → Outbox list must keep privacy redaction hint for non-DM chats');
assertMatch(
  renderAdminOutboxSrc,
  /kb\.text\(label, `a:admin_outbox_v\|i:\$\{absIdx\}\|p:\$\{p\}`\)\.row\(\);/s,
  'Admin → Outbox list must keep per-entry view buttons'
);
assertMatch(
  renderAdminOutboxSrc,
  /if \(pages > 1\) \{[\s\S]*?kb\.text\('⬅️', `a:admin_outbox\|p:\$\{prev\}`\)\s*\.text\(`\$\{p \+ 1\}\/\$\{pages\}`, `a:admin_outbox\|p:\$\{p\}`\)\s*\.text\('➡️', `a:admin_outbox\|p:\$\{next\}`\)\s*\.row\(\);[\s\S]*?\}/s,
  'Admin → Outbox must keep pagination row when pages > 1'
);
assertMatch(
  renderAdminOutboxSrc,
  /kb\.text\('🧹 Очистить', `a:admin_outbox_clear_q\|p:\$\{p\}`\)\.row\(\);/s,
  'Admin → Outbox list must keep clear button'
);
assert.ok(renderAdminOutboxSrc.includes("kbAdminFooter(kb, '⬅️ Коммуникации', 'a:admin_comms');"), 'Admin → Outbox list must keep Comms footer');

assert.ok(renderAdminOutboxViewSrc.includes("'⚠️ Запись не найдена (возможно, очищено).'"), 'Admin → Outbox view must keep missing-entry message');
assert.ok(renderAdminOutboxViewSrc.includes("'🔒 Скрыто (открой Outbox в личке с ботом)'"), 'Admin → Outbox view must keep privacy redaction hint for non-DM chats');
assert.ok(renderAdminOutboxViewSrc.includes('`${icon} <b>Outbox запись</b>'), 'Admin → Outbox view must keep stable title');
assert.ok(renderAdminOutboxViewSrc.includes("`Статус: <b>${escapeHtml(String(it.status || (ok ? 'ok' : 'failed')))}</b>`"), 'Admin → Outbox view must keep status line');
assert.ok(renderAdminOutboxViewSrc.includes('<b>Текст (snippet)</b>:'), 'Admin → Outbox view must keep snippet section');
assertMatch(
  renderAdminOutboxViewSrc,
  /const kb = new InlineKeyboard\([\s\S]*?\.text\('⬅️ К списку', `a:admin_outbox\|p:\$\{p\}`\)\s*\.text\('🧹 Очистить', `a:admin_outbox_clear_q\|p:\$\{p\}`\)\s*\.row\(\);/s,
  'Admin → Outbox view must keep list + clear row'
);
assertMatch(
  renderAdminOutboxViewSrc,
  /kb\.text\('👤 Карточка', `a:adm_ucard\|id:\$\{uid\}\|f:all\|p:0`\)\s*\.text\('✉️ Написать', `a:adm_umsg\|id:\$\{uid\}\|f:all\|p:0`\)\s*\.row\(\);/s,
  'Admin → Outbox view must keep card + message quick actions'
);
assertMatch(
  renderAdminOutboxViewSrc,
  /if \(canRepeat\) \{[\s\S]*?kb\.text\('✉️ Повторить', `a:admin_outbox_repeat\|i:\$\{index\}\|p:\$\{p\}`\)\s*\.text\('📝 Заметка', `a:admin_outbox_note\|i:\$\{index\}\|p:\$\{p\}`\)\s*\.row\(\)\s*\.text\('📌 В шаблон', `a:admin_outbox_to_tpl\|i:\$\{index\}\|p:\$\{p\}`\)\s*\.row\(\);[\s\S]*?\} else \{[\s\S]*?kb\.text\('📝 Заметка', `a:admin_outbox_note\|i:\$\{index\}\|p:\$\{p\}`\)\.row\(\);[\s\S]*?\}/s,
  'Admin → Outbox view must keep repeat/note/template conditional controls'
);
assert.ok(renderAdminOutboxViewSrc.includes("kbAdminFooter(kb, '⬅️ Коммуникации', 'a:admin_comms');"), 'Admin → Outbox view must keep Comms footer');

assert.ok(outboxCallbackSrc.includes("if (p.a === 'a:admin_outbox') {"), 'Admin → Outbox main callback must exist');
assert.ok(outboxCallbackSrc.includes("if (p.a === 'a:admin_outbox_v') {"), 'Admin → Outbox view callback must exist');
assert.ok(outboxCallbackSrc.includes("try { await clearExpectText(ctx.from.id); } catch {}"), 'Admin → Outbox entry/view callbacks must clear expectText');
assert.ok(outboxCallbackSrc.includes("if (p.a === 'a:admin_outbox_note') {"), 'Admin → Outbox note callback must exist');
assert.ok(outboxCallbackSrc.includes("backText: '⬅️ Outbox'"), 'Admin → Outbox note flow must preserve back route text');
assert.ok(outboxCallbackSrc.includes("backCb: `a:admin_outbox_v|i:${idx}|p:${page}`"), 'Admin → Outbox note flow must preserve back route callback');
assert.ok(outboxCallbackSrc.includes("if (p.a === 'a:admin_outbox_repeat') {"), 'Admin → Outbox repeat callback must exist');
assert.ok(outboxCallbackSrc.includes('Повтор из Outbox доступен только в <b>личном чате</b> с ботом (DM)'), 'Admin → Outbox repeat must stay DM-only');
assert.ok(outboxCallbackSrc.includes("templateLabel: 'Повтор из Outbox'"), 'Admin → Outbox repeat must keep template label');
assert.ok(outboxCallbackSrc.includes("retText: '⬅️ Outbox'"), 'Admin → Outbox repeat send flow must keep return text');
assertMatch(
  outboxCallbackSrc,
  /const kb = new InlineKeyboard\([\s\S]*?\.text\('✅ Отправить', `a:adm_umsg_send\|tk:\$\{token\}\|f:all\|p:0\|wn:1`\)\s*\.text\('⚪ Без «Что дальше»', `a:adm_umsg_send\|tk:\$\{token\}\|f:all\|p:0\|wn:0`\)\s*\.row\(\)\s*\.text\('❌ Отмена', `a:admin_outbox_v\|i:\$\{idx\}\|p:\$\{page\}`\)\s*\.row\(\);/s,
  'Admin → Outbox repeat preview must keep send / no-what-next / cancel controls'
);
assert.ok(outboxCallbackSrc.includes("if (p.a === 'a:admin_outbox_to_tpl') {"), 'Admin → Outbox save-to-template callback must exist');
assert.ok(outboxCallbackSrc.includes('Сохранение в шаблоны доступно только в <b>личном чате</b> с ботом (DM).'), 'Admin → Outbox save-to-template must stay DM-only');
assert.ok(outboxCallbackSrc.includes("type: 'adm_outbox_tpl_label'"), 'Admin → Outbox save-to-template must keep expectText type');
assert.ok(outboxCallbackSrc.includes('Напиши <b>название</b> шаблона одним сообщением.'), 'Admin → Outbox save-to-template prompt must stay stable');
assert.ok(outboxCallbackSrc.includes("if (p.a === 'a:admin_outbox_clear_q') {"), 'Admin → Outbox clear confirm callback must exist');
assert.ok(outboxCallbackSrc.includes('🧹 <b>Очистить Outbox?</b>'), 'Admin → Outbox clear confirm text must stay stable');
assertMatch(
  outboxCallbackSrc,
  /const kb = new InlineKeyboard\([\s\S]*?\.text\('🧹 Очистить', `a:admin_outbox_clear\|p:\$\{page\}`\)\s*\.text\('❌ Отмена', `a:admin_outbox\|p:\$\{page\}`\)\s*\.row\(\)\s*\.text\('⬅️ Коммуникации', 'a:admin_comms'\)\s*\.row\(\)\s*\.text\('📋 Меню', 'a:menu'\)\s*\.text\('🏠 Home', 'a:home'\);/s,
  'Admin → Outbox clear confirm must keep confirm/cancel/footer controls'
);
assert.ok(outboxCallbackSrc.includes("if (p.a === 'a:admin_outbox_clear') {"), 'Admin → Outbox clear callback must exist');
assert.ok(outboxCallbackSrc.includes('await clearAdminOutbox();'), 'Admin → Outbox clear must still wipe Redis list');
assert.ok(outboxCallbackSrc.includes('await renderAdminOutbox(ctx, page);'), 'Admin → Outbox clear must return to list render');

expectRegistry('a:admin_outbox', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_outbox_v', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_outbox_clear_q', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_outbox_clear', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_outbox_repeat', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_outbox_note', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_outbox_to_tpl', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:adm_ucard', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:adm_umsg', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:admin_comms', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:menu', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:home', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });

console.log('✅ smoke admin-outbox contract OK');
