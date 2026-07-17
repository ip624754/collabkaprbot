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

expectRegistry('a:ws_list', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:ws_open', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:ws_settings', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:verify_home', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });

const mainMenuCreatorCurrentKbSrc = extractBetween(
  botSource,
  'function mainMenuCreatorCurrentKb(flags = {}, ws, opts = {}) {',
  '\n\nfunction mainMenuBrandKb(flags = {}, opts = {}) {'
);
assert.ok(mainMenuCreatorCurrentKbSrc.includes(".text('🔁 Сменить канал', 'a:ws_list')"), 'creator current menu must expose channel switcher');
assert.ok(mainMenuCreatorCurrentKbSrc.includes(".text('📂 Текущий канал', `a:ws_open|ws:${wsId}`)"), 'creator current menu must expose current channel opener');
assert.ok(mainMenuCreatorCurrentKbSrc.includes(".text('🎬 UGC / Офферы', `a:bx_open|ws:${wsId}`)"), 'creator current menu must keep offers entry');
assert.ok(mainMenuCreatorCurrentKbSrc.includes(".text('📥 Inbox', `a:bx_inbox|ws:${wsId}|p:0|h:bo`)"), 'creator current menu must keep inbox entry');
assert.ok(!mainMenuCreatorCurrentKbSrc.includes('Перейти в бренд'), 'creator current menu must not expose brand role switch');
assert.ok(!mainMenuCreatorCurrentKbSrc.includes('Режим менеджера бренда'), 'creator current menu must not expose brand-manager role switch');
assert.ok(!mainMenuCreatorCurrentKbSrc.includes('✅ Верификация'), 'creator current menu must not expose verification shortcut');
assert.ok(!mainMenuCreatorCurrentKbSrc.includes('🔗 Поделиться'), 'creator current menu must not expose share shortcut');

const renderCreatorCurrentMenuSrc = extractBetween(
  botSource,
  'async function renderCreatorCurrentMenu(ctx, u, flags = {}, params = {}) {',
  '\n\nasync function renderRoleHub(ctx, u, flags) {'
);
assert.match(renderCreatorCurrentMenuSrc, /<b>Текущий канал:<\/b> <b>\$\{escapeHtml\(currentWsLabel\(current\)\)\}<\/b>/, 'creator current menu must render selected current channel label');
assert.match(renderCreatorCurrentMenuSrc, /Действия ниже относятся к текущему каналу\./, 'creator current menu must explain current-channel scoping');
assert.ok(renderCreatorCurrentMenuSrc.includes("const resolved = await resolveCurrentWorkspaceForOwner(userId, tgId);"), 'creator current menu must resolve current workspace through shared helper');
assert.ok(renderCreatorCurrentMenuSrc.includes("const kb = new InlineKeyboard().text('🚀 Подключить канал', 'a:setup').row();"), 'creator no-active gate must keep connect-channel CTA');
assert.ok(renderCreatorCurrentMenuSrc.includes("kb.text('💬 Поддержка', 'a:support').row();"), 'creator no-active gate must keep support CTA');
assert.ok(renderCreatorCurrentMenuSrc.includes("kb.row().text('🏠 Домой', 'a:home');"), 'creator no-active gate must keep Home CTA');
assert.ok(!renderCreatorCurrentMenuSrc.includes('Перейти в бренд'), 'creator no-active gate must not leak brand role switch');
assert.ok(!renderCreatorCurrentMenuSrc.includes('Режим менеджера бренда'), 'creator no-active gate must not leak manager role switch');
assert.ok(!renderCreatorCurrentMenuSrc.includes("'✅ Верификация'"), 'creator no-active gate must not leak verification CTA');
assert.ok(!renderCreatorCurrentMenuSrc.includes("'🔗 Поделиться'"), 'creator no-active gate must not leak share CTA');

const renderRoleHubSrc = extractBetween(
  botSource,
  'async function renderRoleHub(ctx, u, flags) {',
  '\n\nfunction curatorModeMenuKb(flags = {}) {'
);
assert.ok(renderRoleHubSrc.includes('await renderCreatorCurrentMenu(ctx, u, flags, { edit: true });'), 'role hub must route creator mode to current-channel menu');

const wsMenuKbSrc = extractBetween(
  botSource,
  'function wsMenuKb(wsId, opts = {}) {',
  '\n\nfunction wsSettingsKb(wsId, s) {'
);
assert.ok(wsMenuKbSrc.includes(".text('⚙️ Настройки', `a:ws_settings|ws:${wsId}`)"), 'workspace work screen must link to settings');
assert.ok(wsMenuKbSrc.includes(".text('📣 Мои каналы', 'a:ws_list')"), 'workspace work screen must link back to channel picker');
assert.ok(!wsMenuKbSrc.includes('✅ Верификация аккаунта'), 'workspace work screen must not inline verification CTA');

const wsSettingsKbSrc = extractBetween(
  botSource,
  'function wsSettingsKb(wsId, s) {',
  '\n\nfunction isWorkspaceDisconnected(ws) {'
);
assert.ok(wsSettingsKbSrc.includes(".text('✅ Верификация аккаунта', 'a:verify_home')"), 'workspace settings must expose account-level verification entry');
assert.ok(wsSettingsKbSrc.includes(".text('⬅️ К каналу', `a:ws_open|ws:${wsId}`)"), 'workspace settings must return to channel work screen');

console.log('smoke-creator-current-channel-contract: OK');
