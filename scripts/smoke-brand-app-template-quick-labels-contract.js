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
  botSrc.includes("const BRAND_APP_TPLS = [") &&
    botSrc.includes("{ key: 'next', label: '✅ Приняли — дальше', icon: '✅' }") &&
    botSrc.includes("{ key: 'price', label: '📎 Прайс / медиа‑кит', icon: '📎' }") &&
    botSrc.includes("{ key: 'brief', label: '🧾 Уточнить детали', icon: '🧾' }") &&
    botSrc.includes("{ key: 'barter', label: '🤝 Бартер', icon: '🤝' }") &&
    botSrc.includes("{ key: 'timing', label: '⏱ Сроки', icon: '⏱' }"),
  'Expected brand application template catalog to keep explicit full labels on the first picker screen'
);
assert.ok(
  botSrc.includes('kbTplList(kb, BRAND_APP_TPLS, (tplKey) => `a:brand_app_tpl|id:${app.id}|k:${tplKey}|s:${back.status}|p:${back.page}`);'),
  'Expected the first brand-app template screen to render one clear full-label picker list'
);
assert.ok(
  botSrc.includes('kbTplIconPicker(kb, BRAND_APP_TPLS, (tplKey) => `a:brand_app_tpl|id:${app.id}|k:${tplKey}|s:${back.status}|p:${back.page}`, 3);') &&
    botSrc.includes(".text('📨 Отправить', `a:brand_app_tpl_send|id:${app.id}|k:${String(key || 'discuss')}|s:${back.status}|p:${back.page}`)") &&
    botSrc.includes(".text('🔄 Выбрать другой', `a:brand_app_tpls|id:${app.id}|s:${back.status}|p:${back.page}`)") &&
    botSrc.includes(".text('✍️ Ответить', `a:brand_app_reply|id:${app.id}|s:${back.status}|p:${back.page}`);"),
  'Expected brand application preview to keep compact quick-switch icons plus explicit send / choose-another / reply actions'
);

console.log('✅ smoke brand application template quick labels contract OK');
