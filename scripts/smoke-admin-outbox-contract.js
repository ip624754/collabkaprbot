#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTION_GUARD, ACTION_REGISTRY, ACTION_TYPES } from '../src/bot/actionRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const botSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'bot.js'), 'utf8');
const outboxDomainSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'domains', 'adminCommunications', 'outboxCallbacks.js'), 'utf8');

function extractBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `marker not found: ${startMarker}`);
  const end = src.indexOf(endMarker, start);
  assert.ok(end > start, `end marker not found after ${startMarker}: ${endMarker}`);
  return src.slice(start, end);
}

function expectRegistry(action, { type, guard }) {
  const meta = ACTION_REGISTRY[action];
  assert.ok(meta, `missing action registry entry: ${action}`);
  assert.equal(meta.type, type, `unexpected type for ${action}`);
  assert.equal(meta.guard, guard, `unexpected guard for ${action}`);
}

const renderList = extractBetween(
  botSource,
  'async function renderAdminOutbox(ctx, page = 0) {',
  '\n\n  async function renderAdminOutboxView(ctx, index, backPage = 0) {'
);
const renderView = extractBetween(
  botSource,
  'async function renderAdminOutboxView(ctx, index, backPage = 0) {',
  '\n\n\n\n\nasync function renderAdminFounder(ctx) {'
);
const callbacks = outboxDomainSource;

assert.ok(renderList.includes('📤 <b>Исходящие</b>'), 'Outbox title must stay stable');
assert.ok(renderList.includes('Диагностика: <code>Redis</code>'), 'Outbox storage truth must stay visible');
assert.ok(renderList.includes("text += 'Исходящих сообщений пока нет.';"), 'Outbox empty state must exist');
assert.ok(renderList.includes("'🔒 Текст скрыт. Открой «Исходящие» в личном чате с ботом.'"), 'Outbox must redact snippets outside DM');
assert.ok(renderList.includes('commsCb.adminOutboxView(absIdx, p)'), 'Outbox entries must use canonical view callback builder');
assert.ok(renderList.includes("commsCb.adminOutbox(prev)"), 'Outbox pagination must preserve previous route');
assert.ok(renderList.includes("commsCb.adminOutbox(next)"), 'Outbox pagination must preserve next route');
assert.ok(renderList.includes('commsCb.adminOutboxClearQ(p)'), 'Outbox clear confirmation route must exist');
assert.ok(renderList.includes("kbAdminFooter(kb, '⬅️ Коммуникации', 'a:admin_comms');"), 'Outbox footer must return to Comms');

assert.ok(renderView.includes('⚠️ Запись не найдена (возможно, очищено).'), 'Outbox missing-entry state must exist');
assert.ok(renderView.includes('<b>Исходящее сообщение</b>'), 'Outbox entry title must stay stable');
assert.ok(renderView.includes('<b>Фрагмент сообщения</b>:'), 'Outbox entry must expose snippet in DM');
assert.ok(renderView.includes('commsCb.adminOutbox(p)'), 'Outbox entry must return to list');
assert.ok(renderView.includes('commsCb.adminOutboxClearQ(p)'), 'Outbox entry must expose clear confirmation');
assert.ok(renderView.includes('commsCb.adminOutboxRepeat(index, p)'), 'Outbox repeat action must use canonical builder');
assert.ok(renderView.includes('commsCb.adminOutboxNote(index, p)'), 'Outbox note action must use canonical builder');
assert.ok(renderView.includes('commsCb.adminOutboxToTpl(index, p)'), 'Outbox save-to-template action must use canonical builder');
assert.ok(renderView.includes("kbAdminFooter(kb, '⬅️ Коммуникации', 'a:admin_comms');"), 'Outbox entry footer must return to Comms');

for (const action of [
  'a:admin_outbox',
  'a:admin_outbox_v',
  'a:admin_outbox_note',
  'a:admin_outbox_repeat',
  'a:admin_outbox_to_tpl',
  'a:admin_outbox_clear_q',
  'a:admin_outbox_clear',
]) {
  assert.ok(callbacks.includes(`if (p.a === '${action}') {`), `missing Outbox callback handler: ${action}`);
}
assert.ok(callbacks.includes("backText: '⬅️ Исходящие'"), 'Outbox note return label must stay stable');
assert.ok(callbacks.includes('backCb: commsCb.adminOutboxView(idx, page)'), 'Outbox note must preserve canonical return route');
assert.ok(callbacks.includes('Повтор из исходящих доступен только в <b>личном чате</b> с ботом'), 'Outbox repeat must remain DM-only');
assert.ok(callbacks.includes("templateLabel: 'Повтор из исходящих'"), 'Outbox repeat metadata must stay explicit');
assert.ok(callbacks.includes('retCb: commsCb.adminOutboxView(idx, page)'), 'Outbox repeat must preserve canonical return route');
assert.ok(callbacks.includes(".text('✅ Отправить', `a:adm_umsg_send|tk:${token}|f:all|p:0|wn:1`)"), 'Outbox repeat send confirmation must exist');
assert.ok(callbacks.includes(".text('⚪ Без «Что дальше»', `a:adm_umsg_send|tk:${token}|f:all|p:0|wn:0`)"), 'Outbox repeat no-next-step option must exist');
assert.ok(callbacks.includes(".text('❌ Отмена', commsCb.adminOutboxView(idx, page))"), 'Outbox repeat cancel must return to entry');
assert.ok(callbacks.includes("const label = clipText(`Исходящие ${fmtTs(it?.ts || new Date().toISOString())}`, 48);"), 'Save-to-template must create bounded label');
assert.ok(callbacks.includes('await setAdminDmTemplates('), 'Save-to-template must persist templates');
assert.ok(callbacks.includes('await clearAdminOutbox();'), 'Outbox clear must wipe the Redis log');
assert.ok(callbacks.includes('await renderAdminOutbox(ctx, 0);'), 'Outbox clear must return to first page');

for (const action of ['a:admin_outbox', 'a:admin_outbox_v', 'a:admin_outbox_clear_q', 'a:admin_outbox_clear', 'a:admin_outbox_repeat', 'a:admin_outbox_note', 'a:admin_outbox_to_tpl']) {
  expectRegistry(action, { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
}
expectRegistry('a:admin_comms', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });

console.log('✅ smoke admin-outbox contract OK');
