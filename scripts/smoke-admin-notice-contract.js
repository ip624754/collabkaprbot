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

const renderAdminNoticeSrc = extractBetween(
  botSource,
  'async function renderAdminSysNotice(ctx) {',
  '\n\nasync function renderAdminQStashStatus(ctx) {'
);

const noticeCallbackSrc = extractBetween(
  botSource,
  "    // --- Admin: System Notice (Redis-only, no broadcast) ---",
  "\n\n    // --- Admin: Gift Subscription ---"
);

const noticeExpectSrc = extractBetween(
  botSource,
  "    // --- Admin: System Notice text input ---",
  "\n\n    if (exp.type === 'admin_users_search') {"
);

assert.ok(renderAdminNoticeSrc.includes("let text = `📣 <b>Системное объявление</b>\n\n`;"), 'Admin → Notice must keep stable title');
assert.ok(renderAdminNoticeSrc.includes("text += `STATUS: <b>${n.active ? 'ON' : 'OFF'}</b>\n`;"), 'Admin → Notice must keep STATUS line');
assert.ok(renderAdminNoticeSrc.includes("text += `SEVERITY: <b>${escapeHtml(sev)}</b>\n`;"), 'Admin → Notice must keep SEVERITY line');
assert.ok(renderAdminNoticeSrc.includes("text += `TARGET: <b>${escapeHtml(tgt)}</b>\n`;"), 'Admin → Notice must keep TARGET line');
assert.ok(renderAdminNoticeSrc.includes("text += `EXPIRES: <code>${escapeHtml(String(expLabel))}</code>\n`;"), 'Admin → Notice must keep EXPIRES line');
assert.ok(renderAdminNoticeSrc.includes("text += `CTA: ${ctaLabel}\n`;"), 'Admin → Notice must keep CTA line');
assert.ok(renderAdminNoticeSrc.includes("text += `VERSION: <b>${escapeHtml(String(verLabel))}</b>\n`;"), 'Admin → Notice must keep VERSION line');
assert.ok(renderAdminNoticeSrc.includes('<b>Текст</b>'), 'Admin → Notice must keep text preview section');
assert.ok(renderAdminNoticeSrc.includes('Показывается пользователям <b>1 раз на версию</b>'), 'Admin → Notice must keep once-per-version runtime hint');
assert.ok(renderAdminNoticeSrc.includes('Чтобы показать снова — жми «🚀 Опубликовать»'), 'Admin → Notice must keep publish hint');

assert.ok(renderAdminNoticeSrc.includes("commsCb.adminNoticeToggle()"), 'Admin → Notice toggle control must use canonical callback builder');
assert.ok(renderAdminNoticeSrc.includes("commsCb.adminNoticeSeverity()"), 'Admin → Notice severity control must use canonical callback builder');
assert.ok(renderAdminNoticeSrc.includes("commsCb.adminNoticeTarget()"), 'Admin → Notice target control must use canonical callback builder');
assert.ok(renderAdminNoticeSrc.includes("commsCb.adminNoticeExpire()"), 'Admin → Notice expiry control must use canonical callback builder');
assert.ok(renderAdminNoticeSrc.includes("commsCb.adminNoticeCta()"), 'Admin → Notice CTA control must use canonical callback builder');
assert.ok(renderAdminNoticeSrc.includes(".text('✍️ Текст', 'a:admin_notice_text')"), 'Admin → Notice text control must remain explicit');
assert.ok(renderAdminNoticeSrc.includes("commsCb.adminNoticeClear()"), 'Admin → Notice clear control must use canonical callback builder');
assert.ok(renderAdminNoticeSrc.includes("commsCb.adminNoticePublish()"), 'Admin → Notice publish control must use canonical callback builder');
assert.ok(renderAdminNoticeSrc.includes(".text('⬅️ Коммуникации', 'a:admin_comms')"), 'Admin → Notice footer must return to Comms');
assert.ok(renderAdminNoticeSrc.includes(".text('📋 Меню', 'a:menu')"), 'Admin → Notice footer must keep Menu');
assert.ok(renderAdminNoticeSrc.includes(".text('🏠 Home', 'a:home')"), 'Admin → Notice footer must keep Home');


assert.ok(noticeCallbackSrc.includes("if (p.a === 'a:admin_notice') {"), 'Admin → Notice main callback must exist');
assert.ok(noticeCallbackSrc.includes("try { await clearExpectText(ctx.from.id); } catch {}"), 'Admin → Notice entry must clear expectText');
assert.ok(noticeCallbackSrc.includes("try { await clearDraft(ctx.from.id); } catch {}"), 'Admin → Notice entry must clear drafts');
assert.ok(noticeCallbackSrc.includes("if (p.a === 'a:admin_notice_toggle') {"), 'Admin → Notice toggle callback must exist');
assert.ok(noticeCallbackSrc.includes("const order = ['info', 'warn', 'critical'];"), 'Admin → Notice severity cycle must exist');
assert.ok(noticeCallbackSrc.includes("const order = ['all', 'brand', 'creator'];"), 'Admin → Notice target cycle must exist');
assert.ok(noticeCallbackSrc.includes("if (p.a === 'a:admin_notice_cta') {"), 'Admin → Notice CTA callback must exist');
assert.ok(noticeCallbackSrc.includes('CTA‑кнопка (опционально)'), 'Admin → Notice CTA composer prompt must stay stable');
assert.ok(noticeCallbackSrc.includes("setExpectText(ctx.from.id, { type: 'admin_notice_cta' });"), 'Admin → Notice CTA callback must set expectText');
assert.ok(noticeCallbackSrc.includes("if (p.a === 'a:admin_notice_expire') {"), 'Admin → Notice expire callback must exist');
assert.ok(noticeCallbackSrc.includes('Auto‑expire (опционально)'), 'Admin → Notice expire prompt must stay stable');
assert.ok(noticeCallbackSrc.includes("setExpectText(ctx.from.id, { type: 'admin_notice_expire' });"), 'Admin → Notice expire callback must set expectText');
assert.ok(noticeCallbackSrc.includes("if (p.a === 'a:admin_notice_clear') {"), 'Admin → Notice clear callback must exist');
assert.ok(noticeCallbackSrc.includes("cur.text = '';"), 'Admin → Notice clear callback must clear text');
assert.ok(noticeCallbackSrc.includes("if (p.a === 'a:admin_notice_publish') {"), 'Admin → Notice publish callback must exist');
assert.ok(noticeCallbackSrc.includes("await ctx.answerCallbackQuery({ text: 'Сначала задай текст.', show_alert: true });"), 'Admin → Notice publish must guard empty text');
assert.ok(noticeCallbackSrc.includes("cur.version = Math.max(0, Number(cur.version || 0)) + 1;"), 'Admin → Notice publish must bump version');
assert.ok(noticeCallbackSrc.includes("cur.active = true;"), 'Admin → Notice publish must force active');
assert.ok(noticeCallbackSrc.includes("if (p.a === 'a:admin_notice_text') {"), 'Admin → Notice text callback must exist');
assert.ok(noticeCallbackSrc.includes("setExpectText(ctx.from.id, { type: 'admin_notice_text' });"), 'Admin → Notice text callback must set expectText');

assert.ok(noticeExpectSrc.includes("if (exp.type === 'admin_notice_text') {"), 'Admin → Notice text expect handler must exist');
assert.ok(noticeExpectSrc.includes("const textMeta = clipCodepoints(raw, TG_SAFE_BODY_MAX);"), 'Admin → Notice text expect must clip to Telegram-safe body');
assert.ok(noticeExpectSrc.includes(".text('🚀 Опубликовать', commsCb.adminNoticePublish())"), 'Admin → Notice text expect must keep publish shortcut');
assert.ok(noticeExpectSrc.includes('Текст был обрезан до ${TG_SAFE_BODY_MAX} символов'), 'Admin → Notice text expect must keep clip warning');
assert.ok(noticeExpectSrc.includes('Нажми «🚀 Опубликовать», чтобы показать пользователям новую версию'), 'Admin → Notice text expect must keep publish follow-up');
assert.ok(noticeExpectSrc.includes("if (exp.type === 'admin_notice_cta') {"), 'Admin → Notice CTA expect handler must exist');
assert.ok(noticeExpectSrc.includes("const normUrl = normalizeNoticeCtaUrl(url);"), 'Admin → Notice CTA expect must normalize URL');
assert.ok(noticeExpectSrc.includes("const normLabel = normalizeNoticeCtaLabel(label) || '🔗 Подробнее';"), 'Admin → Notice CTA expect must keep default CTA label');
assert.ok(noticeExpectSrc.includes("await safeEditOrReply(ctx, '✅ CTA сохранён. Чтобы пользователи увидели — нажми «🚀 Опубликовать» (новая версия).' + warn, { reply_markup: kb });"), 'Admin → Notice CTA expect must keep publish follow-up');
assert.ok(noticeExpectSrc.includes("if (exp.type === 'admin_notice_expire') {"), 'Admin → Notice expire expect handler must exist');
assert.ok(noticeExpectSrc.includes("const sec = normalizeNoticeExpiresAtSec(raw);"), 'Admin → Notice expire expect must normalize deadline');
assert.ok(noticeExpectSrc.includes("cur.expiresAt = Math.min(sec, maxSec);"), 'Admin → Notice expire expect must clamp absurd deadlines');
assert.ok(noticeExpectSrc.includes("await safeEditOrReply(ctx, '✅ Expire сохранён. Чтобы пользователи увидели обновление настроек — нажми «🚀 Опубликовать» (новая версия).', { reply_markup: kb });"), 'Admin → Notice expire expect must keep publish follow-up');

expectRegistry('a:admin_notice', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_notice_toggle', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_notice_sev', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_notice_target', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_notice_cta', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_notice_expire', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_notice_text', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_notice_clear', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_notice_publish', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_comms', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:menu', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:home', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });

console.log('✅ smoke admin-notice composer/runtime contract OK');
