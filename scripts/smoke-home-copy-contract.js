#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const botSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'bot.js'), 'utf8');
const renderHomeHubSrc = extractBetween(
  botSource,
  'async function renderHomeHub(ctx, u, flags = {}, opts = {}) {',
  '\n\n\nasync function renderFounderSale(ctx, u, params = {}) {'
);

assert.ok(!renderHomeHubSrc.includes('<b>Карта</b>'), 'Home hub must not render a Карта block');
assert.ok(!renderHomeHubSrc.includes('→'), 'Home hub must not render route chains with arrows');
assert.ok(!renderHomeHubSrc.includes('Выбери режим работы.'), 'Home hub must not keep old mode-selection copy');
assert.ok(!renderHomeHubSrc.includes('Текущий режим:'), 'Home hub must not keep old current-mode tail copy');
assert.ok(!renderHomeHubSrc.includes('Дальше следуй по “Карте”'), 'Home hub must not reference Карта from onboarding banner');

assert.ok(renderHomeHubSrc.includes('Режим: <b>${escapeHtml(modeLabel)}</b>'), 'Home hub must show concise current role copy');
assert.ok(renderHomeHubSrc.includes('📣 Мои каналы — офферы, Inbox и заявки брендов.'), 'Creator home must explain channels branch briefly');
assert.ok(renderHomeHubSrc.includes('🏷 Каталог брендов — найти бренд и оставить заявку.'), 'Creator home must explain brand catalog briefly');
assert.ok(renderHomeHubSrc.includes('🎬 Офферы — лента и поиск креаторов.'), 'Brand home must explain offers briefly');
assert.ok(renderHomeHubSrc.includes('📥 Inbox — диалоги и новые заявки.'), 'Brand home must explain inbox briefly');
assert.ok(renderHomeHubSrc.includes('🎛 Фильтры — уточнить подбор креаторов.'), 'Brand home must explain filters briefly');
assert.ok(renderHomeHubSrc.includes('🧹 Кабинет куратора — рабочий хаб.'), 'Curator home must explain curator hub briefly');
assert.ok(renderHomeHubSrc.includes('🔓 Обычный режим — вернуться в режим креатора или бренда.'), 'Curator home must explain return path briefly');
assert.ok(renderHomeHubSrc.includes('Выбери раздел ниже.'), 'Home hub must end with concise next-step copy');
assert.ok(renderHomeHubSrc.includes('Основные разделы уже доступны кнопками на этом экране'), 'Home hub hint banner must stay short and action-oriented');

assert.ok(!renderHomeHubSrc.includes('Продолжить:'), 'Home hub must not keep a vague continue CTA');
assert.ok(renderHomeHubSrc.includes("const bCreator = `${effective === 'creator' ? '✅ ' : ''}🤳 Креатор`;"), 'Home hub must use the canonical creator role label');
assert.ok(renderHomeHubSrc.includes("const bBrand = `${effective === 'brand' ? '✅ ' : ''}🏷 Бренд`;"), 'Home hub must use the canonical brand role label');
assert.ok(renderHomeHubSrc.includes(".text('📋 Меню', 'a:menu').text('📨 Инвайты', 'a:share').row();"), 'Home hub must keep footer row');
assert.ok(renderHomeHubSrc.includes("kb.text('💬 Поддержка', 'a:support').row();"), 'Home hub must keep support CTA');

console.log('✅ smoke home copy contract OK');
