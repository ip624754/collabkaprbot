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

const modeSrc = extractBetween(
  botSource,
  'async function renderWsProfileMode(ctx, ownerUserId, wsId) {',
  '\n\nasync function renderWsProfileVerticals(ctx, ownerUserId, wsId) {'
);

const formatsSrc = extractBetween(
  botSource,
  'async function renderWsProfileFormats(ctx, ownerUserId, wsId) {',
  '\n\nasync function renderWsPublicProfile(ctx, wsId, opts = {}) {'
);

assert.ok(botSource.includes("function checkboxGridLabel(on, title) {"), 'checkbox helper must exist');
assert.ok(botSource.includes("function activeOptionGridLabel(on, title) {"), 'radio helper must exist');

assert.ok(modeSrc.includes("activeOptionGridLabel(cur === 'channel', 'Канал')"), 'profile mode must use radio-style marker for channel');
assert.ok(modeSrc.includes("activeOptionGridLabel(cur === 'ugc', 'UGC')"), 'profile mode must use radio-style marker for UGC');
assert.ok(modeSrc.includes("activeOptionGridLabel(cur === 'both', 'Оба')"), 'profile mode must use radio-style marker for both');
assert.ok(!modeSrc.includes("`${cur === 'channel' ? '✅ ' : ''}Канал`"), 'profile mode must not keep old checkmark contract');
assert.ok(modeSrc.includes('Текущий выбор отмечен. Нажатие применяется сразу.'), 'profile mode must explain instant single-choice behavior');
assert.ok(modeSrc.includes('канал + UGC в одном профиле'), 'profile mode copy must be refreshed for pilot contract');
assert.ok(modeSrc.includes("kbNavRow(kb, `a:ws_profile|ws:${wsId}`);"), 'profile mode must keep local profile footer');

assert.ok(formatsSrc.includes('checkboxGridLabel(on, it.title)'), 'formats must use checkbox-style marker');
assert.ok(!formatsSrc.includes("`${on ? '✅ ' : ''}${it.title}`"), 'formats must not keep old bare checkmark contract');
assert.ok(formatsSrc.includes("kb.row().text('🧹 Очистить', `a:ws_prof_fmt_clear|ws:${wsId}`);"), 'formats must keep clear as a separate bottom action row');
assert.ok(!formatsSrc.includes(".text('✅ Готово', `a:ws_profile|ws:${wsId}`)"), 'formats must drop redundant done button for instant-apply pilot');
assert.ok(formatsSrc.includes('Можно выбрать несколько вариантов. Нажатие применяется сразу, текущий выбор отмечен.'), 'formats must explain instant multi-select behavior');
assert.ok(formatsSrc.includes("kbNavRow(kb, `a:ws_profile|ws:${wsId}`);"), 'formats must keep local profile footer');

console.log('✅ smoke selection pilot contract OK');
