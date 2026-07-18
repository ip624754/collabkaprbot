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

assert.ok(botSource.includes('function brandDirFilterSummaryLines(f) {'), 'brand dir multiline summary helper must exist');
assert.ok(botSource.includes('function bxFilterSummaryLines(f) {'), 'bx multiline summary helper must exist');
assert.ok(botSource.includes('function hasActiveBxFilter(f) {'), 'bx active-filter helper must exist');

const brandFiltersSrc = extractBetween(
  botSource,
  'async function renderBrandDirFilters(ctx, viewerUserId, params = {}) {',
  '\n\nasync function renderBrandDirFilterPick(ctx, viewerUserId, params = {}) {'
);

const brandCatalogSrc = extractBetween(
  botSource,
  'async function renderBrandsDirectory(ctx, viewerUserId, params = {}) {',
  '\n\nasync function renderBrandDirectoryCard(ctx, viewerUserId, params = {}) {'
);

const bxFiltersSrc = extractBetween(
  botSource,
  'async function renderBxFilters(ctx, ownerUserId, wsId, page = 0, opts = {}) {',
  '\n\nasync function renderBxFilterPick(ctx, ownerUserId, wsId, key, retPage = 0, pickPage = 0, opts = {}) {'
);

const bxFeedSrc = extractBetween(
  botSource,
  'async function renderBxFeed(ctx, ownerUserId, wsId, page = 0, opts = {}) {',
  '\n\nasync function renderBxMy(ctx, ownerUserId, wsId, page = 0) {'
);

const bxSmartSrc = extractBetween(
  botSource,
  'function bxSmartPrefillText(next, info, totalAll, totalFiltered) {',
  '\n\nfunction bxSmartKb(wsId, opts = {}) {'
);

assert.ok(brandFiltersSrc.includes('Режим: 🎬 Креатор\nКаталог: 🏷 Бренды'), 'brand filters header must be split into separate lines');
assert.ok(brandFiltersSrc.includes('Фильтры работают по данным из профиля бренда.'), 'brand filters must use human copy about profile data');
assert.ok(brandFiltersSrc.includes('Найдено брендов: <b>${matchCount}</b>'), 'brand filters must say "Найдено брендов"');
assert.ok(brandFiltersSrc.includes('Нажми «📋 Показать бренды», чтобы открыть список.'), 'brand filters helper must say открыть список');
assert.ok(!brandFiltersSrc.includes('Совпадений брендов'), 'brand filters must not keep old "Совпадений брендов" copy');
assert.ok(!brandFiltersSrc.includes('увидеть выдачу'), 'brand filters must not keep old bureaucratic helper');
assert.ok(!brandFiltersSrc.includes('Фильтруем бренды по тому, что бренд заполнил в профиле.'), 'brand filters must not keep old robotic explanation');

assert.ok(brandCatalogSrc.includes('Режим: 🎬 Креатор\nКаталог: 🏷 Бренды'), 'brand catalog header must be split into separate lines');
assert.ok(brandCatalogSrc.includes('Показываем бренды по данным из их профиля.'), 'brand catalog helper must use human copy');
assert.ok(brandCatalogSrc.includes('По этим фильтрам бренды пока не найдены.'), 'brand catalog zero-state must be short and direct');
assert.ok(brandCatalogSrc.includes('Ослабь 1–2 фильтра или нажми «♻️ Сброс».'), 'brand catalog zero-state must suggest next action');
assert.ok(brandCatalogSrc.includes('Выбери бренд из списка:'), 'brand catalog positive state must use simpler CTA');
assert.ok(!brandCatalogSrc.includes('Фильтры берутся из настроек брендов'), 'brand catalog must drop internal-mechanics wording');
assert.ok(!brandCatalogSrc.includes('Показываю бренды с заполненным профилем (4/4).'), 'brand catalog must drop systemy 4/4 wording');

assert.ok(bxFiltersSrc.includes('Режим: 🏷 Бренд\nЛента: 🎬 Креаторы'), 'bx filters header must be split into separate lines');
assert.ok(bxFiltersSrc.includes('Фильтры работают по данным из оффера креатора.'), 'bx filters must use human copy about offer data');
assert.ok(bxFiltersSrc.includes('Для тегов достаточно совпадения по любому выбранному значению.'), 'bx filters must explain tag matching in plain language');
assert.ok(bxFiltersSrc.includes('Нажми «📋 Показать креаторов», чтобы открыть ленту.'), 'bx filters helper must say открыть ленту');
assert.ok(!bxFiltersSrc.includes('Фильтруем креаторов по тому, что они указали в оффере.'), 'bx filters must drop old robotic copy');
assert.ok(!bxFiltersSrc.includes('увидеть выдачу'), 'bx filters must not keep old bureaucratic helper');

assert.ok(bxFeedSrc.includes('Режим: 🏷 Бренд\nЛента: 🎬 Креаторы'), 'bx feed header must be split into separate lines');
assert.ok(bxFeedSrc.includes('По этим фильтрам креаторы не найдены.'), 'bx feed zero-state must be short and direct');
assert.ok(bxFeedSrc.includes('Ослабь 1–2 фильтра или нажми «♻️ Сбросить».'), 'bx feed zero-state must suggest reset/relax next step');
assert.ok(!bxFeedSrc.includes('Пока нет офферов по этим фильтрам.'), 'bx feed must not keep flat zero-state copy');

assert.ok(bxSmartSrc.includes('По этим фильтрам сейчас нет результатов.'), 'smart prefill hint must use friendlier zero-results wording');
assert.ok(!bxSmartSrc.includes('Сейчас <b>0</b> результатов.'), 'smart prefill hint must not keep old robotic zero-results wording');

console.log('✅ smoke copy wave 1 contract OK');
