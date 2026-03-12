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

assert.ok(botSource.includes(".text('👥 Кураторы и сеть', `a:ws_settings|ws:${wsId}`)"), 'workspace open menu must expose settings entry for disconnect flow');
assert.ok(botSource.includes(".text('⛔ Отключить канал', `a:ws_disconnect_q|ws:${wsId}`)"), 'workspace settings screen must expose disconnect button');
assert.ok(botSource.includes(".text('🔌 Подключить снова', `a:ws_reconnect_q|ws:${wsId}`)"), 'disconnected workspace screen must expose reconnect button');
assert.ok(botSource.includes("kb.text(`📦 Неактивные (${inactiveItems.length})`, 'a:ws_list_inactive').row();"), 'active workspace list must link to inactive list');
assert.ok(botSource.includes("const label = w.channel_username ? `⛔ @${w.channel_username}` : `⛔ ${w.title}`;"), 'inactive workspace list must visibly mark disconnected channels');

const renderWsOpenSrc = extractBetween(
  botSource,
  'async function renderWsOpen(ctx, ownerUserId, wsId, opts = null) {',
  '\n\nasync function renderWsSettings(ctx, ownerUserId, wsId) {'
);
const wsMenuKbSrc = extractBetween(
  botSource,
  'function wsMenuKb(wsId, opts = {}) {',
  '\n\nfunction wsSettingsKb(wsId, s) {'
);
assert.ok(wsMenuKbSrc.includes(".text('👥 Кураторы и сеть', `a:ws_settings|ws:${wsId}`)"), 'workspace open menu must expose settings entry for disconnect flow');

assert.match(renderWsOpenSrc, /if \(isWorkspaceDisconnected\(ws\)\) \{[\s\S]*?await renderWsDisconnected\(/, 'ws_open must route disconnected channels to the special disabled screen');

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
assert.ok(ensureWsSrc.includes("const activeWsList = (wsList || []).filter((w) => !isWorkspaceDisconnected(w));"), 'ensureWorkspaceForOwner must prefer connected workspaces');
assert.ok(ensureWsSrc.includes("if (wsList.length && !activeWsList.length) kb.row().text('📦 Неактивные каналы', 'a:ws_list_inactive');"), 'ensureWorkspaceForOwner must surface inactive channel recovery');

const disconnectHandlerSrc = extractBetween(
  botSource,
  "    if (p.a === 'a:ws_disconnect_q') {",
  "    if (p.a === 'a:net_q') {"
);
assert.ok(disconnectHandlerSrc.includes("await db.setWorkspaceChannelConnection(wsId, false);"), 'disconnect handler must persist DB-truth disconnect');
assert.ok(disconnectHandlerSrc.includes("await db.auditWorkspace(wsId, u.id, 'ws.channel_disconnected'"), 'disconnect handler must audit action');
assert.ok(disconnectHandlerSrc.includes('await invalidateWorkspacesCache(u.id);'), 'disconnect handler must invalidate cached ws list');
assert.ok(disconnectHandlerSrc.includes("await db.setWorkspaceChannelConnection(wsId, true);"), 'reconnect handler must persist DB-truth reconnect');
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

console.log('✅ smoke ws channel disconnect contract OK');
