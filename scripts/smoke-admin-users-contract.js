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

const renderAdminUsersSrc = extractBetween(
  botSource,
  "async function renderAdminUsers(ctx, filterRaw = 'all', page = 0) {",
  "\n\nasync function renderAdminUserCard(ctx, userId, backFilter = 'all', backPage = 0) {"
);

const adminUsersCallbacksSrc = extractBetween(
  botSource,
  "    if (p.a === 'a:admin_users') {",
  "\n    // --- Admin: User Note (Redis-only) (STEP194) ---"
);

const sendAdminUsersCsvSrc = extractBetween(
  botSource,
  "async function sendAdminUsersCsv(ctx, filter = 'all', q = '') {",
  "\n\nfunction csvEsc(val) {"
);

assert.ok(renderAdminUsersSrc.includes("const filter = String(filterRaw || 'all').toLowerCase();"), 'Admin → Users list must normalize filter');
assert.ok(renderAdminUsersSrc.includes('const limit = 12;'), 'Admin → Users list must keep page size at 12');
assert.ok(renderAdminUsersSrc.includes("const q = tgId ? await getAdminUsersQuery(tgId) : '';"), 'Admin → Users list must read saved search query');
assert.ok(renderAdminUsersSrc.includes('const rowsAll = await db.listUsersDirectory(filter, limit + 1, offset, q);'), 'Admin → Users list must fetch one extra row for hasNext');
assert.ok(renderAdminUsersSrc.includes("const qLine = q ? `\\n🔎 Поиск: <tg-spoiler>${escapeHtml(q)}</tg-spoiler>\\n` : '';"), 'Admin → Users list must keep search spoiler line');
assert.ok(renderAdminUsersSrc.includes("text += 'Пользователей нет по этому фильтру.';"), 'Admin → Users list must keep empty-state copy');
assert.ok(renderAdminUsersSrc.includes("const inPrivate = String(ctx.chat?.type || '') === 'private';"), 'Admin → Users list must keep DM-only quick actions gate');
assert.ok(renderAdminUsersSrc.includes('const notesMap = inPrivate ? await getAdminUserNotesBulk(rows.map((r) => r.user_id)) : new Map();'), 'Admin → Users list must keep bulk notes preload in DM');
assertMatch(
  renderAdminUsersSrc,
  /if \(inPrivate && rows\.length >= 1 && rows\.length <= 5\) \{[\s\S]*?kb\.text\(`👤 \$\{who\}\$\{hasNote \? ' 📝' : ''\}`, `a:adm_ucard\|id:\$\{r\.user_id\}\|f:\$\{filter\}\|p:\$\{p\}`\);[\s\S]*?kb\.text\('✉️', `a:adm_umsg\|id:\$\{r\.user_id\}\|f:\$\{filter\}\|p:\$\{p\}`\);[\s\S]*?kb\.text\('📝', `a:adm_unote\|id:\$\{r\.user_id\}\|f:\$\{filter\}\|p:\$\{p\}`\);[\s\S]*?kb\.row\(\);[\s\S]*?\}/s,
  'Admin → Users list must keep DM-only quick actions row (card/message/note)'
);
assertMatch(
  renderAdminUsersSrc,
  /kb\.text\(btn\('all', 'Все'\), 'a:admin_users\|f:all\|p:0'\)[\s\S]*?\.text\(btn\('brands', 'Бренды'\), 'a:admin_users\|f:brands\|p:0'\)[\s\S]*?\.row\(\)[\s\S]*?\.text\(btn\('creators', 'Креаторы'\), 'a:admin_users\|f:creators\|p:0'\)[\s\S]*?\.text\(btn\('curators', 'Кураторы'\), 'a:admin_users\|f:curators\|p:0'\)[\s\S]*?\.row\(\)[\s\S]*?\.text\(btn\('managers', 'Менеджеры'\), 'a:admin_users\|f:managers\|p:0'\)[\s\S]*?\.row\(\);/s,
  'Admin → Users list must keep stable filter rows'
);
assert.ok(renderAdminUsersSrc.includes("kb.text('🔎 Поиск', `a:admin_users_search|f:${filter}`);"), 'Admin → Users list must keep search button');
assert.ok(renderAdminUsersSrc.includes("if (q) kb.text('🧹 Сброс', `a:admin_users_reset|f:${filter}|p:0`);"), 'Admin → Users list must keep reset-search button only when q exists');
assert.ok(renderAdminUsersSrc.includes("kb.text('📤 Export CSV', `a:adm_ucsv|f:${filter}`).row();"), 'Admin → Users list must keep CSV export button');
assert.ok(renderAdminUsersSrc.includes("if (p > 0) kb.text('⬅️ Назад', `a:admin_users|f:${filter}|p:${p - 1}`);"), 'Admin → Users list must keep previous-page button');
assert.ok(renderAdminUsersSrc.includes("if (hasNext) kb.text('➡️ Далее', `a:admin_users|f:${filter}|p:${p + 1}`);"), 'Admin → Users list must keep next-page button');
assert.ok(renderAdminUsersSrc.includes("kb.text('⬅️ Операции', 'a:admin_ops');"), 'Admin → Users list must keep back-to-Ops button');
assert.ok(renderAdminUsersSrc.includes("let text = `👥 <b>Пользователи</b> · <b>${escapeHtml(label)}</b> · стр <b>${p + 1}</b>${qLine}"), 'Admin → Users list must keep stable title');

assert.ok(adminUsersCallbacksSrc.includes("if (p.a === 'a:admin_users') {"), 'Admin → Users list callback must exist');
assert.ok(adminUsersCallbacksSrc.includes("try { await clearExpectText(ctx.from.id); } catch {}"), 'Admin → Users list entry/reset/card callbacks must clear expectText');
assert.ok(adminUsersCallbacksSrc.includes("if (p.a === 'a:admin_users_search') {"), 'Admin → Users search callback must exist');
assert.ok(adminUsersCallbacksSrc.includes("await setExpectText(ctx.from.id, { type: 'admin_users_search', f });"), 'Admin → Users search must set expectText with type admin_users_search');
assert.ok(adminUsersCallbacksSrc.includes("'🔎 Введи @username или tg_id (цифрами).'"), 'Admin → Users search prompt must stay stable');
assertMatch(
  adminUsersCallbacksSrc,
  /const kb = new InlineKeyboard\([\s\S]*?\.text\('⬅️ Отмена', `a:admin_users\|f:\$\{f\}\|p:0`\)[\s\S]*?\.text\('🧹 Сбросить поиск', `a:admin_users_reset\|f:\$\{f\}\|p:0`\)[\s\S]*?\.text\('⬅️ Система', 'a:admin_sys'\)[\s\S]*?\.text\('📋 Меню', 'a:menu'\)[\s\S]*?\.text\('🏠 Home', 'a:home'\);/s,
  'Admin → Users search prompt must keep cancel/reset/footer controls'
);
assert.ok(adminUsersCallbacksSrc.includes("if (p.a === 'a:admin_users_reset') {"), 'Admin → Users reset callback must exist');
assert.ok(adminUsersCallbacksSrc.includes('await clearAdminUsersQuery(Number(ctx.from.id));'), 'Admin → Users reset must clear saved search query');
assert.ok(adminUsersCallbacksSrc.includes("if (p.a === 'a:adm_ucard') {"), 'Admin → Users must keep card callback reachable from list');
assert.ok(adminUsersCallbacksSrc.includes('await renderAdminUserCard(ctx, uid, f, page);'), 'Admin → Users card callback must keep back-filter/page route');

assert.ok(sendAdminUsersCsvSrc.includes('const { rows, truncated } = await db.exportUsersDirectory(filter, q);'), 'Admin → Users CSV must use exportUsersDirectory helper');
assert.ok(sendAdminUsersCsvSrc.includes("const header = 'user_id,tg_id,username,roles,created_at_msk,updated_at_msk,brand_plan,brand_plan_until_msk,brand_credits,brand_credits_spent';"), 'Admin → Users CSV must keep stable CSV header');
assert.ok(sendAdminUsersCsvSrc.includes("const filename = `users_${tag}${q ? '_search' : ''}_${ts}.csv`;"), 'Admin → Users CSV must keep stable filename scheme');
assert.ok(sendAdminUsersCsvSrc.includes("let caption = `📤 Export: ${rows.length} записей · фильтр: ${tag}`;"), 'Admin → Users CSV must keep export caption');
assert.ok(sendAdminUsersCsvSrc.includes("if (truncated) caption += `\\n⚠️ Лимит 10 000 — сузьте фильтр для полной выгрузки.`;"), 'Admin → Users CSV must keep truncation warning');
assertMatch(
  sendAdminUsersCsvSrc,
  /reply_markup: new InlineKeyboard\([\s\S]*?\.text\('⬅️ К списку', `a:admin_users\|f:\$\{filter\}\|p:0`\)[\s\S]*?\.text\('⬅️ Админка', 'a:admin_home'\)/s,
  'Admin → Users CSV must keep list/admin back buttons'
);

expectRegistry('a:admin_users', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS, breakGlass: true });
expectRegistry('a:admin_users_search', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_users_reset', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:adm_ucard', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:adm_umsg', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:adm_unote', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:adm_ucsv', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_ops', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:admin_sys', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:menu', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:home', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });

console.log('✅ smoke admin-users contract OK');
