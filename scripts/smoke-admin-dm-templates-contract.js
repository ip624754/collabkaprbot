#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTION_GUARD, ACTION_REGISTRY, ACTION_TYPES } from '../src/bot/actionRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'bot.js'), 'utf8');

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `marker not found: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `end marker not found after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}
function registry(action, type = ACTION_TYPES.ADMIN, guard = ACTION_GUARD.REQUIRE_REDIS) {
  const meta = ACTION_REGISTRY[action];
  assert.ok(meta, `missing registry entry: ${action}`);
  assert.equal(meta.type, type, `unexpected type for ${action}`);
  assert.equal(meta.guard, guard, `unexpected guard for ${action}`);
}

const list = between('async function renderAdminDmTemplates(ctx, page = 0) {', '\n\nasync function renderAdminDmTemplateView(ctx, tplId, backPage = 0) {');
const view = between('async function renderAdminDmTemplateView(ctx, tplId, backPage = 0) {', '\n\n  async function renderAdminOutbox(ctx, page = 0) {');
const callbacks = between("if (p.a === 'a:admin_umsg_tpls') {", "\nif (p.a === 'a:bc_start') {");

assert.ok(list.includes('📌 <b>Шаблоны личных сообщений</b>'), 'DM template list title must exist');
assert.ok(list.includes("${isCustom ? 'Redis custom' : 'default bundle'}"), 'DM template source truth must exist');
assert.ok(list.includes('${Number(tpls.version || 0)}'), 'DM template version must exist');
assert.ok(list.includes('Шаблонов пока нет.'), 'DM template empty state must exist');
assert.ok(list.includes('a:admin_umsg_tpl_view|tid:${String(it.id || \'\')}|p:${p}'), 'DM template list must link to exact template');
assert.ok(list.includes('a:admin_umsg_tpl_add|p:${p}'), 'DM template add action must exist');
assert.ok(list.includes('a:admin_umsg_tpl_reset_q|p:${p}'), 'DM template reset confirmation must exist');
assert.ok(list.includes("kbAdminFooter(kb, '⬅️ Коммуникации', 'a:admin_comms');"), 'DM template list must return to Comms');

assert.ok(view.includes('⚠️ Шаблон не найден.'), 'DM template missing state must exist');
assert.ok(view.includes('📌 <b>Шаблон</b>'), 'DM template view title must exist');
assert.ok(view.includes('<pre>${escapeHtml(String(it.text || \'\'))}</pre>'), 'DM template full text preview must exist');
assert.ok(view.includes('a:admin_umsg_tpl_edit|tid:${String(it.id || \'\')}'), 'DM template edit action must exist');
assert.ok(view.includes('a:admin_umsg_tpl_del_q|tid:${String(it.id || \'\')}'), 'DM template delete confirmation must exist');
assert.ok(view.includes('a:admin_umsg_tpls|p:${Math.max(0, Number(backPage) || 0)}'), 'DM template view must return to list');
assert.ok(view.includes("kbAdminFooter(kb, '⬅️ Коммуникации', 'a:admin_comms');"), 'DM template view must return to Comms');

for (const action of [
  'a:admin_umsg_tpls', 'a:admin_umsg_tpl_view', 'a:admin_umsg_tpl_add',
  'a:admin_umsg_tpl_edit', 'a:admin_umsg_tpl_del_q', 'a:admin_umsg_tpl_del',
  'a:admin_umsg_tpl_reset_q', 'a:admin_umsg_tpl_reset',
]) {
  assert.ok(callbacks.includes(`if (p.a === '${action}') {`), `missing DM template handler: ${action}`);
  registry(action);
}
assert.ok(callbacks.includes("type: 'admin_umsg_tpl_add'"), 'DM template add must set expectText state');
assert.ok(callbacks.includes("type: 'admin_umsg_tpl_edit'"), 'DM template edit must set expectText state');
assert.ok(callbacks.includes('await setAdminDmTemplates('), 'DM template mutations must persist');
assert.ok(callbacks.includes('await resetAdminDmTemplates();'), 'DM template reset helper must be called');
assert.ok(callbacks.includes('await renderAdminDmTemplates(ctx, page);'), 'DM template delete must return to list');
assert.ok(callbacks.includes('await renderAdminDmTemplateView(ctx, String(p.tid || \'\'),'), 'DM template view handler must use requested id');

registry('a:admin_outbox_to_tpl');
registry('a:admin_comms');
registry('a:adm_ph', ACTION_TYPES.ADMIN, ACTION_GUARD.NONE);

console.log('✅ smoke admin-dm-templates contract OK');
