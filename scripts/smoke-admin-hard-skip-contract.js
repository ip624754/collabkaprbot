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

const hardSkipExportHelperSrc = extractBetween(
  botSource,
  "async function adminHardSkipHitsExport(reasonFilter = 'all', limit = ADMIN_HS_HITS_EXPORT_LIMIT) {",
  '\n\n\nasync function renderAdminHardSkipHome(ctx, page = 0) {'
);
const renderAdminHardSkipHomeSrc = extractBetween(
  botSource,
  'async function renderAdminHardSkipHome(ctx, page = 0) {',
  "\n\n\nasync function renderAdminHardSkipHits(ctx, page = 0, reasonFilter = 'all', opts = {}) {"
);
const renderAdminHardSkipHitsSrc = extractBetween(
  botSource,
  "async function renderAdminHardSkipHits(ctx, page = 0, reasonFilter = 'all', opts = {}) {",
  '\n\nasync function renderAdminHardSkipView(ctx, tgId, opts = {}) {'
);
const renderAdminHardSkipViewSrc = extractBetween(
  botSource,
  'async function renderAdminHardSkipView(ctx, tgId, opts = {}) {',
  '\n\nasync function renderAdminSysNotice(ctx) {'
);
const hardSkipCallbacksSrc = extractBetween(
  botSource,
  '    // --- Admin: Broadcast hard-skip list (Redis-only, manage dead chats) ---',
  '\n\n    // --- Admin: System Notice (Redis-only, no broadcast) ---'
);
const hardSkipExpectSrc = extractBetween(
  botSource,
  "    if (exp.type === 'hs_find') {",
  "\n\n    if (exp.type === 'adm_gift_users') {"
);

assert.ok(hardSkipExportHelperSrc.includes("const rf = String(reasonFilter || 'all').trim().toLowerCase();"), 'Admin → Hard-skip export helper must normalize reason filter');
assert.ok(hardSkipExportHelperSrc.includes('const scanN = Math.max(200, Math.min(2000, ADMIN_HS_HITS_SAMPLE_LIMIT));'), 'Admin → Hard-skip export helper must keep bounded Redis scan window');
assert.ok(hardSkipExportHelperSrc.includes('const out = filtered.slice(0, Math.max(1, Number(limit || 200) || 200));'), 'Admin → Hard-skip export helper must keep export limit guard');
assert.ok(hardSkipExportHelperSrc.includes("return { ok: true, reason: rf || 'all', scanN, total: filtered.length, items: out };"), 'Admin → Hard-skip export helper must keep ok result shape');

assert.ok(renderAdminHardSkipHomeSrc.includes("let text = '🧱 <b>Hard-skip (dead chats)</b>\\n\\n';"), 'Admin → Hard-skip home must keep stable title');
assert.ok(renderAdminHardSkipHomeSrc.includes("const ttlDays = envInt('BROADCAST_HARD_SKIP_TTL_DAYS', 90, { min: 1, max: 365 });"), 'Admin → Hard-skip home must bind bounded ttlDays before render');
assert.ok(renderAdminHardSkipHomeSrc.includes("text += `TTL configured: <b>${ttlDays}</b> дн.\\n\\n`;"), 'Admin → Hard-skip home must keep TTL configured line');
assert.ok(renderAdminHardSkipHomeSrc.includes("text += '⚠️ Redis недоступен — список временно недоступен.\\n';"), 'Admin → Hard-skip home must keep redis unavailable helper');
assert.ok(renderAdminHardSkipHomeSrc.includes("text += 'Пока пусто.\\n';"), 'Admin → Hard-skip home must keep empty-state');
assertMatch(renderAdminHardSkipHomeSrc, /kb\.text\('🔎 Найти TG ID', `a:hs_find\|p:\$\{p\}`\)\.row\(\);/s, 'Admin → Hard-skip home must keep find button');
assertMatch(renderAdminHardSkipHomeSrc, /kb\.text\('🧾 Последние пропуски', `a:hs_hits\|p:\$\{p\}\|r:all`\)\.row\(\);/s, 'Admin → Hard-skip home must keep hits button');
assertMatch(renderAdminHardSkipHomeSrc, /kb\.text\(`tg:\$\{it\.tgId\}`, `a:hs_view\|tg:\$\{it\.tgId\}`\)\.row\(\);/s, 'Admin → Hard-skip home must keep per-entry view buttons');
assertMatch(renderAdminHardSkipHomeSrc, /if \(p > 0\) kb\.text\('⬅️', `a:hs_home\|p:\$\{p - 1\}`\);\s*kb\.text\('➡️', `a:hs_home\|p:\$\{p \+ 1\}`\);/s, 'Admin → Hard-skip home must keep pagination controls');
assert.ok(renderAdminHardSkipHomeSrc.includes("kb.row().text('⬅️ Система', 'a:admin_sys').row().text('⬅️ Админка', 'a:admin_home');"), 'Admin → Hard-skip home must keep System/Admin footer');

assert.ok(renderAdminHardSkipHitsSrc.includes("let text = `🧾 <b>Hard-skip HITs (пропуски)</b>\n\n`;"), 'Admin → Hard-skip hits must keep stable title');
assert.ok(renderAdminHardSkipHitsSrc.includes('Показывает последние случаи, когда рассылка <b>пропустила</b> отправку из‑за hard-skip (dead chats).'), 'Admin → Hard-skip hits must keep helper copy');
assert.ok(renderAdminHardSkipHitsSrc.includes("text += `Фильтр: <b>${filterLabel}</b> · окно: последние <code>${hits.scanN || ADMIN_HS_HITS_SAMPLE_LIMIT}</code> HITs\n\n`;"), 'Admin → Hard-skip hits must keep filter/window line');
assert.ok(renderAdminHardSkipHitsSrc.includes("text += `Сегодня: ${top}\n\n`;"), 'Admin → Hard-skip hits must keep top reasons summary');
assert.ok(renderAdminHardSkipHitsSrc.includes("text += 'Пока пусто (по текущему фильтру/окну).\\n';"), 'Admin → Hard-skip hits must keep empty-state');
assertMatch(renderAdminHardSkipHitsSrc, /kb\.text\('🧱 Список \(set\)', `a:hs_home\|p:0`\)\.text\('🔎 Найти TG ID', `a:hs_find\|p:0`\)\.row\(\);/s, 'Admin → Hard-skip hits must keep home/find row');
assertMatch(renderAdminHardSkipHitsSrc, /kb\.text\(fAll, `a:hs_hits\|p:0\|r:all`\);/s, 'Admin → Hard-skip hits must keep ALL filter');
assertMatch(renderAdminHardSkipHitsSrc, /kb\.text\('🗒 Export last 200', `a:hs_hits_export\|p:\$\{p\}\|r:\$\{rf\}`\)\.row\(\);/s, 'Admin → Hard-skip hits must keep export button');
assertMatch(renderAdminHardSkipHitsSrc, /kb\.text\(`tg:\$\{it\.tgId\}`, `a:hs_view\|tg:\$\{it\.tgId\}`\)\.row\(\);/s, 'Admin → Hard-skip hits must keep quick view buttons');
assertMatch(renderAdminHardSkipHitsSrc, /if \(p > 0\) kb\.text\('⬅️', `a:hs_hits\|p:\$\{p - 1\}\|r:\$\{rf\}`\);\s*kb\.text\('➡️', `a:hs_hits\|p:\$\{p \+ 1\}\|r:\$\{rf\}`\);/s, 'Admin → Hard-skip hits must keep pagination controls');
assert.ok(renderAdminHardSkipHitsSrc.includes("kb.row().text('⬅️ Система', 'a:admin_sys').row().text('⬅️ Админка', 'a:admin_home');"), 'Admin → Hard-skip hits must keep System/Admin footer');

assert.ok(renderAdminHardSkipViewSrc.includes("let text = `🧱 <b>Hard-skip status</b>\\n\\nTG ID: <code>${id || 0}</code>\\n`;"), 'Admin → Hard-skip view must keep stable title');
assert.ok(renderAdminHardSkipViewSrc.includes('нет hard-skip'), 'Admin → Hard-skip view must keep no-hard-skip state');
assert.ok(renderAdminHardSkipViewSrc.includes('<b>hard-skip</b>'), 'Admin → Hard-skip view must keep hard-skip state');
assert.ok(renderAdminHardSkipViewSrc.includes("if (st.exists) kb.text('🧹 Снять hard-skip', `a:hs_unskip|tg:${id}`).row();"), 'Admin → Hard-skip view must keep unskip control');
assert.ok(renderAdminHardSkipViewSrc.includes("kb.text('⬅️ Назад', 'a:hs_home|p:0').row();"), 'Admin → Hard-skip view must keep Back control');
assert.ok(renderAdminHardSkipViewSrc.includes("kb.text('⬅️ Система', 'a:admin_sys').row().text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');"), 'Admin → Hard-skip view must keep System/Menu/Home footer');

assert.ok(hardSkipExpectSrc.includes("const m = raw.match(/(\\d{5,})/);"), 'Admin → Hard-skip find expectText must keep TG ID digits parse');
assert.ok(hardSkipExpectSrc.includes("await ctx.reply('Нужен TG ID цифрами. Пример: 222047659');"), 'Admin → Hard-skip find expectText must keep invalid TG ID prompt');
assert.ok(hardSkipExpectSrc.includes('await renderAdminHardSkipView(ctx, id);'), 'Admin → Hard-skip find expectText must rerender status view');

assert.ok(hardSkipCallbacksSrc.includes("if (p.a === 'a:hs_home') {"), 'Admin → Hard-skip home callback must exist');
assert.ok(hardSkipCallbacksSrc.includes("if (p.a === 'a:hs_hits') {"), 'Admin → Hard-skip hits callback must exist');
assert.ok(hardSkipCallbacksSrc.includes("if (p.a === 'a:hs_find') {"), 'Admin → Hard-skip find callback must exist');
assert.ok(hardSkipCallbacksSrc.includes("if (p.a === 'a:hs_view') {"), 'Admin → Hard-skip view callback must exist');
assert.ok(hardSkipCallbacksSrc.includes("if (p.a === 'a:hs_unskip') {"), 'Admin → Hard-skip unskip callback must exist');
assert.ok(hardSkipCallbacksSrc.includes("if (p.a === 'a:hs_hits_export') {"), 'Admin → Hard-skip export callback must exist');
assert.ok(hardSkipCallbacksSrc.includes("await safeEditOrReply(ctx, '🔎 Введи TG ID (число), чтобы проверить hard-skip статус.\\n\\nПример: <code>222047659</code>'"), 'Admin → Hard-skip find callback must keep find prompt');
assert.ok(hardSkipCallbacksSrc.includes("await setExpectText(ctx.from.id, { type: 'hs_find', backCb: `a:hs_home|p:${page}` }, 10 * 60);"), 'Admin → Hard-skip find callback must keep expectText wiring');
assert.ok(hardSkipCallbacksSrc.includes("await adminHardSkipUnskip(tgId);"), 'Admin → Hard-skip unskip callback must keep Redis DEL path');
assert.ok(hardSkipCallbacksSrc.includes("await renderAdminHardSkipView(ctx, tgId, { toast: '✅ Снято' });"), 'Admin → Hard-skip unskip callback must rerender status view with toast');
assert.ok(hardSkipCallbacksSrc.includes("const ex = await adminHardSkipHitsExport(rf);"), 'Admin → Hard-skip export callback must use export helper');
assert.ok(hardSkipCallbacksSrc.includes("await ctx.answerCallbackQuery({ text: 'Готовлю экспорт…' });"), 'Admin → Hard-skip export callback must keep initial toast');
assert.ok(hardSkipCallbacksSrc.includes("'⚠️ Redis недоступен — экспорт временно недоступен.'"), 'Admin → Hard-skip export callback must keep Redis unavailable rerender toast');
assert.ok(hardSkipCallbacksSrc.includes("new InputFile(Buffer.from(txt, 'utf-8'), filename)"), 'Admin → Hard-skip export callback must export TXT document');
assert.ok(hardSkipCallbacksSrc.includes("caption: `📤 Export: ${ex.items.length} HITs · фильтр: ${tag}`"), 'Admin → Hard-skip export callback must keep export caption');
assert.ok(hardSkipCallbacksSrc.includes(".text('🧾 HITs', `a:hs_hits|p:${page}|r:${rf}`)"), 'Admin → Hard-skip export document must keep back-to-HITs button');
assert.ok(hardSkipCallbacksSrc.includes("await renderAdminHardSkipHits(ctx, page, rf, { toast: `📤 Export ready: ${ex.items.length}` });"), 'Admin → Hard-skip export callback must rerender hits screen with toast');

expectRegistry('a:hs_home', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:hs_hits', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:hs_hits_export', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:hs_find', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:hs_view', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:hs_unskip', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:admin_sys', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_home', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:menu', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:home', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });

console.log('✅ smoke admin-hard-skip contract OK');
