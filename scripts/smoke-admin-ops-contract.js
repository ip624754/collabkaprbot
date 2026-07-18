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

const renderAdminOpsSrc = extractBetween(
  botSource,
  "async function renderAdminOps(ctx, { banner = '' } = {}) {",
  "\n\n\nasync function renderAdminComms(ctx) {"
);

assertMatch(
  renderAdminOpsSrc,
  /const kb = new InlineKeyboard\([\s\S]*?\.text\('👥 Пользователи', 'a:admin_users\|f:all\|p:0'\)\s*\.text\('💰 Платежи', 'a:admin_payments'\)\s*\.row\(\)/s,
  'Admin → Ops row 1 must keep Users + Payments buttons'
);
assertMatch(
  renderAdminOpsSrc,
  /\.text\('📣 Рассылка', (?:'a:bc_list\|p:0'|commsCb\.bcList\(0\))\)\s*\.text\('📜 Аудит', 'a:aud\|h:24\|p:0'\)\s*\.row\(\)/s,
  'Admin → Ops row 2 must keep Broadcast + Audit buttons'
);
assertMatch(
  renderAdminOpsSrc,
  /\.text\('📈 Метрики', 'a:admin_metrics\|d:14'\)\s*\.text\('🎁 Инвайты', 'a:admin_invites'\)\s*\.row\(\)/s,
  'Admin → Ops row 3 must keep Metrics + Invites buttons'
);
assertMatch(
  renderAdminOpsSrc,
  /kb\.text\('🧾 Отправить сводку событий', 'a:admin_ops_flush'\)\.row\(\);/s,
  'Admin → Ops must keep Flush ops digest action'
);
assertMatch(
  renderAdminOpsSrc,
  /kb\.text\('🧹 Очистить снимок очереди', 'a:admin_ops_pending_clear'\)\.row\(\);/s,
  'Admin → Ops must keep Clear pending snapshot action'
);
assertMatch(
  renderAdminOpsSrc,
  /if \(CFG\.PUBLIC_BASE_URL\) \{[\s\S]*?kb\.url\('🩺 \/api\/health', `\$\{CFG\.PUBLIC_BASE_URL\}\/api\/health`\)\.row\(\);[\s\S]*?\}/s,
  'Admin → Ops must keep the /api/health URL button behind PUBLIC_BASE_URL gate'
);
assertMatch(
  renderAdminOpsSrc,
  /kb[\s\S]*?\.text\('⬅️ Админка', 'a:admin_home'\)\s*\.row\(\)\s*\.text\('📋 Меню', 'a:menu'\)\s*\.text\('🏠 Домой', 'a:home'\);/s,
  'Admin → Ops footer must keep Admin/Menu/Home navigation'
);

const pendingClearConfirmSrc = extractBetween(
  botSource,
  "if (p.a === 'a:admin_ops_pending_clear') {",
  "if (p.a === 'a:admin_ops_pending_clear_do') {"
);
assertMatch(
  pendingClearConfirmSrc,
  /const kb = new InlineKeyboard\([\s\S]*?\.text\('✅ Очистить snapshot', 'a:admin_ops_pending_clear_do'\)\s*\.row\(\)\s*\.text\('⬅️ Операции', 'a:admin_ops'\)\s*\.row\(\)\s*\.text\('📋 Меню', 'a:menu'\)\s*\.text\('🏠 Домой', 'a:home'\);/s,
  'Pending snapshot confirm screen must keep confirm/back/footer actions'
);

expectRegistry('a:admin_ops', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:admin_ops_flush', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:admin_ops_pending_clear', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:admin_ops_pending_clear_do', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:admin_users', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS, breakGlass: true });
expectRegistry('a:admin_payments', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS, breakGlass: true });
expectRegistry('a:bc_list', { type: ACTION_TYPES.OPS, guard: ACTION_GUARD.NONE });
expectRegistry('a:aud', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS, breakGlass: true });
expectRegistry('a:admin_metrics', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_home', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:menu', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:home', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });

console.log('✅ smoke admin-ops keyboard/actions contract OK');
