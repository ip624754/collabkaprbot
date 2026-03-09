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

const renderAdminDmTemplatesSrc = extractBetween(
  botSource,
  'async function renderAdminDmTemplates(ctx, page = 0) {',
  '\n\nasync function renderAdminDmTemplateView(ctx, tplId, backPage = 0) {'
);

const renderAdminDmTemplateViewSrc = extractBetween(
  botSource,
  'async function renderAdminDmTemplateView(ctx, tplId, backPage = 0) {',
  '\n\n  async function renderAdminOutbox(ctx, page = 0) {'
);

const dmTemplatesCallbackSrc = extractBetween(
  botSource,
  '    // --- Admin: DM Templates (Redis-only) ---',
  '\n\n\n    // --- Admin: Cancel reply session in support group ---'
);

const dmTemplatesExpectSrc = extractBetween(
  botSource,
  '// --- Admin: Outbox -> Save as DM template (label input) (STEP204) ---',
  '\n\n    // --- Admin: User Note input (Redis-only) (STEP194) ---'
);

assert.ok(renderAdminDmTemplatesSrc.includes('`📌 <b>Шаблоны сообщений (DM)</b>\\n\\n` +'), 'Admin → DM Templates must keep stable title');
assert.ok(renderAdminDmTemplatesSrc.includes("`Источник: <b>${isCustom ? 'custom (Redis)' : 'default'}</b>\\n` +"), 'Admin → DM Templates must keep source line');
assert.ok(renderAdminDmTemplatesSrc.includes("`Версия: <b>v${Number(tpls.version || 0)}</b>\\n` +"), 'Admin → DM Templates must keep version line');
assert.ok(renderAdminDmTemplatesSrc.includes("`Обновлено: <code>${escapeHtml(tpls.updatedAt || '—')}</code>\\n\\n`"), 'Admin → DM Templates must keep updated-at line');
assert.ok(renderAdminDmTemplatesSrc.includes("text += 'Пока нет шаблонов. Добавь первый через “➕ Новый шаблон”.';"), 'Admin → DM Templates must keep empty-state copy');
assert.ok(renderAdminDmTemplatesSrc.includes("text += 'Список (страница ' + (p + 1) + '/' + pages + '):\\n\\n';"), 'Admin → DM Templates must keep page list heading');
assertMatch(
  renderAdminDmTemplatesSrc,
  /for \(const it of slice\) \{[\s\S]*?kb\.text\(String\(it\.label \|\| '—'\), `a:admin_umsg_tpl_view\|tid:\$\{String\(it\.id \|\| ''\)\}\|p:\$\{p\}`\)\.row\(\);[\s\S]*?\}/s,
  'Admin → DM Templates list must keep per-template view buttons'
);
assertMatch(
  renderAdminDmTemplatesSrc,
  /kb\.text\('➕ Новый шаблон', `a:admin_umsg_tpl_add\|p:\$\{p\}`\)\s*\.text\('♻️ Сбросить к дефолту', `a:admin_umsg_tpl_reset_q\|p:\$\{p\}`\)\s*\.row\(\);/s,
  'Admin → DM Templates list must keep add + reset row'
);
assertMatch(
  renderAdminDmTemplatesSrc,
  /if \(pages > 1\) \{[\s\S]*?kb\.text\('⬅️', `a:admin_umsg_tpls\|p:\$\{prev\}`\)\s*\.text\(`\$\{p \+ 1\}\/\$\{pages\}`, `a:admin_umsg_tpls\|p:\$\{p\}`\)\s*\.text\('➡️', `a:admin_umsg_tpls\|p:\$\{next\}`\)\s*\.row\(\);[\s\S]*?\}/s,
  'Admin → DM Templates list must keep pagination row'
);
assertMatch(
  renderAdminDmTemplatesSrc,
  /kb\.text\('📎 Вставить', `a:adm_ph\|r:tpl_list\|p:\$\{p\}`\)\.row\(\);/s,
  'Admin → DM Templates list must keep placeholder insert shortcut'
);
assert.ok(renderAdminDmTemplatesSrc.includes("kbAdminFooter(kb, '⬅️ Коммуникации', 'a:admin_comms');"), 'Admin → DM Templates list must keep Comms footer');

assert.ok(renderAdminDmTemplateViewSrc.includes("await safeEditOrReply(ctx, '⚠️ Шаблон не найден.'"), 'Admin → DM Templates view must keep missing-template message');
assert.ok(renderAdminDmTemplateViewSrc.includes('`📌 <b>Шаблон</b>\\n\\n` +'), 'Admin → DM Templates view must keep stable title');
assert.ok(renderAdminDmTemplateViewSrc.includes('`ID: <code>${escapeHtml(String(it.id || \'\'))}</code>\\n` +'), 'Admin → DM Templates view must keep ID line');
assert.ok(renderAdminDmTemplateViewSrc.includes('`Название: <b>${escapeHtml(String(it.label || \'\'))}</b>\\n\\n` +'), 'Admin → DM Templates view must keep label line');
assert.ok(renderAdminDmTemplateViewSrc.includes('<pre>${escapeHtml(String(it.text || \'\'))}</pre>'), 'Admin → DM Templates view must keep full text preview');
assert.ok(renderAdminDmTemplateViewSrc.includes('<i>Редактирование: 1-я строка — название, дальше — текст.</i>'), 'Admin → DM Templates view must keep edit hint');
assertMatch(
  renderAdminDmTemplateViewSrc,
  /const kb = new InlineKeyboard\([\s\S]*?\.text\('✏️ Изменить', `a:admin_umsg_tpl_edit\|tid:\$\{String\(it\.id \|\| ''\)\}\|p:\$\{Math\.max\(0, Number\(backPage\) \|\| 0\)\}`\)\s*\.text\('🗑 Удалить', `a:admin_umsg_tpl_del_q\|tid:\$\{String\(it\.id \|\| ''\)\}\|p:\$\{Math\.max\(0, Number\(backPage\) \|\| 0\)\}`\)\s*\.row\(\)\s*\.text\('📎 Вставить', `a:adm_ph\|r:tpl_view\|tid:\$\{String\(it\.id \|\| ''\)\}\|p:\$\{Math\.max\(0, Number\(backPage\) \|\| 0\)\}`\)\s*\.row\(\)\s*\.text\('⬅️ Назад', `a:admin_umsg_tpls\|p:\$\{Math\.max\(0, Number\(backPage\) \|\| 0\)\}`\)\s*\.row\(\);/s,
  'Admin → DM Templates view must keep edit/delete/insert/back controls'
);
assert.ok(renderAdminDmTemplateViewSrc.includes("kbAdminFooter(kb, '⬅️ Коммуникации', 'a:admin_comms');"), 'Admin → DM Templates view must keep Comms footer');

assert.ok(dmTemplatesCallbackSrc.includes("if (p.a === 'a:admin_umsg_tpls') {"), 'Admin → DM Templates list callback must exist');
assert.ok(dmTemplatesCallbackSrc.includes("if (p.a === 'a:admin_umsg_tpl_view') {"), 'Admin → DM Templates view callback must exist');
assert.ok(dmTemplatesCallbackSrc.includes("if (p.a === 'a:admin_umsg_tpl_add') {"), 'Admin → DM Templates add callback must exist');
assert.ok(dmTemplatesCallbackSrc.includes("if (p.a === 'a:admin_umsg_tpl_edit') {"), 'Admin → DM Templates edit callback must exist');
assert.ok(dmTemplatesCallbackSrc.includes("try { await clearExpectText(ctx.from.id); } catch {}"), 'Admin → DM Templates add/edit entry must clear expectText');
assert.ok(dmTemplatesCallbackSrc.includes('➕ <b>Новый шаблон</b>'), 'Admin → DM Templates add screen title must stay stable');
assert.ok(dmTemplatesCallbackSrc.includes('1-я строка — название кнопки'), 'Admin → DM Templates add/edit instructions must keep first-line label rule');
assert.ok(dmTemplatesCallbackSrc.includes("type: 'admin_umsg_tpl_add', page"), 'Admin → DM Templates add callback must set expectText type');
assert.ok(dmTemplatesCallbackSrc.includes('✏️ <b>Изменить шаблон</b>'), 'Admin → DM Templates edit screen title must stay stable');
assert.ok(dmTemplatesCallbackSrc.includes("type: 'admin_umsg_tpl_edit', tplId: String(it.id || ''), page"), 'Admin → DM Templates edit callback must set expectText type');
assert.ok(dmTemplatesCallbackSrc.includes("if (p.a === 'a:admin_umsg_tpl_del_q') {"), 'Admin → DM Templates delete-confirm callback must exist');
assert.ok(dmTemplatesCallbackSrc.includes('🗑 <b>Удалить шаблон?</b>'), 'Admin → DM Templates delete-confirm text must stay stable');
assertMatch(
  dmTemplatesCallbackSrc,
  /const kb = new InlineKeyboard\([\s\S]*?\.text\('🗑 Удалить', `a:admin_umsg_tpl_del\|tid:\$\{tplId\}\|p:\$\{page\}`\)\s*\.text\('❌ Отмена', `a:admin_umsg_tpl_view\|tid:\$\{tplId\}\|p:\$\{page\}`\)\s*\.row\(\)\s*\.text\('⬅️ Назад', `a:admin_umsg_tpls\|p:\$\{page\}`\)\s*\.row\(\);/s,
  'Admin → DM Templates delete-confirm must keep confirm/cancel/back controls'
);
assert.ok(dmTemplatesCallbackSrc.includes("if (p.a === 'a:admin_umsg_tpl_del') {"), 'Admin → DM Templates delete callback must exist');
assert.ok(dmTemplatesCallbackSrc.includes("items.filter((t) => String(t?.id || '') !== tplId)"), 'Admin → DM Templates delete must filter target template by id');
assert.ok(dmTemplatesCallbackSrc.includes('version: Number(tpls.version || 0) + 1'), 'Admin → DM Templates delete must bump version');
assert.ok(dmTemplatesCallbackSrc.includes('await renderAdminDmTemplates(ctx, page);'), 'Admin → DM Templates delete must return to list');
assert.ok(dmTemplatesCallbackSrc.includes("if (p.a === 'a:admin_umsg_tpl_reset_q') {"), 'Admin → DM Templates reset-confirm callback must exist');
assert.ok(dmTemplatesCallbackSrc.includes('♻️ <b>Сбросить шаблоны к дефолту?</b>'), 'Admin → DM Templates reset-confirm text must stay stable');
assert.ok(dmTemplatesCallbackSrc.includes("if (p.a === 'a:admin_umsg_tpl_reset') {"), 'Admin → DM Templates reset callback must exist');
assert.ok(dmTemplatesCallbackSrc.includes('await resetAdminDmTemplates();'), 'Admin → DM Templates reset must call reset helper');
assert.ok(dmTemplatesCallbackSrc.includes('Кастомные шаблоны в Redis будут удалены.'), 'Admin → DM Templates reset-confirm must keep Redis warning');

assert.ok(dmTemplatesExpectSrc.includes("if (exp.type === 'adm_outbox_tpl_label') {"), 'Admin → DM Templates must keep Outbox save-to-template expect handler');
assert.ok(dmTemplatesExpectSrc.includes("'Эта операция доступна только в личном чате (DM) с ботом.'"), 'Admin → DM Templates save-from-Outbox must stay DM-only');
assert.ok(dmTemplatesExpectSrc.includes("items.unshift({ id, label: safeLabel, text: safeText });"), 'Admin → DM Templates save-from-Outbox must keep new template on top');
assertMatch(
  dmTemplatesExpectSrc,
  /const kb = new InlineKeyboard\([\s\S]*?\.text\('📌 Открыть шаблон', `a:admin_umsg_tpl_view\|tid:\$\{id\}\|p:0`\)\s*\.row\(\)\s*\.text\('📌 Шаблоны DM', 'a:admin_umsg_tpls\|p:0'\)\s*\.text\('📤 Outbox', `a:admin_outbox_v\|i:\$\{idx\}\|p:\$\{page\}`\)\s*\.row\(\);/s,
  'Admin → DM Templates save-from-Outbox must keep open-template + templates + Outbox return buttons'
);
assert.ok(dmTemplatesExpectSrc.includes('Текст был обрезан до ${TG_SAFE_BODY_MAX} символов'), 'Admin → DM Templates save-from-Outbox must keep clip warning');
assert.ok(dmTemplatesExpectSrc.includes("if (exp.type === 'admin_umsg_tpl_add') {"), 'Admin → DM Templates add expect handler must exist');
assert.ok(dmTemplatesExpectSrc.includes('const { label, text } = parseAdminDmTemplateFromText(raw);'), 'Admin → DM Templates add/edit expect must parse label+text from one message');
assert.ok(dmTemplatesExpectSrc.includes('Нужно 2 части: 1-я строка — название, дальше — текст. Попробуй ещё раз.'), 'Admin → DM Templates add/edit invalid-format prompt must stay stable');
assert.ok(dmTemplatesExpectSrc.includes("const safeLabel = clipText(label, 48).trim();"), 'Admin → DM Templates add/edit must clip label length');
assert.ok(dmTemplatesExpectSrc.includes("const textMeta = clipCodepoints(text, TG_SAFE_BODY_MAX);"), 'Admin → DM Templates add/edit must clip text to Telegram-safe limit');
assert.ok(dmTemplatesExpectSrc.includes("items.push({ id, label: safeLabel, text: safeText });"), 'Admin → DM Templates add expect must append new template');
assert.ok(dmTemplatesExpectSrc.includes("await setAdminDmTemplates({ version: Number(tpls.version || 0) + 1, updatedAt: new Date().toISOString(), items });"), 'Admin → DM Templates add/edit must persist version bump');
assert.ok(dmTemplatesExpectSrc.includes("await renderAdminDmTemplates(ctx, page);"), 'Admin → DM Templates add expect must return to template list');
assert.ok(dmTemplatesExpectSrc.includes("if (exp.type === 'admin_umsg_tpl_edit') {"), 'Admin → DM Templates edit expect handler must exist');
assert.ok(dmTemplatesExpectSrc.includes("await ctx.reply('⚠️ Нет ID шаблона.');"), 'Admin → DM Templates edit expect must guard missing id');
assert.ok(dmTemplatesExpectSrc.includes("await ctx.reply('⚠️ Шаблон не найден (возможно, уже удалён).');"), 'Admin → DM Templates edit expect must guard deleted template');
assert.ok(dmTemplatesExpectSrc.includes("items[idx] = { id: tplId, label: safeLabel, text: safeText };"), 'Admin → DM Templates edit expect must replace exact template');
assert.ok(dmTemplatesExpectSrc.includes("await renderAdminDmTemplateView(ctx, tplId, page);"), 'Admin → DM Templates edit expect must return to template view');
assert.ok(dmTemplatesExpectSrc.includes('Текст шаблона был обрезан до ${TG_SAFE_BODY_MAX} символов'), 'Admin → DM Templates add/edit expect must keep clip warning');

expectRegistry('a:admin_umsg_tpls', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_umsg_tpl_view', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_umsg_tpl_add', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_umsg_tpl_edit', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_umsg_tpl_del_q', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_umsg_tpl_del', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_umsg_tpl_reset_q', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_umsg_tpl_reset', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:adm_ph', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:admin_comms', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_outbox_to_tpl', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_outbox_v', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:menu', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:home', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });

console.log('✅ smoke admin-dm-templates contract OK');
