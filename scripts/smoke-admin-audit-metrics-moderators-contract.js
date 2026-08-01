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
const adminModeratorCallbacksSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'domains', 'adminOperations', 'moderatorCallbacks.js'), 'utf8');

const renderAdminMetricsSrc = extractBetween(
  botSource,
  'async function renderAdminMetrics(ctx, days = 14) {',
  '\n\nasync function renderAdminModerators(ctx) {'
);

const renderAdminModeratorsSrc = extractBetween(
  botSource,
  'async function renderAdminModerators(ctx) {',
  '\n\n// Admin: Users directory state (search query stored in Redis per admin)'
);

const renderAdminAuditSrc = extractBetween(
  botSource,
  'async function renderAdminAudit(ctx, { afterHours = 24, page = 0 } = {}) {',
  '\n\nasync function sendAdminAuditExport(ctx, afterHours = 24) {'
);

const sendAdminAuditExportSrc = extractBetween(
  botSource,
  'async function sendAdminAuditExport(ctx, afterHours = 24) {',
  '\n\n\nasync function renderAdminUsers(ctx, filterRaw = \'all\', page = 0) {'
);

const auditMetricsModeratorsCallbacksSrc = extractBetween(
  botSource,
  "    if (p.a === 'a:aud') {",
  "\n    // Admin: QStash status / signed ping (Redis-only metrics)"
) + '\n' + adminModeratorCallbacksSource;

const auditSearchExpectTextSrc = extractBetween(
  botSource,
  "    if (exp.type === 'aud_search') {",
  "\n// Add curator by username"
);

const moderatorAddExpectTextSrc = extractBetween(
  botSource,
  "    if (exp.type === 'admin_add_mod_username') {",
  "\n\n    // Умный подбор: бриф после оплаты"
);

assert.ok(renderAdminMetricsSrc.includes("const d = Math.max(1, Math.min(90, Number(days) || 14));"), 'Admin → Metrics must clamp window to 1..90 days');
assert.ok(renderAdminMetricsSrc.includes('const snap = await db.getAdminMetricsSnapshot(d);'), 'Admin → Metrics must read metrics snapshot helper');
assert.ok(renderAdminMetricsSrc.includes('📈 <b>Метрики</b> · окно <b>${d}д</b>'), 'Admin → Metrics must keep stable title');
assert.ok(renderAdminMetricsSrc.includes('👥 Пользователи:'), 'Admin → Metrics must keep users summary');
assert.ok(renderAdminMetricsSrc.includes('📣 Каналы:'), 'Admin → Metrics must keep workspaces summary');
assert.ok(renderAdminMetricsSrc.includes('🎁 Конкурсы:'), 'Admin → Metrics must keep giveaways summary');
assert.ok(renderAdminMetricsSrc.includes('📦 Офферы:'), 'Admin → Metrics must keep offers summary');
assert.ok(renderAdminMetricsSrc.includes("💳 <b>Payments</b> (за ${d}д)"), 'Admin → Metrics must keep payments summary block');
assert.ok(renderAdminMetricsSrc.includes("📊 <b>Активность</b>"), 'Admin → Metrics must keep analytics block header');
assert.ok(renderAdminMetricsSrc.includes("DAU(24h): <b>${escapeHtml(String(topline.dau_24h ?? 0))}</b>"), 'Admin → Metrics must keep DAU line');
assert.ok(renderAdminMetricsSrc.includes("📅 Последние дни (MSK)"), 'Admin → Metrics must keep daily analytics table heading');
assert.ok(renderAdminMetricsSrc.includes("ℹ️ Analytics выключены (ANALYTICS_ENABLED=false) — показываю базовые счётчики."), 'Admin → Metrics must keep analytics-off fallback');
assertMatch(
  renderAdminMetricsSrc,
  /const kb = new InlineKeyboard\(\)\s*\.text\('7д', 'a:admin_metrics\|d:7'\)\s*\.text\('14д', 'a:admin_metrics\|d:14'\)\s*\.row\(\)\s*\.text\('30д', 'a:admin_metrics\|d:30'\)\s*\.text\('90д', 'a:admin_metrics\|d:90'\)\s*\.row\(\)\s*\.text\('⬅️ Операции', 'a:admin_ops'\)\s*\.row\(\)\s*\.text\('📋 Меню', 'a:menu'\)\s*\.text\('🏠 Домой', 'a:home'\);/s,
  'Admin → Metrics must keep day-window controls and footer'
);

assert.ok(renderAdminModeratorsSrc.includes("let text = `📋 <b>Модераторы</b>"), 'Admin → Moderators must keep stable title');
assert.ok(renderAdminModeratorsSrc.includes("Пока нет модераторов."), 'Admin → Moderators must keep empty-state text');
assert.ok(renderAdminModeratorsSrc.includes("const who = r.tg_username ? '@' + r.tg_username : 'id ' + r.tg_id;"), 'Admin → Moderators must keep username/id fallback');
assertMatch(
  renderAdminModeratorsSrc,
  /const kb = new InlineKeyboard\(\)\s*\.text\('➕ Добавить модератора', 'a:admin_mod_add'\)\s*\.row\(\);/s,
  'Admin → Moderators must keep add button'
);
assertMatch(
  renderAdminModeratorsSrc,
  /for \(const r of rows\) \{[\s\S]*?kb\.text\(`🗑 \$\{who\}`, `a:admin_mod_rm\|uid:\$\{r\.user_id\}`\)\.row\(\);[\s\S]*?\}/s,
  'Admin → Moderators must keep per-row remove buttons'
);
assertMatch(
  renderAdminModeratorsSrc,
  /kb\.text\('⬅️ Система', 'a:admin_sys'\)\s*\.row\(\)\s*\.text\('📋 Меню', 'a:menu'\)\s*\.text\('🏠 Домой', 'a:home'\);/s,
  'Admin → Moderators must keep back/footer buttons'
);

assert.ok(renderAdminAuditSrc.includes('const opts = { action, wsId, userId, afterHours: h, limit: limit + 1, offset };'), 'Admin → Audit must keep query object with action/ws/user/time window');
assert.ok(renderAdminAuditSrc.includes("const timeLabels = { 24: '24ч', 168: '7д', 720: '30д', 0: 'Всё' };"), 'Admin → Audit must keep stable time-label map');
assert.ok(renderAdminAuditSrc.includes("searchLine = `\\n🔎 Действие: <code>${escapeHtml(action)}</code>`;"), 'Admin → Audit must keep action search line');
assert.ok(renderAdminAuditSrc.includes("searchLine = `\\n🔎 Пространство: <code>${wsId}</code>`;"), 'Admin → Audit must keep workspace search line');
assert.ok(renderAdminAuditSrc.includes("searchLine = `\\n🔎 Пользователь: <code>${userId}</code>`;"), 'Admin → Audit must keep user search line');
assert.ok(renderAdminAuditSrc.includes("let text = `📜 <b>Журнал аудита</b> · ${timeLabel} · стр ${p + 1}${searchLine}\\n\\n`;"), 'Admin → Audit must keep stable title');
assert.ok(renderAdminAuditSrc.includes("text += 'Событий нет.';"), 'Admin → Audit must keep empty-state text');
assert.ok(renderAdminAuditSrc.includes("kb.text('🔎 Поиск', `a:aud_search|h:${h}`);"), 'Admin → Audit must keep search button');
assert.ok(renderAdminAuditSrc.includes("if (sq) kb.text('🧹 Сброс', `a:aud_reset|h:${h}`);"), 'Admin → Audit must keep reset button');
assert.ok(renderAdminAuditSrc.includes("kb.text('📤 Скачать TXT', `a:aud_export|h:${h}`).row();"), 'Admin → Audit must keep export button');
assert.ok(renderAdminAuditSrc.includes("if (p > 0) kb.text('⬅️', `a:aud|h:${h}|p:${p - 1}`);"), 'Admin → Audit must keep previous-page button');
assert.ok(renderAdminAuditSrc.includes("if (hasNext) kb.text('➡️', `a:aud|h:${h}|p:${p + 1}`);"), 'Admin → Audit must keep next-page button');
assert.ok(renderAdminAuditSrc.includes("kb.text('⬅️ Операции', 'a:admin_ops');"), 'Admin → Audit must keep back-to-Ops button');
assertMatch(
  renderAdminAuditSrc,
  /kb\.text\(tb\('24ч', 24\), `a:aud\|h:24\|p:0`\)\s*\.text\(tb\('7д', 168\), `a:aud\|h:168\|p:0`\)\s*\.text\(tb\('30д', 720\), `a:aud\|h:720\|p:0`\)\s*\.text\(tb\('Всё', 0\), `a:aud\|h:0\|p:0`\)\s*\.row\(\);/s,
  'Admin → Audit must keep all time-filter controls'
);

assert.ok(sendAdminAuditExportSrc.includes("⚠️ Лимит 5000 — сузьте фильтр."), 'Admin → Audit export must keep truncation warning');
assertMatch(
  sendAdminAuditExportSrc,
  /reply_markup: new InlineKeyboard\(\)\s*\.text\('⬅️ Журнал аудита', `a:aud\|h:\$\{afterHours\}\|p:0`\)\s*\.text\('⬅️ Админка', 'a:admin_home'\)\s*\.row\(\)\s*\.text\('📋 Меню', 'a:menu'\)\s*\.text\('🏠 Домой', 'a:home'\)/s,
  'Admin → Audit export must keep back/menu/footer buttons'
);

assert.ok(auditMetricsModeratorsCallbacksSrc.includes("if (p.a === 'a:aud') {"), 'Admin → Audit callback must exist');
assert.ok(auditMetricsModeratorsCallbacksSrc.includes("if (p.a === 'a:aud_search') {"), 'Admin → Audit search callback must exist');
assert.ok(auditMetricsModeratorsCallbacksSrc.includes("if (p.a === 'a:aud_reset') {"), 'Admin → Audit reset callback must exist');
assert.ok(auditMetricsModeratorsCallbacksSrc.includes("if (p.a === 'a:aud_export') {"), 'Admin → Audit export callback must exist');
assert.ok(auditMetricsModeratorsCallbacksSrc.includes("if (p.a === 'a:admin_metrics') {"), 'Admin → Metrics callback must exist');
assert.ok(auditMetricsModeratorsCallbacksSrc.includes("if (p.a === 'a:admin_mod_list') {"), 'Admin → Moderators list callback must exist');
assert.ok(auditMetricsModeratorsCallbacksSrc.includes("if (p.a === 'a:admin_mod_add') {"), 'Admin → Moderators add callback must exist');
assert.ok(auditMetricsModeratorsCallbacksSrc.includes("if (p.a === 'a:admin_mod_rm') {"), 'Admin → Moderators remove callback must exist');
assertMatch(
  auditMetricsModeratorsCallbacksSrc,
  /if \(p\.a === 'a:aud'\) \{[\s\S]*?try \{ await clearExpectText\(ctx\.from\.id\); \} catch \{\}[\s\S]*?await renderAdminAudit\(ctx, \{ afterHours: h, page \}\);[\s\S]*?\}/s,
  'Admin → Audit callback must clear expectText and rerender audit list'
);
assert.ok(auditMetricsModeratorsCallbacksSrc.includes("await setExpectText(ctx.from.id, { type: 'aud_search', h }, 15 * 60);"), 'Admin → Audit search callback must set expectText');
assert.ok(auditMetricsModeratorsCallbacksSrc.includes("await clearAdminAuditQuery(ctx.from.id);"), 'Admin → Audit reset callback must clear saved query');
assert.ok(auditMetricsModeratorsCallbacksSrc.includes("await sendAdminAuditExport(ctx, h);"), 'Admin → Audit export callback must call export helper');
assert.ok(auditMetricsModeratorsCallbacksSrc.includes("const days = Math.max(1, Math.min(90, Number(p.d) || 14));"), 'Admin → Metrics callback must clamp day window');
assert.ok(auditMetricsModeratorsCallbacksSrc.includes("await renderAdminMetrics(ctx, days);"), 'Admin → Metrics callback must rerender metrics');
assert.ok(auditMetricsModeratorsCallbacksSrc.includes("await renderAdminModerators(ctx);"), 'Admin → Moderators list callback must rerender list');
assert.ok(auditMetricsModeratorsCallbacksSrc.includes("await safeEditOrReply(ctx, '➕ Введи @username модератора (он должен иметь username).', { reply_markup: new InlineKeyboard().text('⬅️ Отмена', 'a:admin_home') });"), 'Admin → Moderators add callback must keep stable prompt and cancel button');
assert.ok(auditMetricsModeratorsCallbacksSrc.includes("await setExpectText(ctx.from.id, { type: 'admin_add_mod_username' });"), 'Admin → Moderators add callback must set expectText');
assert.ok(auditMetricsModeratorsCallbacksSrc.includes("await db.removeNetworkModerator(Number(p.uid));"), 'Admin → Moderators remove callback must delete moderator in DB');
assert.ok(auditMetricsModeratorsCallbacksSrc.includes("try { await invalidateRoleFlagsCache(Number(p.uid)); } catch {}"), 'Admin → Moderators remove callback must invalidate role cache');

assert.ok(auditSearchExpectTextSrc.includes("let raw = String(ctx.message?.text || '').trim();"), 'Admin → Audit search expectText must read message text');
assert.ok(auditSearchExpectTextSrc.includes("await ctx.reply('Введи запрос (action / ws:ID / user:ID).');"), 'Admin → Audit search expectText must keep empty-input prompt');
assert.ok(auditSearchExpectTextSrc.includes("const q = { action: '', wsId: 0, userId: 0 };"), 'Admin → Audit search expectText must keep structured query object');
assert.ok(auditSearchExpectTextSrc.includes("if (/^ws:\\d+$/i.test(raw)) {"), 'Admin → Audit search expectText must parse ws:ID');
assert.ok(auditSearchExpectTextSrc.includes("} else if (/^user:\\d+$/i.test(raw)) {"), 'Admin → Audit search expectText must parse user:ID');
assert.ok(auditSearchExpectTextSrc.includes("q.action = raw.slice(0, 50);"), 'Admin → Audit search expectText must clip action prefix search');
assert.ok(auditSearchExpectTextSrc.includes('await setAdminAuditQuery(tgId, q);'), 'Admin → Audit search expectText must persist search query');
assert.ok(auditSearchExpectTextSrc.includes('await renderAdminAudit(ctx, { afterHours: h, page: 0 });'), 'Admin → Audit search expectText must rerender audit list');

assert.ok(moderatorAddExpectTextSrc.includes("const mm = txt.match(/^@?([a-zA-Z0-9_]{5,})$/);"), 'Admin → Moderators expectText must keep username regex');
assert.ok(moderatorAddExpectTextSrc.includes("await ctx.reply('Введи @username (пример: @user)');"), 'Admin → Moderators expectText must keep invalid-username prompt');
assert.ok(moderatorAddExpectTextSrc.includes('const u2 = await db.findUserByUsername(username);'), 'Admin → Moderators expectText must resolve username through DB');
assert.ok(moderatorAddExpectTextSrc.includes('Пусть он откроет бота и нажмёт /start'), 'Admin → Moderators expectText must keep not-found guidance');
assert.ok(moderatorAddExpectTextSrc.includes('await db.addNetworkModerator(u2.id, u.id);'), 'Admin → Moderators expectText must add moderator');
assert.ok(moderatorAddExpectTextSrc.includes("try { await invalidateRoleFlagsCache(u2.id); } catch {}"), 'Admin → Moderators expectText must invalidate role cache');
assert.ok(moderatorAddExpectTextSrc.includes("await ctx.reply(`✅ Модератор добавлен: @${u2.tg_username || username}`);"), 'Admin → Moderators expectText must keep success reply');

expectRegistry('a:aud', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS, breakGlass: true });
expectRegistry('a:aud_search', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:aud_reset', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:aud_export', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_metrics', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_mod_list', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:admin_mod_add', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_mod_rm', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_ops', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:admin_sys', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_home', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:menu', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:home', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });

console.log('✅ smoke admin-audit-metrics-moderators contract OK');
