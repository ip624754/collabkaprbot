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
  botSrc.includes("const currentTemplateLabel = templateLabelByKey(BRAND_APP_TPLS, key, '⚡ Быстрый ответ');"),
  'Expected brand application template preview to resolve the selected template label explicitly'
);
assert.ok(
  botSrc.includes("`<b>Шаблон:</b> ${escapeHtml(currentTemplateLabel)}\\n\\n` +"),
  'Expected brand application template preview to show the selected template label in the preview body'
);
assert.ok(
  botSrc.includes(".text('🔁 Выбрать другой', `a:brand_app_tpls|id:${app.id}|s:${back.status}|p:${back.page}`)"),
  'Expected brand application template preview to keep explicit return to the template picker'
);
assert.ok(
  !botSrc.includes("kbTplIconPicker(kb, BRAND_APP_TPLS"),
  'Expected brand application template preview to drop duplicate template-switch rows on the confirm screen'
);

console.log('✅ smoke brand application preview dedupe contract OK');
