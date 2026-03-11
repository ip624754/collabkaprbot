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

const renderAdminUserCardSrc = extractBetween(
  botSource,
  "async function renderAdminUserCard(ctx, userId, backFilter = 'all', backPage = 0) {",
  "\n\nasync function renderAdminUserNote(ctx, userId, backFilter = 'all', backPage = 0) {"
);

const renderAdminUserNoteSrc = extractBetween(
  botSource,
  "async function renderAdminUserNote(ctx, userId, backFilter = 'all', backPage = 0) {",
  "\n\nfunction renderAdminDmUserMessageHtml(bodyHtml, opts = {}) {"
);

const adminUserCardCallbacksSrc = extractBetween(
  botSource,
  "    if (p.a === 'a:adm_ucard') {",
  "\n    // Admin: placeholders helper (STEP191)"
);

const adminUserNoteExpectTextSrc = extractBetween(
  botSource,
  "    if (exp.type === 'adm_user_note') {",
  "\n    // --- Admin: System Notice text input ---"
);

assert.ok(renderAdminUserCardSrc.includes('const card = await db.getUserCardById(Number(userId));'), 'Admin → User Card must fetch db.getUserCardById');
assert.ok(renderAdminUserCardSrc.includes("await safeEditOrReply(ctx, '⚠️ Пользователь не найден.'"), 'Admin → User Card must keep missing-user fallback');
assert.ok(renderAdminUserCardSrc.includes("let text = `👤 <b>Карточка пользователя</b>\\n\\n`;"), 'Admin → User Card must keep stable title');
assert.ok(renderAdminUserCardSrc.includes("<b>ID:</b> <code>${card.id}</code>"), 'Admin → User Card must keep user id line');
assert.ok(renderAdminUserCardSrc.includes("<b>TG ID:</b> <code>${card.tg_id}</code>"), 'Admin → User Card must keep tg id line');
assert.ok(renderAdminUserCardSrc.includes("<b>Username:</b> ${card.tg_username ? '@' + escapeHtml(card.tg_username) : '—'}"), 'Admin → User Card must keep username line');
assert.ok(renderAdminUserCardSrc.includes("<b>Роли:</b> ${roles.join(', ')}"), 'Admin → User Card must keep roles line');
assert.ok(renderAdminUserCardSrc.includes("if (inPrivate) {"), 'Admin → User Card must keep DM-only note block gate');
assert.ok(renderAdminUserCardSrc.includes('const note = await getAdminUserNote(card.id);'), 'Admin → User Card must keep note lookup in DM');
assert.ok(renderAdminUserCardSrc.includes("📝 <b>Заметка:</b> <i>(только в DM)</i>"), 'Admin → User Card must keep group-safe note placeholder');
assert.ok(renderAdminUserCardSrc.includes("🏷 <b>Теги:</b> <i>(только в DM)</i>"), 'Admin → User Card must keep group-safe tags placeholder');
assert.ok(renderAdminUserCardSrc.includes("kb.text(`📋 Скопировать ID: ${card.tg_id}`, `a:adm_ucopy|id:${card.id}`).row();"), 'Admin → User Card must keep copy tg id control');
assert.ok(renderAdminUserCardSrc.includes("kb.text('✉️ Написать', `a:adm_umsg|id:${card.id}|f:${backFilter}|p:${backPage}`).row();"), 'Admin → User Card must keep message action');
assert.ok(renderAdminUserCardSrc.includes("kb.text('📝 Заметка', `a:adm_unote|id:${card.id}|f:${backFilter}|p:${backPage}`).row();"), 'Admin → User Card must keep note action');
assert.ok(renderAdminUserCardSrc.includes("kb.text('🎁 Подарить подписку', `a:adm_ugift|id:${card.id}|f:${backFilter}|p:${backPage}`).row();"), 'Admin → User Card must keep quick gift action');
assert.ok(renderAdminUserCardSrc.includes("kb.text('⬅️ К списку', `a:admin_users|f:${backFilter}|p:${backPage}`).row();"), 'Admin → User Card must keep back-to-users action');
assert.ok(renderAdminUserCardSrc.includes("kbAdminFooter(kb, '⬅️ Операции', 'a:admin_ops');"), 'Admin → User Card must keep admin footer');
assertMatch(
  renderAdminUserCardSrc,
  /if \(isBanned\) \{[\s\S]*?kb\.text\('✅ Разбанить', `a:adm_uban_q\|id:\$\{card\.id\}\|v:0\|f:\$\{backFilter\}\|p:\$\{backPage\}`\)\.row\(\);[\s\S]*?\} else \{[\s\S]*?kb\.text\('🚫 Заблокировать', `a:adm_uban_q\|id:\$\{card\.id\}\|v:1\|f:\$\{backFilter\}\|p:\$\{backPage\}`\)\.row\(\);[\s\S]*?\}/s,
  'Admin → User Card must keep ban/unban toggle row'
);
assertMatch(
  renderAdminUserCardSrc,
  /if \(card\.brand_plan\) \{[\s\S]*?a:adm_urevoke_q\|id:\$\{card\.id\}\|t:bp\|f:\$\{backFilter\}\|p:\$\{backPage\}[\s\S]*?a:adm_urevoke_q\|id:\$\{card\.id\}\|t:bp_gcr\|f:\$\{backFilter\}\|p:\$\{backPage\}[\s\S]*?\}/s,
  'Admin → User Card must keep revoke brand-plan controls'
);
assert.ok(renderAdminUserCardSrc.includes("if (Number(card.brand_credits || 0) > 0) {"), 'Admin → User Card must keep credits revoke guard');
assert.ok(renderAdminUserCardSrc.includes("if (card._workspaces?.some(ws => ws.plan === 'pro')) {"), 'Admin → User Card must keep PRO revoke guard');

assert.ok(renderAdminUserNoteSrc.includes('const ret = await getAdminUserNoteReturn(adminTgId);'), 'Admin → User Note must keep return-route helper');
assert.ok(renderAdminUserNoteSrc.includes("const sectionBackText = hasRet ? String(ret.sectionBackText || '⬅️ Коммуникации') : '⬅️ Операции';"), 'Admin → User Note must keep section back text logic');
assert.ok(renderAdminUserNoteSrc.includes("const sectionBackCb = hasRet ? String(ret.sectionBackCb || 'a:admin_comms') : 'a:admin_ops';"), 'Admin → User Note must keep section back callback logic');
assert.ok(renderAdminUserNoteSrc.includes("await safeEditOrReply(ctx, '⚠️ Нет user_id.', { reply_markup: backKb });"), 'Admin → User Note must keep missing-user-id fallback');
assert.ok(renderAdminUserNoteSrc.includes("if (chatType !== 'private') {"), 'Admin → User Note must stay DM-only');
assert.ok(renderAdminUserNoteSrc.includes('Эта функция доступна только в <b>личном чате</b> с ботом (DM)'), 'Admin → User Note must keep DM-only warning');
assert.ok(renderAdminUserNoteSrc.includes("const note = await getAdminUserNote(uid);"), 'Admin → User Note must read note from Redis helper');
assert.ok(renderAdminUserNoteSrc.includes("let text = `📝 <b>Заметка (admin)</b>\\n\\n` +"), 'Admin → User Note must keep stable title');
assert.ok(renderAdminUserNoteSrc.includes("🏷 <b>Теги</b>: ${tagTitles.length ? escapeHtml(tagTitles.join(', ')) : '—'}"), 'Admin → User Note must keep tags summary line');
assert.ok(renderAdminUserNoteSrc.includes("<i>Нажимай на кнопки тегов ниже — включить/выключить.</i>"), 'Admin → User Note must keep tag toggle hint');
assert.ok(renderAdminUserNoteSrc.includes("kb.text('✏️ Изменить текст', `a:adm_unote_edit|id:${uid}|f:${f}|p:${page}`).row();"), 'Admin → User Note must keep edit-text action');
assert.ok(renderAdminUserNoteSrc.includes('for (let i = 0; i < ADMIN_USER_NOTE_TAGS.length; i++) {'), 'Admin → User Note must keep strict allowlist tag loop');
assert.ok(renderAdminUserNoteSrc.includes("const label = on ? `✅ ${t.title}` : `🏷 ${t.title}`;"), 'Admin → User Note must keep tag toggle labels');
assert.ok(renderAdminUserNoteSrc.includes("kb.text('🧹 Очистить всё', `a:adm_unote_clear_q|id:${uid}|f:${f}|p:${page}`).row();"), 'Admin → User Note must keep clear-all button when note data exists');
assert.ok(renderAdminUserNoteSrc.includes("kb.text('⬅️ К карточке', `a:adm_ucard|id:${uid}|f:${f}|p:${page}`);"), 'Admin → User Note must keep back-to-card action');
assert.ok(renderAdminUserNoteSrc.includes("if (hasRet) kb.text(String(ret.backText || '⬅️ Outbox'), String(ret.backCb));"), 'Admin → User Note must keep optional return-route button');
assert.ok(renderAdminUserNoteSrc.includes('kbAdminFooter(kb, sectionBackText, sectionBackCb);'), 'Admin → User Note must keep section footer');

assert.ok(adminUserCardCallbacksSrc.includes("if (p.a === 'a:adm_ucard') {"), 'Admin → User Card callback must exist');
assert.ok(adminUserCardCallbacksSrc.includes("if (p.a === 'a:adm_unote') {"), 'Admin → User Note callback must exist');
assert.ok(adminUserCardCallbacksSrc.includes("if (p.a === 'a:adm_unote_edit') {"), 'Admin → User Note edit callback must exist');
assert.ok(adminUserCardCallbacksSrc.includes("if (p.a === 'a:adm_unote_clear_q') {"), 'Admin → User Note clear-confirm callback must exist');
assert.ok(adminUserCardCallbacksSrc.includes("if (p.a === 'a:adm_unote_clear') {"), 'Admin → User Note clear callback must exist');
assert.ok(adminUserCardCallbacksSrc.includes("if (p.a === 'a:adm_unote_tag') {"), 'Admin → User Note tag callback must exist');
assertMatch(
  adminUserCardCallbacksSrc,
  /if \(p\.a === 'a:adm_ucard'\) \{[\s\S]*?try \{ await clearExpectText\(ctx\.from\.id\); \} catch \{\}[\s\S]*?await renderAdminUserCard\(ctx, uid, f, page\);[\s\S]*?\}/s,
  'Admin → User Card callback must clear expectText and rerender card'
);
assertMatch(
  adminUserCardCallbacksSrc,
  /if \(p\.a === 'a:adm_unote'\) \{[\s\S]*?try \{ await clearExpectText\(ctx\.from\.id\); \} catch \{\}[\s\S]*?await renderAdminUserNote\(ctx, uid, f, page\);[\s\S]*?\}/s,
  'Admin → User Note callback must clear expectText and rerender note screen'
);
assert.ok(adminUserCardCallbacksSrc.includes("await setExpectText(ctx.from.id, { type: 'adm_user_note', uid, f, page }, 20 * 60);"), 'Admin → User Note edit callback must set expectText with type adm_user_note');
assert.ok(adminUserCardCallbacksSrc.includes("'🧹 <b>Очистить заметку и теги?</b>'"), 'Admin → User Note clear-confirm screen must keep stable copy');
assert.ok(adminUserCardCallbacksSrc.includes('await clearAdminUserNote(uid);'), 'Admin → User Note clear callback must clear note data');
assert.ok(adminUserCardCallbacksSrc.includes('await toggleAdminUserNoteTag(uid, tagId,'), 'Admin → User Note tag callback must keep toggle helper');

assert.ok(adminUserNoteExpectTextSrc.includes("if (chatType !== 'private') {"), 'Admin → User Note expectText must re-guard DM only');
assert.ok(adminUserNoteExpectTextSrc.includes("await ctx.reply('📝 Заметку можно редактировать только в личном чате с ботом (DM).');"), 'Admin → User Note expectText must keep DM-only reply');
assert.ok(adminUserNoteExpectTextSrc.includes("await ctx.reply('Введи заметку одним сообщением (или clear).');"), 'Admin → User Note expectText must keep empty-text prompt');
assert.ok(adminUserNoteExpectTextSrc.includes("const cancelCmd = (low === '/cancel' || low === 'cancel' || low === 'отмена');"), 'Admin → User Note expectText must keep cancel command set');
assert.ok(adminUserNoteExpectTextSrc.includes("const clearCmd = (low === 'clear' || low === 'сброс' || low === 'очистить' || low === '0' || low === '-');"), 'Admin → User Note expectText must keep clear command set');
assert.ok(adminUserNoteExpectTextSrc.includes('await renderAdminUserCard(ctx, uid, f, page);'), 'Admin → User Note expectText cancel must return to user card');
assert.ok(adminUserNoteExpectTextSrc.includes('await clearAdminUserNote(uid);'), 'Admin → User Note expectText must support clear');
assert.ok(adminUserNoteExpectTextSrc.includes("await setAdminUserNote(uid, raw, { byAdminTgId: tgId, byAdminUsername: String(ctx.from?.username || '') });"), 'Admin → User Note expectText must keep save helper with actor metadata');
assert.ok(adminUserNoteExpectTextSrc.includes('await renderAdminUserNote(ctx, uid, f, page);'), 'Admin → User Note expectText save/clear must return to note screen');

expectRegistry('a:adm_ucard', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:adm_ucopy', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:adm_umsg', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:adm_unote', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:adm_unote_edit', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:adm_unote_clear_q', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:adm_unote_clear', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:adm_unote_tag', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:adm_ugift', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:adm_urevoke_q', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:adm_uban_q', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:admin_users', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS, breakGlass: true });
expectRegistry('a:admin_ops', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:admin_comms', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:menu', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:home', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });

console.log('✅ smoke admin-user-card-note contract OK');
