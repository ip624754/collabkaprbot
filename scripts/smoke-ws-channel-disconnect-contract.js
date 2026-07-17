#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTION_GUARD, ACTION_REGISTRY, ACTION_TYPES } from '../src/bot/actionRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function expectRegistry(action, { type, guard }) {
  const meta = ACTION_REGISTRY[action];
  assert.ok(meta, `missing action registry entry: ${action}`);
  assert.equal(meta.type, type, `unexpected type for ${action}`);
  assert.equal(meta.guard, guard, `unexpected guard for ${action}`);
}

function extractBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `marker not found: ${startMarker}`);
  const end = src.indexOf(endMarker, start);
  assert.ok(end > start, `end marker not found after ${startMarker}: ${endMarker}`);
  return src.slice(start, end);
}

const botSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'bot.js'), 'utf8');
const dbSource = fs.readFileSync(path.join(ROOT, 'src', 'db', 'queries.js'), 'utf8');
const migrationSource = fs.readFileSync(path.join(ROOT, 'migrations', '044_workspace_channel_disconnect.sql'), 'utf8');

assert.match(migrationSource, /add column if not exists channel_connected boolean not null default true/i, 'migration must add channel_connected flag');
assert.match(migrationSource, /add column if not exists channel_disconnected_at timestamptz/i, 'migration must add channel_disconnected_at timestamp');

assert.ok(dbSource.includes('coalesce(s.channel_connected, true) as channel_connected'), 'workspace queries must expose channel_connected with fail-open default');
assert.ok(dbSource.includes('s.channel_disconnected_at,'), 'workspace queries must expose channel_disconnected_at');
assert.ok(dbSource.includes('export async function setWorkspaceChannelConnection(workspaceId, connected) {'), 'queries must expose channel connection setter');
assert.ok(dbSource.includes('channel_connected=false,'), 'disconnect setter must flip DB-truth flag off');
assert.ok(dbSource.includes('network_enabled=false,'), 'disconnect setter must disable network');
assert.ok(dbSource.includes('curator_enabled=false,'), 'disconnect setter must disable curator mode');
assert.ok(dbSource.includes('channel_connected=true,'), 'reconnect setter must flip DB-truth flag on');

assert.ok(botSource.includes(".text('⚙️ Настройки', `a:ws_settings|ws:${wsId}`)"), 'workspace work menu must expose dedicated settings entry');
assert.ok(botSource.includes(".text('🌐 Сеть: ✅ ВКЛ', `a:net_q|ws:${wsId}|ret:ws`)") || botSource.includes(".text(net, `a:net_q|ws:${wsId}|ret:ws`)"), 'workspace settings must expose direct network toggle');
assert.ok(botSource.includes(".text('👥 Кураторы', `a:cur_manage|ws:${wsId}`)"), 'workspace settings must expose curator submenu entry');
assert.ok(botSource.includes(".text('⛔ Отключить канал', `a:ws_disconnect_q|ws:${wsId}`)"), 'workspace settings must expose disconnect button');
assert.ok(botSource.includes(".text('🔌 Подключить снова', `a:ws_reconnect_q|ws:${wsId}`)"), 'disconnected workspace screen must expose reconnect button');
assert.ok(botSource.includes("function mainMenuCreatorCurrentKb(flags = {}, ws, opts = {}) {"), 'creator current-channel keyboard must exist');
const mainMenuCreatorCurrentKbSrc = extractBetween(
  botSource,
  'function mainMenuCreatorCurrentKb(flags = {}, ws, opts = {}) {',
  '\n\nfunction mainMenuBrandKb(flags = {}, opts = {}) {'
);
assert.ok(!mainMenuCreatorCurrentKbSrc.includes("🚀 Подключить ещё"), 'creator current-channel menu must drop direct setup CTA from the active main screen');
assert.ok(!mainMenuCreatorCurrentKbSrc.includes("✅ Верификация"), 'creator current-channel menu must drop verification CTA from the active main screen');
assert.ok(!mainMenuCreatorCurrentKbSrc.includes("🔗 Поделиться"), 'creator current-channel menu must drop share CTA from the active main screen');
assert.ok(mainMenuCreatorCurrentKbSrc.includes(".text('💬 Поддержка', 'a:support').row();"), 'creator current-channel menu must keep support footer');
assert.ok(!mainMenuCreatorCurrentKbSrc.includes("🏷 Перейти в бренд"), 'creator current-channel menu must stay channel-first and keep brand mode switching out of the active current-channel screen');
assert.ok(!mainMenuCreatorCurrentKbSrc.includes("🧑‍💼 Режим менеджера бренда"), 'creator current-channel menu must stay channel-first and keep manager mode switching out of the active current-channel screen');
assert.ok(!mainMenuCreatorCurrentKbSrc.includes("🏷 Я бренд"), 'creator current-channel menu must not use the old ambiguous brand-footer copy');
assert.ok(!mainMenuCreatorCurrentKbSrc.includes("🧑‍💼 Я менеджер бренда"), 'creator current-channel menu must not use the old ambiguous manager-footer copy');
assert.ok(botSource.includes("kb.text('🏷 Режим бренда', 'a:ui_mode_set|m:brand|ret:menu')"), 'creator root menu must still expose the explicit creator → brand mode switch');
assert.ok(botSource.includes(".text('🧑‍💼 Режим менеджера бренда', 'a:bm_home')"), 'creator root menu must still expose manager mode entry');
assert.ok(botSource.includes("<b>Текущий канал:</b> <b>${escapeHtml(currentWsLabel(current))}</b>"), 'creator menu must show current channel explicitly');
assert.ok(botSource.includes(".text('📣 Мои каналы', 'a:ws_list')"), 'creator current-channel menu must keep channel picker entry');
assert.ok(botSource.includes(".text('⚙️ Канал', `a:ws_open|ws:${wsId}`)") || botSource.includes(".text('📂 Текущий канал', `a:ws_open|ws:${wsId}`)"), 'creator current-channel menu must expose direct current-channel management entry');
assert.ok(botSource.includes(".text('💬 Диалоги', `a:bx_inbox|ws:${wsId}|p:0|h:bo`)"), 'creator current-channel menu must route inbox to the selected current channel');
assert.ok(botSource.includes(".text('🎁 Розыгрыши', `a:gw_list_ws|ws:${wsId}`)"), 'creator current-channel menu must route giveaways to the selected current channel');
assert.ok(botSource.includes("const label = w.channel_username ? `⛔ @${w.channel_username}` : `⛔ ${w.title}`;"), 'inactive workspace list must visibly mark disconnected channels');

const wsMenuKbSrc = extractBetween(
  botSource,
  'function wsMenuKb(wsId, opts = {}) {',
  '\n\nfunction wsSettingsKb(wsId, s) {'
);
assert.ok(wsMenuKbSrc.includes(".text('💬 Диалоги', `a:bx_inbox|ws:${wsId}|p:0|h:bo`)"), 'workspace work menu must preserve inbox shortcut');
assert.ok(wsMenuKbSrc.includes(".text('📨 Заявки от брендов', `a:ws_leads|ws:${wsId}|s:new|p:0|ret:ws_open`)"), 'workspace work menu must preserve leads shortcut');
assert.ok(wsMenuKbSrc.includes(".text('🎬 UGC / Офферы', `a:bx_open|ws:${wsId}`)"), 'workspace work menu must preserve offers shortcut');
assert.ok(wsMenuKbSrc.includes(".text('📁 Папки', `a:folders_home|ws:${wsId}`)"), 'workspace work menu must preserve folders shortcut');
assert.ok(wsMenuKbSrc.includes(".text('➕ Новый розыгрыш', `a:gw_new|ws:${wsId}`)"), 'workspace work menu must preserve giveaway create shortcut');
assert.ok(wsMenuKbSrc.includes(".text('🎁 Розыгрыши', `a:gw_list_ws|ws:${wsId}`)"), 'workspace work menu must preserve giveaway list shortcut');
assert.ok(wsMenuKbSrc.includes(".text('⚙️ Настройки', `a:ws_settings|ws:${wsId}`)"), 'workspace work menu must route to dedicated settings screen');
assert.ok(!wsMenuKbSrc.includes("a:net_q|ws:${wsId}|ret:ws"), 'workspace work menu must not expose direct network toggle');
assert.ok(!wsMenuKbSrc.includes("a:cur_manage|ws:${wsId}"), 'workspace work menu must not expose curator submenu directly');
assert.ok(!wsMenuKbSrc.includes("a:ws_disconnect_q|ws:${wsId}"), 'workspace work menu must not expose disconnect directly');

const wsSettingsKbSrc = extractBetween(
  botSource,
  'function wsSettingsKb(wsId, s) {',
  '\n\nfunction isWorkspaceDisconnected(ws) {'
);
assert.ok(wsSettingsKbSrc.includes(".text(net, `a:net_q|ws:${wsId}|ret:ws`)"), 'workspace settings must expose direct network toggle');
assert.ok(wsSettingsKbSrc.includes(".text('👥 Кураторы', `a:cur_manage|ws:${wsId}`)"), 'workspace settings must expose curator submenu entry');
assert.ok(wsSettingsKbSrc.includes(".text('👤 Профиль канала', `a:ws_profile|ws:${wsId}`)"), 'workspace settings must expose profile entry');
assert.ok(wsSettingsKbSrc.includes(".text('🧾 История', `a:ws_history|ws:${wsId}`)"), 'workspace settings must expose history entry');
assert.ok(wsSettingsKbSrc.includes(".text('⭐️ PRO', `a:ws_pro|ws:${wsId}`)"), 'workspace settings must expose PRO entry');
assert.ok(wsSettingsKbSrc.includes(".text('⛔ Отключить канал', `a:ws_disconnect_q|ws:${wsId}`)"), 'workspace settings must expose disconnect entry');
assert.ok(wsSettingsKbSrc.includes(".text('⬅️ К каналу', `a:ws_open|ws:${wsId}`)"), 'workspace settings must return to channel work menu');

const renderWorkspaceWorkScreenSrc = extractBetween(
  botSource,
  'async function renderWorkspaceWorkScreen(ctx, ws, opts = {}) {',
  '\n\nasync function renderWorkspaceSettingsScreen(ctx, ws, opts = {}) {'
);
assert.match(renderWorkspaceWorkScreenSrc, /<b>Работа с каналом<\/b>/, 'workspace work screen must use work-menu framing');
assert.match(renderWorkspaceWorkScreenSrc, /Сеть: <b>\$\{net\}<\/b>/, 'workspace work screen must show current network status');
assert.match(renderWorkspaceWorkScreenSrc, /Кураторы: <b>\$\{cur\}<\/b>/, 'workspace work screen must show current curator status');

const renderWorkspaceSettingsScreenSrc = extractBetween(
  botSource,
  'async function renderWorkspaceSettingsScreen(ctx, ws, opts = {}) {',
  '\n\nasync function renderWsOpen(ctx, ownerUserId, wsId, opts = null) {'
);
assert.match(renderWorkspaceSettingsScreenSrc, /<b>Настройки канала<\/b>/, 'workspace settings screen must use settings framing');
assert.match(renderWorkspaceSettingsScreenSrc, /Сеть: <b>\$\{net\}<\/b>/, 'workspace settings screen must show current network status');
assert.match(renderWorkspaceSettingsScreenSrc, /Кураторы: <b>\$\{cur\}<\/b>/, 'workspace settings screen must show current curator status');

const renderWsOpenSrc = extractBetween(
  botSource,
  'async function renderWsOpen(ctx, ownerUserId, wsId, opts = null) {',
  '\n\nasync function renderWsSettings(ctx, ownerUserId, wsId) {'
);
assert.match(renderWsOpenSrc, /if \(isWorkspaceDisconnected\(ws\)\) \{[\s\S]*?await renderWsDisconnected\(/, 'ws_open must route disconnected channels to the special disabled screen');
assert.ok(renderWsOpenSrc.includes('await renderWorkspaceWorkScreen(ctx, ws, { showCurator });'), 'ws_open must render the channel work screen');

const renderWsSettingsSrc = extractBetween(
  botSource,
  'async function renderWsSettings(ctx, ownerUserId, wsId) {',
  '\n\nasync function renderWsHistory(ctx, ownerUserId, wsId) {'
);
assert.ok(renderWsSettingsSrc.includes('await renderWorkspaceSettingsScreen(ctx, ws, { showCurator });'), 'ws_settings must render the dedicated settings screen');

const curManageKbSrc = extractBetween(
  botSource,
  'function curManageKb(wsId, ws = null) {',
  '\n\nasync function wsCuratorLimitInfo(wsId) {'
);
assert.ok(curManageKbSrc.includes("kb.text(toggleLabel, `a:ws_toggle_cur|ws:${wsId}|ret:cur_manage`).row();"), 'curator submenu must keep direct enable/disable toggle');
assert.ok(curManageKbSrc.includes(".text('➕ Добавить куратора', `a:cur_add_username|ws:${wsId}`)"), 'curator submenu must expose add curator entry');
assert.ok(curManageKbSrc.includes(".text('👥 Список кураторов', `a:cur_list|ws:${wsId}`)"), 'curator submenu must expose curator list');
assert.ok(curManageKbSrc.includes("text('⬅️ К настройкам', `a:ws_settings|ws:${wsId}`)"), 'curator submenu must return to channel settings');

const renderCuratorManageSrc = extractBetween(
  botSource,
  'async function renderCuratorManage(ctx, ownerUserId, wsId, opts = {}) {',
  '\n\n\nfunction brandTeamKb({'
);
assert.match(renderCuratorManageSrc, /👥 <b>Управление кураторами<\/b>|👥 <b>Кураторы канала<\/b>/, 'curator submenu screen must use explicit channel-scoped framing');
assert.match(renderCuratorManageSrc, /Статус: <b>\$\{status\}<\/b>/, 'curator submenu screen must show current toggle status');

const renderBxOpenSrc = extractBetween(
  botSource,
  'async function renderBxOpen(ctx, ownerUserId, wsId) {',
  '\n\nasync function renderBxFeed(ctx, ownerUserId, wsId, page = 0, opts = {}) {'
);
assert.match(renderBxOpenSrc, /if \(isWorkspaceDisconnected\(ws\)\) \{[\s\S]*?await renderWsDisconnected\(/, 'bx_open must gate disconnected workspaces');

const ensureWsSrc = extractBetween(
  botSource,
  'async function ensureWorkspaceForOwner(ctx, ownerUserId, opts = null) {',
  '\n\nasync function renderWsList(ctx, ownerUserId) {'
);
assert.ok(ensureWsSrc.includes('const resolved = await resolveCurrentWorkspaceForOwner(ownerUserId, Number(ctx?.from?.id || 0));'), 'ensureWorkspaceForOwner must resolve current channel through the shared helper');
assert.ok(ensureWsSrc.includes("if (wsList.length && !activeWsList.length) kb.row().text('📦 Неактивные каналы', 'a:ws_list_inactive');"), 'ensureWorkspaceForOwner must still surface inactive channel recovery in minimal gates');

const renderWsListSrc = extractBetween(
  botSource,
  'async function renderWsList(ctx, ownerUserId) {',
  '\n\nasync function renderWsInactiveList(ctx, ownerUserId) {'
);
assert.match(renderWsListSrc, /Выбери канал для управления\./, 'ws_list must use compact picker copy');
assert.ok(!renderWsListSrc.includes('Выбери канал — дальше можно:'), 'ws_list must drop the old explanatory bullet block');
assert.ok(renderWsListSrc.includes("kb.text('🚀 Подключить ещё', 'a:setup').row();"), 'ws_list must keep setup entry on the picker');
assert.ok(renderWsListSrc.includes("kb.text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');"), 'ws_list must return back into the creator main menu');
assert.ok(renderWsListSrc.includes("kb.text(`📦 Неактивные (${inactiveItems.length})`, 'a:ws_list_inactive').row();"), 'ws_list must keep inactive channel entry when present');

const renderCreatorCurrentMenuSrc = extractBetween(
  botSource,
  'async function renderCreatorCurrentMenu(ctx, u, flags = {}, params = {}) {',
  '\n\nasync function renderRoleHub(ctx, u, flags) {'
);
assert.match(renderCreatorCurrentMenuSrc, /<b>Текущий канал:<\/b> <b>\$\{escapeHtml\(currentWsLabel\(current\)\)\}<\/b>/, 'creator current menu must render the selected current channel label');
assert.match(renderCreatorCurrentMenuSrc, /Действия ниже относятся к текущему каналу\./, 'creator current menu must explain that channel-specific actions are scoped to current channel');
assert.ok(renderCreatorCurrentMenuSrc.includes('const resolved = await resolveCurrentWorkspaceForOwner(userId, tgId);'), 'creator current menu must resolve current channel through the shared helper');

const renderRoleHubSrc = extractBetween(
  botSource,
  'async function renderRoleHub(ctx, u, flags) {',
  '\n\nfunction curatorModeMenuKb(flags = {}) {'
);
assert.ok(renderRoleHubSrc.includes('await renderCreatorCurrentMenu(ctx, u, flags, { edit: true });'), 'role hub must open creator current-channel menu instead of jumping straight into a workspace card');

const resolveCurrentWorkspaceSrc = extractBetween(
  botSource,
  'async function resolveCurrentWorkspaceForOwner(ownerUserId, tgId, opts = {}) {',
  '\n\n// Curator UI mode'
);
assert.ok(resolveCurrentWorkspaceSrc.includes('const activeWsList = (wsList || []).filter((w) => !isWorkspaceDisconnected(w));'), 'current workspace resolver must only consider connected channels');
assert.ok(resolveCurrentWorkspaceSrc.includes('await setActiveWorkspace(tgId, Number(current.id));'), 'current workspace resolver must persist the resolved current channel in Redis');

const disconnectHandlerSrc = extractBetween(
  botSource,
  "    if (p.a === 'a:ws_disconnect_q') {",
  "    if (p.a === 'a:net_q') {"
);
assert.ok(disconnectHandlerSrc.includes('await db.setWorkspaceChannelConnection(wsId, false);'), 'disconnect handler must persist DB-truth disconnect');
assert.ok(disconnectHandlerSrc.includes("await db.auditWorkspace(wsId, u.id, 'ws.channel_disconnected'"), 'disconnect handler must audit action');
assert.ok(disconnectHandlerSrc.includes('await invalidateWorkspacesCache(u.id);'), 'disconnect handler must invalidate cached ws list');
assert.ok(disconnectHandlerSrc.includes('await db.setWorkspaceChannelConnection(wsId, true);'), 'reconnect handler must persist DB-truth reconnect');
assert.ok(disconnectHandlerSrc.includes("await db.auditWorkspace(wsId, u.id, 'ws.channel_reconnected'"), 'reconnect handler must audit reconnect');

const gwPublishSrc = extractBetween(
  botSource,
  "if (p.a === 'a:gw_publish') {",
  '\n\n    // Join / Check'
);
assert.match(gwPublishSrc, /if \(isWorkspaceDisconnected\(ws\)\) \{[\s\S]*?await renderWsDisconnected\(/, 'gw_publish must block disconnected workspaces');

const bxPublishSrc = extractBetween(
  botSource,
  "    if (p.a === 'a:bx_publish') {",
  "    if (p.a === 'a:bx_view') {"
);
assert.match(bxPublishSrc, /if \(isWorkspaceDisconnected\(ws\)\) \{[\s\S]*?await renderWsDisconnected\(/, 'bx_publish must block disconnected workspaces');

expectRegistry('a:ws_list_inactive', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:ws_disconnect_q', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:ws_disconnect_do', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:ws_reconnect_q', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:ws_reconnect_do', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:cur_manage', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });

console.log('✅ smoke ws channel disconnect + IA contract OK');
