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

const renderAdminFounderSrc = extractBetween(
  botSource,
  'async function renderAdminFounder(ctx) {',
  '\n\n// --- Founder Sale marketing helpers (Admin-only) ---'
);
const founderHelpersSrc = extractBetween(
  botSource,
  'function buildStartLink(tag) {',
  '\n\n\nasync function renderAdminMetrics(ctx, days = 14) {'
);

assert.ok(renderAdminFounderSrc.includes("let text = `🔥 <b>Founder Sale</b>\n\n`;"), 'Admin → Founder must keep stable title');
assert.ok(renderAdminFounderSrc.includes("text += `Источник настроек: <b>${st.hasOverride ? 'ADMIN (Redis override)' : 'ENV'}</b>\n`;"), 'Admin → Founder must keep source line');
assert.ok(renderAdminFounderSrc.includes("text += `ENABLED: <b>${eff.enabled ? 'ON' : 'OFF'}</b>\n`;"), 'Admin → Founder must keep enabled line');
assert.ok(renderAdminFounderSrc.includes("text += `DEADLINE: <b>${escapeHtml(st.deadlineLabel || '—')}</b>\n`;"), 'Admin → Founder must keep deadline line');
assert.ok(renderAdminFounderSrc.includes("text += `STATUS: <b>${escapeHtml(status)}</b>\n`;"), 'Admin → Founder must keep status line');
assert.ok(renderAdminFounderSrc.includes("text += `⏳ Осталось: <b>${dl}</b> ${ruPlural(dl, 'день', 'дня', 'дней')}\n`;"), 'Admin → Founder must keep active countdown line');
assert.ok(renderAdminFounderSrc.includes("text += `\n💰 <b>Цены / кредиты</b>\n`;"), 'Admin → Founder must keep price header');
assert.ok(renderAdminFounderSrc.includes("text += `• Brand 3м: <b>${brand3 || '—'}</b>⭐️${cr3 ? ` · +${cr3} кр.` : ''}\n`;"), 'Admin → Founder must keep Brand 3m line');
assert.ok(renderAdminFounderSrc.includes("text += `• Brand 12м: <b>${brand12 || '—'}</b>⭐️${cr12 ? ` · +${cr12} кр.` : ''}\n`;"), 'Admin → Founder must keep Brand 12m line');
assert.ok(renderAdminFounderSrc.includes("text += `• Creator PRO 12м: <b>${creator12 || '—'}</b>⭐️\n`;"), 'Admin → Founder must keep Creator PRO line');
assert.ok(renderAdminFounderSrc.includes('Чтобы вернуть к ENV — используй «Сброс к ENV».'), 'Admin → Founder must keep ENV reset hint');

assertMatch(
  renderAdminFounderSrc,
  /const kb = new InlineKeyboard\([\s\S]*?\.text\(`ENABLED: \$\{eff\.enabled \? 'ON' : 'OFF'\}`, 'a:admin_founder_toggle'\)\s*\.row\(\)/s,
  'Admin → Founder row 1 must keep enabled toggle'
);
assertMatch(
  renderAdminFounderSrc,
  /\.text\('🗓 Дедлайн', 'a:admin_founder_set_deadline'\)\s*\.text\('💰 Цены', 'a:admin_founder_set_prices'\)\s*\.row\(\)/s,
  'Admin → Founder row 2 must keep deadline + prices controls'
);
assertMatch(
  renderAdminFounderSrc,
  /\.text\('💳 Кредиты', 'a:admin_founder_set_credits'\)\s*\.text\('♻️ Сброс к ENV', 'a:admin_founder_reset'\)\s*\.row\(\)/s,
  'Admin → Founder row 3 must keep credits + reset controls'
);
assertMatch(
  renderAdminFounderSrc,
  /\.text\('🔗 Ссылки', 'a:admin_founder_links'\)\s*\.text\('📝 Тексты', 'a:admin_founder_texts'\)\s*\.row\(\)/s,
  'Admin → Founder row 4 must keep links + texts controls'
);
assertMatch(
  renderAdminFounderSrc,
  /kb[\s\S]*?\.text\('⬅️ Система', 'a:admin_sys'\)\s*\.row\(\)\s*\.text\('📋 Меню', 'a:menu'\)\s*\.text\('🏠 Домой', 'a:home'\);/s,
  'Admin → Founder footer must keep System/Menu/Home navigation'
);

assert.ok(founderHelpersSrc.includes("{ key: 'offers_a', tag: 'fs_offers_a', title: 'Offers A' }"), 'Founder presets must keep offers_a tag');
assert.ok(founderHelpersSrc.includes("{ key: 'offers_b', tag: 'fs_offers_b', title: 'Offers B' }"), 'Founder presets must keep offers_b tag');
assert.ok(founderHelpersSrc.includes("{ key: 'gw_brand', tag: 'fs_gw_brand', title: 'Giveaway Brand' }"), 'Founder presets must keep gw_brand tag');
assert.ok(founderHelpersSrc.includes("{ key: 'gw_creator', tag: 'fs_gw_creator', title: 'Giveaway Creator' }"), 'Founder presets must keep gw_creator tag');
assert.ok(founderHelpersSrc.includes("let text = `🔗 <b>Founder Sale — ссылки</b>\n\n`;"), 'Founder links screen must keep stable title');
assert.ok(founderHelpersSrc.includes('Эти ссылки <b>стабильно переживают пересылку</b> (в отличие от inline-кнопок).'), 'Founder links screen must keep forwarding safety note');
assert.ok(founderHelpersSrc.includes('Используй разные теги для A/B — потом видно по starts/analytics.'), 'Founder links screen must keep A/B note');
assert.ok(founderHelpersSrc.includes("const line = buildStartLink('fs_offers_a');"), 'Founder links screen must keep quick fs_offers_a line');
assert.ok(founderHelpersSrc.includes("if (line) text += `⚡ Быстро: вставляй в конец поста: <code>🔥 Founder Sale: ${escapeHtml(line)}</code>`;"), 'Founder links screen must keep quick copy line');
assertMatch(
  founderHelpersSrc,
  /kb\.text\('📝 Тексты', 'a:admin_founder_texts'\)\s*\.row\(\)\s*\.text\('⬅️ Founder Sale', 'a:admin_founder'\)\s*\.text\('⬅️ Система', 'a:admin_sys'\)\s*\.row\(\)\s*\.text\('📋 Меню', 'a:menu'\)\s*\.text\('🏠 Домой', 'a:home'\);/s,
  'Founder links footer must keep Texts/Founder/System/Menu/Home navigation'
);
assert.ok(founderHelpersSrc.includes("let text = `📝 <b>Founder Sale — тексты (copy/paste)</b>\n\n`;"), 'Founder texts screen must keep stable title');
assert.ok(founderHelpersSrc.includes('<b>1) Пост (бренды)</b>'), 'Founder texts screen must keep brand post section');
assert.ok(founderHelpersSrc.includes('<b>2) Пост (креаторы)</b>'), 'Founder texts screen must keep creator post section');
assert.ok(founderHelpersSrc.includes('<b>3) Сообщение в боте после «Участвовать»</b>'), 'Founder texts screen must keep follow-up section');
assert.ok(founderHelpersSrc.includes('<b>4) Короткая строка для любого поста</b>'), 'Founder texts screen must keep short line section');
assert.ok(founderHelpersSrc.includes("const saleLine = `🔥 Founder Sale: ${linkA}`;"), 'Founder texts screen must keep saleLine helper');
assertMatch(
  founderHelpersSrc,
  /if \(linkA\) kb\.url\('🌐 Открыть Offers A', linkA\)\.url\('🌐 Offers B', linkB\)\.row\(\);/s,
  'Founder texts screen must keep URL buttons for Offers A/B'
);
assertMatch(
  founderHelpersSrc,
  /kb\.text\('🔗 Ссылки', 'a:admin_founder_links'\)\s*\.row\(\)\s*\.text\('⬅️ Founder Sale', 'a:admin_founder'\)\s*\.text\('⬅️ Система', 'a:admin_sys'\)\s*\.row\(\)\s*\.text\('📋 Меню', 'a:menu'\)\s*\.text\('🏠 Домой', 'a:home'\);/s,
  'Founder texts footer must keep Links/Founder/System/Menu/Home navigation'
);

expectRegistry('a:admin_founder', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_founder_toggle', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_founder_set_deadline', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_founder_set_prices', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_founder_set_credits', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_founder_reset', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_founder_links', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_founder_texts', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_sys', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:menu', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:home', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });

console.log('✅ smoke admin-founder contract OK');
