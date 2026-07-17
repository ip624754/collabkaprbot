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
  botSrc.includes("function brandAppListReturnButtonLabel() {") &&
    botSrc.includes("return '📨 К заявкам';") &&
    botSrc.includes("function brandDealsListReturnButtonLabel() {") &&
    botSrc.includes("return '🤝 К сделкам';") &&
    botSrc.includes("function creatorBrandAppListReturnButtonLabel() {") &&
    botSrc.includes("return '📨 К заявкам';"),
  'Expected shared footer/list-return label helpers for application/deal flows'
);

assert.ok(
  botSrc.includes(".text(brandAppListReturnButtonLabel(), `a:brand_apps|ws:0|s:${back.status}|p:${back.page}`)") &&
    botSrc.includes("kb.text(brandDealsListReturnButtonLabel(), `a:brand_deals|ws:0|st:${backCtx.stage}|p:${backCtx.page}`)") &&
    botSrc.includes("kb.text(creatorBrandAppListReturnButtonLabel(), 'a:my_apps|p:0').text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');") &&
    botSrc.includes("kb.row().text(creatorLeadListButtonLabel(), listCb).text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');"),
  'Expected cleaned application/deal/dialog cards to use contextual list-return footers instead of generic back labels'
);

assert.ok(
  botSrc.includes(".text(brandAppOpenButtonLabel(app.id), appBackCb)") &&
    botSrc.includes("kb.text(brandAppOpenButtonLabel(app.id), appBackCb).text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');") &&
    botSrc.includes("kb.row().text(creatorLeadListButtonLabel(), `a:ws_leads|w:${realWsId}|s:${leadStatusToCb(st)}|p:0`);") &&
    !botSrc.includes("kb.text('⬅️ Назад', appBackCb).text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');"),
  'Expected local back/open rows to point to concrete targets and brand-lead dialog to expose a list-return footer'
);

console.log('✅ smoke footer/back/list-return consistency contract OK');
