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

const renderAdminSystemSrc = extractBetween(
  botSource,
  'async function renderAdminSystem(ctx) {',
  '\n\n\n// =====================================================\n// Admin tool: Payments fallback apply'
);

assert.ok(renderAdminSystemSrc.includes("let text = '⚙️ Админка → Система\\n\\n';"), 'Admin → System title must stay stable');
assert.ok(renderAdminSystemSrc.includes("text += `Платежи: прием ${payAccept ? 'ON' : 'OFF'} • автовыдача ${payAutoApply ? 'ON' : 'OFF'}\\n`;"), 'Admin → System must keep payments summary line');
assert.ok(renderAdminSystemSrc.includes("text += `Match/Feat auto-apply: ${mfAutoApply ? 'ON' : 'OFF'}\\n`;"), 'Admin → System must keep Match/Feat summary line');
assert.ok(renderAdminSystemSrc.includes("text += `Payments fallback apply: ${fbEff ? 'ON' : 'OFF'} (env ${fbEnv ? 'ON' : 'OFF'} • runtime ${fbRtLabel})\\n`;"), 'Admin → System must keep fallback summary line');
assert.ok(renderAdminSystemSrc.includes("text += `Broadcast fan-out (QStash): ${bcFanout ? 'ON' : 'OFF'}\\n`;"), 'Admin → System must keep QStash fan-out summary line');
assert.ok(renderAdminSystemSrc.includes("text += `Founder Sale: ${founderOn ? 'ON' : 'OFF'} • ${founderActive ? 'ACTIVE' : 'INACTIVE'} • до ${founderUntil}${founderState.hasOverride ? ' (ADMIN)' : ''}\\n`;"), 'Admin → System must keep Founder Sale summary line');

assertMatch(
  renderAdminSystemSrc,
  /const kb = new InlineKeyboard\([\s\S]*?\.text\(`💳 Прием: \$\{payAccept \? 'ON' : 'OFF'\}`, 'a:admin_pay_accept_toggle'\)\s*\.text\(`⚙️ Автовыдача: \$\{payAutoApply \? 'ON' : 'OFF'\}`, 'a:admin_pay_auto_toggle'\)\s*\.row\(\)/s,
  'Admin → System row 1 must keep payment toggles'
);
assertMatch(
  renderAdminSystemSrc,
  /\.text\(`🎯🔥 Match\/Feat: \$\{mfAutoApply \? 'ON' : 'OFF'\}`, 'a:admin_matchfeat_auto_toggle'\)\s*\.text\(`🧯 Fallback: \$\{fbEff \? 'ON' : 'OFF'\}`, 'a:admin_pay_fb'\)\s*\.row\(\)/s,
  'Admin → System row 2 must keep Match/Feat + Fallback actions'
);
assertMatch(
  renderAdminSystemSrc,
  /\.text\(`📣 QStash fan-out: \$\{bcFanout \? 'ON' : 'OFF'\}`, 'a:admin_bc_qstash_toggle'\)\s*\.text\('🛰 QStash статус', 'a:admin_qstash_status'\)\s*\.row\(\)/s,
  'Admin → System row 3 must keep QStash controls'
);
assertMatch(
  renderAdminSystemSrc,
  /\.text\('🧱 Hard-skip \(dead chats\)', 'a:hs_home\|p:0'\)\s*\.row\(\)/s,
  'Admin → System must keep Hard-skip entrypoint'
);
assertMatch(
  renderAdminSystemSrc,
  /\.text\('🔥 Founder Sale', 'a:admin_founder'\)\s*\.row\(\)/s,
  'Admin → System must keep Founder Sale entrypoint'
);
assertMatch(
  renderAdminSystemSrc,
  /\.text\('➕ Модератор', 'a:admin_mod_add'\)\s*\.text\('📋 Модераторы', 'a:admin_mod_list'\)\s*\.row\(\)/s,
  'Admin → System must keep moderator controls'
);
assertMatch(
  renderAdminSystemSrc,
  /\.text\('🎁 Подарить подписку', 'a:adm_gift'\)\s*\.row\(\)/s,
  'Admin → System must keep gift subscription entrypoint'
);
assertMatch(
  renderAdminSystemSrc,
  /kb[\s\S]*?\.text\('⬅️ Админка', 'a:admin_home'\)\s*\.row\(\)\s*\.text\('📋 Меню', 'a:menu'\)\s*\.text\('🏠 Home', 'a:home'\);/s,
  'Admin → System footer must keep Admin/Menu/Home navigation'
);

expectRegistry('a:admin_sys', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_pay_accept_toggle', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_pay_auto_toggle', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_matchfeat_auto_toggle', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_pay_fb', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_bc_qstash_toggle', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_qstash_status', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:hs_home', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:admin_founder', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_mod_add', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_mod_list', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:adm_gift', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_home', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:menu', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:home', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });

console.log('✅ smoke admin-system keyboard/footer contract OK');
