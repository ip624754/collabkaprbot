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

assert.ok(
  botSrc.includes("quick_label: '✅ Готово'") &&
    botSrc.includes("quick_label: '📎 Детали'") &&
    botSrc.includes("quick_label: '🤝 Условия'") &&
    botSrc.includes("quick_label: '🕒 Сроки'"),
  'Expected brand application quick template buttons to use compact emoji + one-word labels'
);
assert.ok(
  botSrc.includes("quick_label: '🧾 Бриф'"),
  'Expected the fifth quick template button to stay explicit instead of icon-only'
);
assert.ok(
  botSrc.includes("const label = String(t.quick_label || t.icon || '•');"),
  'Expected quick template picker to prefer explicit quick_label text over raw icon-only buttons'
);
assert.ok(
  botSrc.includes("kbTplIconPicker(kb, BRAND_APP_TPLS, (tplKey) => `a:brand_app_tpl|id:${app.id}|k:${tplKey}|s:${back.status}|p:${back.page}`, 2);"),
  'Expected brand application preview quick buttons to render in a less cramped two-column layout on mobile'
);

console.log('✅ smoke brand application template quick labels contract OK');
