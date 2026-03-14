#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const botPath = path.join(ROOT, 'src', 'bot', 'bot.js');
const botSrc = fs.readFileSync(botPath, 'utf8');

const start = botSrc.indexOf("if (p.a === 'a:brands_home') {");
assert.ok(start >= 0, 'Expected creator brands_home handler in src/bot/bot.js');
const end = botSrc.indexOf("\n\n\n    if (p.a === 'a:brands_filters') {", start);
assert.ok(end > start, 'Expected creator brands_home handler boundary before brands_filters');
const block = botSrc.slice(start, end);

assert.ok(
  block.includes("await ctx.answerCallbackQuery({ text: 'Открываю каталог…' });") &&
    block.includes("slowLoaderId = setTimeout(async () => {") &&
    block.includes("if (settled) return;") &&
    block.includes("await safeEditOrReply(ctx, '⏳ Открываю каталог брендов…', { reply_markup: navKb('a:menu') });") &&
    block.includes("}, 700);") &&
    block.includes("await withTimeout(renderBrandsDirectory(ctx, ctx.from.id, { page, edit: true, legacyUserId: u.id }), 12000, 'brands.home');"),
  'Expected creator brands_home to use callback toast + delayed slow-loader around renderBrandsDirectory()'
);

assert.ok(
  !block.includes("await safeEditOrReply(ctx, '⏳ Открываю каталог брендов…', { reply_markup: navKb('a:menu') });\n  try {") &&
    block.includes("⚠️ Каталог брендов отвечает слишком долго."),
  'Expected creator brands_home to remove eager loading edit while preserving timeout fallback'
);

console.log('✅ smoke creator catalog open-path contract OK');
