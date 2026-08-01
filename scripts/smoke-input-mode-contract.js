#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTION_GUARD, ACTION_REGISTRY, ACTION_TYPES } from '../src/bot/actionRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

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

const botSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'bot.js'), 'utf8');
const applicationCallbacksSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'domains', 'applications', 'callbacks.js'), 'utf8');

expectRegistry('a:brand_apply', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:brand_apply_write', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:brand_apply_cancel', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:brand_apply_clear', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS });

const renderBrandApplySrc = extractBetween(
  botSource,
  'async function renderBrandApply(ctx, u, brandUserId, backPage, opts = {}) {',
  '\n\nasync function renderBrandApplyPreview(ctx, u, brandUserId, backPage, opts = {}) {'
);
assert.ok(renderBrandApplySrc.includes('type: \'brand_apply\''), 'brand apply input mode must store expectText type brand_apply');
assert.ok(renderBrandApplySrc.includes('}, 5 * 60);'), 'brand apply input mode must stay short-lived to avoid hijacking unrelated messages');
assert.ok(renderBrandApplySrc.includes("kb.text('✍️ Написать заявку', `a:brand_apply_write|u:${brandUserId}|p:${backPage}`);"), 'brand apply screen must expose explicit write CTA');
assert.ok(renderBrandApplySrc.includes("if (startWrite) kb.row().text('❌ Отмена ввода', `a:brand_apply_cancel|u:${brandUserId}|p:${backPage}`);"), 'brand apply screen must expose cancel CTA while input mode is on');
assert.ok(renderBrandApplySrc.includes('<b>✍️ Режим ввода включён.</b>'), 'brand apply screen must explicitly tell user input mode is on');
assert.ok(renderBrandApplySrc.includes('<i>Отмена — «❌ Отмена ввода».</i>'), 'brand apply screen must explain how to cancel input mode');

const renderBrandApplyPreviewSrc = extractBetween(
  botSource,
  'async function renderBrandApplyPreview(ctx, u, brandUserId, backPage, opts = {}) {',
  '\n\nasync function sendBrandApplyDraft(ctx, u, brandUserId, backPage, opts = {}) {'
);
assert.ok(renderBrandApplyPreviewSrc.includes(".text('✅ Отправить', `a:brand_apply_send|u:${brandUserId}|p:${backPage}`)"), 'brand apply preview must expose send CTA');
assert.ok(renderBrandApplyPreviewSrc.includes(".text('✍️ Изменить', `a:brand_apply_write|u:${brandUserId}|p:${backPage}`)"), 'brand apply preview must expose edit CTA');
assert.ok(renderBrandApplyPreviewSrc.includes(".text('🗑 Сбросить', `a:brand_apply_clear|u:${brandUserId}|p:${backPage}`);"), 'brand apply preview must expose draft reset CTA');

const brandApplyCallbacksSrc = extractBetween(
  applicationCallbacksSource,
  "    if (p.a === 'a:brand_apply') {",
  '\n  })();\n  return true;\n}\n\nexport async function handleApplicationBrandCallback'
);
assert.ok(brandApplyCallbacksSrc.includes('startWrite: !hasDraft'), 'brand apply entry must auto-enable input mode when no draft exists');
assert.ok(brandApplyCallbacksSrc.includes("if (p.a === 'a:brand_apply_write') {"), 'brand apply callbacks must keep explicit write action');
assert.ok(brandApplyCallbacksSrc.includes("await renderBrandApply(ctx, u, brandUserId, backPage, { edit: true, startWrite: true });"), 'brand apply write callback must rerender with input mode enabled');
assert.ok(brandApplyCallbacksSrc.includes("if (p.a === 'a:brand_apply_cancel') {"), 'brand apply callbacks must keep explicit cancel action');
assert.ok(brandApplyCallbacksSrc.includes("if (exp && exp.type === 'brand_apply') await clearExpectText(ctx.from.id);"), 'brand apply cancel callback must clear only matching expectText state');
assert.ok(brandApplyCallbacksSrc.includes("await ctx.answerCallbackQuery({ text: '❌ Режим ввода выключен.' });"), 'brand apply cancel callback must confirm input-mode shutdown');
assert.ok(brandApplyCallbacksSrc.includes("await clearBrandApplyDraft(ctx.from.id, brandUserId);"), 'brand apply clear callback must clear saved draft');

const brandApplyExpectTextSrc = extractBetween(
  botSource,
  "if (exp.type === 'brand_apply') {",
  '\n\n    if (exp.type === \'brand_app_reply\') {'
);
assert.ok(brandApplyExpectTextSrc.includes('await clearExpectText(ctx.from.id);'), 'brand apply expectText flow must clear input mode after draft capture');
assert.ok(brandApplyExpectTextSrc.includes('await renderBrandApplyPreview(ctx, u, brandUserId, backPage, { edit: false });'), 'brand apply expectText flow must send user into preview after saving text');

const renderWsProfileContactsStructuredSrc = extractBetween(
  botSource,
  'async function renderWsProfileContactsStructured(ctx, ownerUserId, wsId, opts = {}) {',
  '\n\nasync function renderWsProfileContactsClearMenu(ctx, ownerUserId, wsId) {'
);
assert.ok(renderWsProfileContactsStructuredSrc.includes('Чтобы очистить поле — используй «🧹 Очистить поле».'), 'structured contacts editor must explain clear-field reset path');

const renderWsProfileContactsClearMenuSrc = extractBetween(
  botSource,
  'async function renderWsProfileContactsClearMenu(ctx, ownerUserId, wsId) {',
  '\n\n\n\n\nasync function renderWsShareMenu(ctx, ownerUserId, wsId, ret = null) {'
);
assert.ok(renderWsProfileContactsClearMenuSrc.includes('🧹 <b>Очистить поле</b>'), 'structured contacts clear menu must keep explicit reset screen');
assert.ok(renderWsProfileContactsClearMenuSrc.includes('Нечего очищать — все поля пустые.'), 'structured contacts clear menu must handle empty-state cleanly');
assert.ok(renderWsProfileContactsClearMenuSrc.includes('Выбери, что очистить:'), 'structured contacts clear menu must list reset targets');

console.log('smoke-input-mode-contract: OK');
