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

expectRegistry('a:gw_new', { type: ACTION_TYPES.OPS, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:gw_new_pick', { type: ACTION_TYPES.OPS, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:brand_apply', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:brand_apply_write', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS });

const renderGwNewWorkspacePickerSrc = extractBetween(
  botSource,
  "async function renderGwNewWorkspacePicker(ctx, ownerUserId, backCb = 'a:gw_list') {",
  '\n\nasync function renderGwNewGate(ctx, { backCb = \'a:gw_list\', reason = \'\' } = {}) {'
);
assert.ok(renderGwNewWorkspacePickerSrc.includes("kb.text('🚀 Подключить канал', 'a:setup').row();"), 'giveaway picker empty-state must expose connect-channel CTA');
assert.ok(renderGwNewWorkspacePickerSrc.includes("kb.text('📣 Мои каналы', 'a:ws_list').row();"), 'giveaway picker empty-state must expose channel list CTA');
assert.ok(renderGwNewWorkspacePickerSrc.includes('Нужен подключённый канал (витрина), чтобы создать розыгрыш.'), 'giveaway picker empty-state must explain why a channel is required');

const renderGwNewGateSrc = extractBetween(
  botSource,
  "async function renderGwNewGate(ctx, { backCb = 'a:gw_list', reason = '' } = {}) {",
  '\n\n\nasync function getRoleFlags(userRow, tgId) {'
);
assert.ok(renderGwNewGateSrc.includes(".text('🚀 Подключить канал', 'a:setup')"), 'giveaway gate must expose connect-channel CTA');
assert.ok(renderGwNewGateSrc.includes(".text('📣 Мои каналы', 'a:ws_list')"), 'giveaway gate must expose channel list CTA');
assert.ok(renderGwNewGateSrc.includes(".text('📣 Выбрать канал', 'a:gw_new_pick')"), 'giveaway gate must expose explicit choose-channel CTA');
assert.ok(renderGwNewGateSrc.includes('чтобы создать розыгрыш'), 'giveaway gate must explain create-giveaway dependency on channel');
assert.ok(renderGwNewGateSrc.includes('Затем вернись и выбери канал («📣 Выбрать канал»).'), 'giveaway gate must avoid silent dead-end and explain recovery');

const renderBrandApplySrc = extractBetween(
  botSource,
  'async function renderBrandApply(ctx, u, brandUserId, backPage, opts = {}) {',
  '\n\nasync function renderBrandApplyPreview(ctx, u, brandUserId, backPage, opts = {}) {'
);
assert.ok(renderBrandApplySrc.includes('// Gate: заявки брендам отправляются только от подключённой витрины (активный канал)'), 'brand apply must document active-channel gate');
assert.ok(renderBrandApplySrc.includes("if (hasAnyWs) kbGate.text('📣 Мои каналы', 'a:ws_list');"), 'brand apply no-channel gate must expose channel list when workspaces exist');
assert.ok(renderBrandApplySrc.includes("else kbGate.text('🚀 Подключить канал', 'a:setup');"), 'brand apply no-channel gate must expose connect CTA when no workspaces exist');
assert.ok(renderBrandApplySrc.includes('⚠️ Для заявки нужен активный канал (витрина).'), 'brand apply no-channel gate must explain active-channel requirement');
assert.ok(renderBrandApplySrc.includes('⚠️ Нужен подключённый канал (витрина), чтобы отправить заявку.'), 'brand apply empty-workspace gate must explain connected-channel requirement');
assert.ok(renderBrandApplySrc.includes('⚠️ Выбери активный канал (витрину) в «📣 Мои каналы» и вернись сюда.'), 'brand apply stale active workspace gate must explain recovery path');

const gwNewHandlerSrc = extractBetween(
  botSource,
  "    if (p.a === 'a:gw_new') {",
  "\n    if (p.a === 'a:gw_preset_home') {"
);
assert.ok(gwNewHandlerSrc.includes("if (!wsId || wsId <= 0) {"), 'giveaway create handler must guard missing workspace');
assert.ok(gwNewHandlerSrc.includes("await renderGwNewGate(ctx, { backCb: 'a:gw_list', reason: 'Не выбран канал.' });"), 'giveaway create handler must reroute missing workspace into explicit gate');
assert.ok(gwNewHandlerSrc.includes("await renderGwNewGate(ctx, { backCb: 'a:gw_list', reason: 'Канал недоступен или кнопка устарела. Выбери канал заново.' });"), 'giveaway create handler must reroute stale workspace into explicit gate');
assert.ok(!gwNewHandlerSrc.includes('return;\n      // silent'), 'giveaway create handler must not silently stop on missing/stale workspace');

console.log('smoke-no-channel-gate-contract: OK');
