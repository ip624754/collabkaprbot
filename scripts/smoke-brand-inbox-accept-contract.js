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

expectRegistry('a:brand_app_accept', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.QUEUE_FIRST });
expectRegistry('a:brand_app_set', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:brand_app_reply', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:brand_app_chat', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });

const renderBrandAppViewSrc = extractBetween(
  botSource,
  "async function renderBrandAppView(ctx, actorUserId, appId, back = { status: 'new', page: 0 }) {",
  '\n\nasync function startBrandAppReply(ctx, actorUserId, appId, back) {'
);
assert.ok(renderBrandAppViewSrc.includes('Нажми ✅ Принять, чтобы открыть диалог: креатор получит кнопку “💬 Написать бренду”.'), 'brand app new-state card must explain accept-point dialog opening');
assert.ok(renderBrandAppViewSrc.includes('✅ Принять спишет:'), 'brand app new-state card must show accept spend hint when cost > 0');
assert.ok(renderBrandAppViewSrc.includes('Статусы “В работу / Закрыть / Спам” — внутренняя сортировка бренда'), 'brand app card must explain that triage statuses are internal only');
assert.ok(renderBrandAppViewSrc.includes("kb.text('✅ Принять', `a:brand_app_accept|id:${app.id}|s:${back.status}|p:${back.page}`).row();"), 'brand app new-state keyboard must expose accept CTA');
assert.ok(renderBrandAppViewSrc.includes(".text('⛔ Спам', `a:brand_app_set|id:${app.id}|st:spam|s:${back.status}|p:${back.page}`)"), 'brand app new-state keyboard must expose spam CTA');
assert.ok(renderBrandAppViewSrc.includes(".text('🗑 Удалить', `a:brand_app_del_q|id:${app.id}|s:${back.status}|p:${back.page}`);"), 'brand app new-state keyboard must expose delete CTA');
assert.ok(renderBrandAppViewSrc.includes('До принятия разрешаем только безопасные действия: СПАМ/удаление.'), 'brand app card must document safe-actions-only rule before accept');
assert.ok(renderBrandAppViewSrc.includes('“В работу/Закрыть/Ответить/Шаблоны” доступны после ✅ Принять.'), 'brand app card must document hidden post-accept actions');
assert.ok(renderBrandAppViewSrc.includes(".text('✍️ Ответить', `a:brand_app_reply|id:${app.id}|s:${back.status}|p:${back.page}`)"), 'brand app accepted-state keyboard must expose reply CTA');
assert.ok(renderBrandAppViewSrc.includes(".text('⚡ Шаблоны', `a:brand_app_tpls|id:${app.id}|s:${back.status}|p:${back.page}`)"), 'brand app accepted-state keyboard must expose templates CTA');
assert.ok(renderBrandAppViewSrc.includes(".text('💬 В работу', `a:brand_app_set|id:${app.id}|st:in_progress|s:${back.status}|p:${back.page}`)"), 'brand app accepted-state keyboard must expose in-progress triage CTA');
assert.ok(renderBrandAppViewSrc.includes(".text('✅ Закрыть', `a:brand_app_set|id:${app.id}|st:closed|s:${back.status}|p:${back.page}`)"), 'brand app accepted-state keyboard must expose close CTA');

const startBrandAppReplySrc = extractBetween(
  botSource,
  'async function startBrandAppReply(ctx, actorUserId, appId, back) {',
  '\n\nasync function startBrandDealReply(ctx, actorUserId, appId, back = { stage: \'negotiation\', page: 0 }) {'
);
assert.ok(startBrandAppReplySrc.includes('// Guard: reply is only allowed after accept (accept charges credits).'), 'brand app manual reply entry must keep accept-first guard comment');
assert.ok(startBrandAppReplySrc.includes("if (normLeadStatus(app.status) === 'new') {"), 'brand app manual reply entry must guard new status');
assert.ok(startBrandAppReplySrc.includes("'Сначала ✅ Принять'"), 'brand app manual reply entry must instruct accept first');

const acceptBrandApplicationSrc = extractBetween(
  botSource,
  'async function acceptBrandApplication(ctx, actorUserId, appId, back) {',
  '\n\n/**'
);
assert.ok(acceptBrandApplicationSrc.includes('// If already accepted earlier, don\'t duplicate side effects (notifications/thread).'), 'brand app accept handler must keep idempotent already-accepted guard');
assert.ok(acceptBrandApplicationSrc.includes("text: 'Заявка принята ✅'"), 'brand app accept handler must append accepted system thread entry');
assert.ok(acceptBrandApplicationSrc.includes("await renderBrandAppView(ctx, actorUserId, appId, { status: 'in_progress', page: back.page });"), 'brand app accept handler must rerender into in-progress card after accept');

const brandAppReplyExpectTextSrc = extractBetween(
  botSource,
  "    if (exp.type === 'brand_app_reply') {",
  '\n\nif (exp.type === \'brand_deals_search\') {'
);
assert.ok(brandAppReplyExpectTextSrc.includes('// Server-side guard (STEP317): reply is allowed only after ✅ Принять.'), 'brand app reply expectText flow must keep server-side accept guard');
assert.ok(brandAppReplyExpectTextSrc.includes('// Persist reply + append to thread (never move status here: ✅ Принять is the only spending transition).'), 'brand app reply expectText flow must keep accept as the only spending transition');
assert.ok(brandAppReplyExpectTextSrc.includes("await clearExpectText(ctx.from.id);"), 'brand app reply expectText flow must clear input mode on success/finalization');

console.log('smoke-brand-inbox-accept-contract: OK');
