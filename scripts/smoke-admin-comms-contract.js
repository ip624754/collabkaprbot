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

const renderAdminCommsSrc = extractBetween(
  botSource,
  'async function renderAdminComms(ctx) {',
  '\n\nasync function renderAdminSystem(ctx) {'
);

assert.ok(renderAdminCommsSrc.includes("let text = '💬 Админка → Коммуникации\\n\\n';"), 'Admin → Comms title must stay stable');
assert.ok(renderAdminCommsSrc.includes("text += '• 📣 Системное объявление — баннер без массовой отправки\\n';"), 'Admin → Comms must describe System Notice');
assert.ok(renderAdminCommsSrc.includes("text += '• 📌 Шаблоны личных сообщений — быстрые ответы оператора\\n';"), 'Admin → Comms must describe personal-message templates');
assert.ok(renderAdminCommsSrc.includes("text += '• 📤 Исходящие — журнал сообщений из админки\\n';"), 'Admin → Comms must describe outgoing log');

assertMatch(
  renderAdminCommsSrc,
  /const kb = new InlineKeyboard\([\s\S]*?\.text\('📣 Объявление', (?:'a:admin_notice'|commsCb\.adminNotice\(\))\)\s*\.text\('📌 Шаблоны сообщений', 'a:admin_umsg_tpls\|p:0'\)\s*\.row\(\)\s*\.text\('📤 Исходящие', 'a:admin_outbox\|p:0'\)\s*\.text\('🆘 Поддержка', 'a:admin_support'\);/s,
  'Admin → Comms primary keyboard rows must keep Notice + DM templates + Outbox + Support'
);
assertMatch(
  renderAdminCommsSrc,
  /if \(CFG\.OFFICIAL_PUBLISH_ENABLED\) text \+= `• 📣 Официальный канал — очередь публикаций \(\$\{pending\}\)\\n`;/s,
  'Admin → Comms text must gate Official channel queue by OFFICIAL_PUBLISH_ENABLED'
);
assert.ok(
  renderAdminCommsSrc.includes("if (CFG.OFFICIAL_PUBLISH_ENABLED) kb.row().text(`📣 Официальный канал (${pending})`, 'a:off_queue|p:0');"),
  'Admin → Comms keyboard must gate Official channel queue button by OFFICIAL_PUBLISH_ENABLED'
);
assertMatch(
  renderAdminCommsSrc,
  /kb[\s\S]*?\.text\('⬅️ Админка', 'a:admin_home'\)\s*\.row\(\)\s*\.text\('📋 Меню', 'a:menu'\)\s*\.text\('🏠 Домой', 'a:home'\);/s,
  'Admin → Comms footer must keep Admin/Menu/Home navigation'
);

expectRegistry('a:admin_comms', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_notice', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_umsg_tpls', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_outbox', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:off_queue', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:admin_home', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:menu', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:home', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });

console.log('✅ smoke admin-comms keyboard/footer contract OK');
