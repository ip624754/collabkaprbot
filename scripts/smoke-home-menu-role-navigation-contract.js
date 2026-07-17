#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function walkJs(relDir) {
  const root = path.join(ROOT, relDir);
  const out = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      const st = fs.statSync(abs);
      if (st.isDirectory()) walk(abs);
      else if (st.isFile() && name.endsWith('.js')) out.push(abs);
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}

function extractBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `marker not found: ${startMarker}`);
  const end = src.indexOf(endMarker, start);
  assert.ok(end > start, `end marker not found after ${startMarker}: ${endMarker}`);
  return src.slice(start, end);
}

function collectStaticButtonLabels(source, callback) {
  const escaped = callback.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const dotText = new RegExp(
    String.raw`\.text\(\s*(['"])((?:\\.|(?!\1)[^\\\r\n])*)\1\s*,\s*(['"])${escaped}\3`,
    'g'
  );
  const objectText = new RegExp(
    String.raw`text:\s*(['"])((?:\\.|(?!\1)[^\\\r\n])*)\1\s*,\s*callback_data:\s*(['"])${escaped}\3`,
    'g'
  );
  const labels = [];
  for (const re of [dotText, objectText]) {
    for (const match of source.matchAll(re)) labels.push(match[2]);
  }
  return labels;
}

const runtimeFiles = [...walkJs('src'), ...walkJs('api')];
let runtimeSource = '';
for (const abs of runtimeFiles) runtimeSource += `\n/* ${path.relative(ROOT, abs)} */\n${fs.readFileSync(abs, 'utf8')}`;

const homeLabels = collectStaticButtonLabels(runtimeSource, 'a:home');
const menuLabels = collectStaticButtonLabels(runtimeSource, 'a:menu');

assert.ok(homeLabels.length >= 200, `expected broad a:home coverage, got ${homeLabels.length}`);
assert.ok(menuLabels.length >= 200, `expected broad a:menu coverage, got ${menuLabels.length}`);
assert.deepEqual([...new Set(homeLabels)], ['🏠 Домой'], 'every static a:home button must be labelled 🏠 Домой');
assert.deepEqual([...new Set(menuLabels)], ['📋 Меню'], 'every static a:menu button must be labelled 📋 Меню');
assert.ok(!runtimeSource.includes('🏠 Home'), 'active runtime must not expose the legacy English Home label');
assert.ok(!runtimeSource.includes(".text('🏠 Главное меню', 'a:menu')"), 'a:menu must not use a Home-style label');
assert.ok(!runtimeSource.includes(".text('⬅️ К меню', 'a:menu')"), 'a:menu must not masquerade as a local back action');
assert.ok(!runtimeSource.includes(".text('⬅️ В меню', 'a:menu')"), 'a:menu must use the canonical label');
assert.ok(!runtimeSource.includes(".text('❌ Отмена', 'a:menu')"), 'a:menu must not masquerade as a cancel action');
assert.ok(!runtimeSource.includes(".text('🏷 Я бренд', 'a:ui_mode_set|m:brand|ret:menu')"), 'brand mode switch must use the canonical role-mode label');
assert.ok(!runtimeSource.includes("'🏷 Brand'"), 'active runtime role labels must use Бренд');
assert.ok(!runtimeSource.includes("'✨ Creator'"), 'active runtime role labels must use Креатор');
assert.ok(!runtimeSource.includes('<b>Верификация Creator</b>'), 'verification heading must use the canonical Russian role label');
assert.ok(!runtimeSource.includes('Для Creator’ов'), 'help copy must use the canonical Russian role label');

const botSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'bot.js'), 'utf8');
const renderHomeHub = extractBetween(
  botSource,
  'async function renderHomeHub(ctx, u, flags = {}, opts = {}) {',
  '\n\n\nasync function renderFounderSale(ctx, u, params = {}) {'
);
const renderRoleSelection = extractBetween(
  botSource,
  'async function renderRoleSelection(ctx, u, opts = {}) {',
  '\n\nasync function renderAccountDeletedGate(ctx, opts = {}) {'
);
const renderMainMenu = extractBetween(
  botSource,
  'async function renderMainMenu(ctx, flags, params = {}) {',
  '\n\n\nasync function renderHomeHub(ctx, u, flags = {}, opts = {}) {'
);

assert.ok(renderHomeHub.includes('`🏠 <b>Домой</b>'), 'global role hub must be titled Домой');
assert.ok(renderHomeHub.includes("const bCreator = `${effective === 'creator' ? '✅ ' : ''}🤳 Креатор`;"), 'Home role selector must use Креатор');
assert.ok(renderHomeHub.includes("const bBrand = `${effective === 'brand' ? '✅ ' : ''}🏷 Бренд`;"), 'Home role selector must use Бренд');
assert.ok(!renderHomeHub.includes('Продолжить:'), 'Home must not keep a vague continue CTA');
assert.ok(renderHomeHub.includes(".text(bCreator, 'a:home_mode|m:creator')"), 'creator role callback must remain unchanged');
assert.ok(renderHomeHub.includes(".text(bBrand, 'a:home_mode|m:brand')"), 'brand role callback must remain unchanged');

assert.ok(renderRoleSelection.includes('🤳 Креатор — офферы, диалоги и заявки брендов для твоих каналов.'), 'first-run creator copy must use canonical role and object terms');
assert.ok(renderRoleSelection.includes('🏷 Бренд — лента креаторов, диалоги, заявки и фильтры.'), 'first-run brand copy must use canonical role terms');
assert.ok(renderRoleSelection.includes(".text('🤳 Креатор', 'a:home_mode|m:creator')"), 'first-run creator callback must remain unchanged');
assert.ok(renderRoleSelection.includes(".text('🏷 Бренд', 'a:home_mode|m:brand')"), 'first-run brand callback must remain unchanged');
assert.ok(!renderRoleSelection.includes('Блогер'), 'role selector must not use blogger as a creator synonym');
assert.ok(!renderRoleSelection.includes('Заказчик'), 'role selector must not use customer as a brand synonym');
assert.ok(!renderRoleSelection.includes('Creator / канал'), 'role selector must not merge a person role with a managed channel');

assert.ok(renderMainMenu.includes('📋 <b>Меню</b>'), 'current-role hub must be titled Меню');
assert.ok(!renderMainMenu.includes('🏠 <b>Главное меню</b>'), 'current-role hub must not look like global Home');
assert.ok(renderMainMenu.includes('Для креатора — каналы, офферы, заявки и розыгрыши.'), 'creator menu copy must use the canonical role label');

for (const callback of [
  "'a:home'",
  "'a:menu'",
  "'a:home_mode|m:creator'",
  "'a:home_mode|m:brand'",
  "'a:ui_mode_set|m:creator|ret:menu'",
  "'a:ui_mode_set|m:brand|ret:menu'",
]) {
  assert.ok(botSource.includes(callback) || runtimeSource.includes(callback), `navigation callback must remain present: ${callback}`);
}

console.log(`✅ Home/Menu/role navigation contract OK (home=${homeLabels.length}, menu=${menuLabels.length})`);
