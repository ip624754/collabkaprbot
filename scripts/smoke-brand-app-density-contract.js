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
const appCallbacksSrc = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'domains', 'applications', 'callbacks.js'), 'utf8');
const combinedSrc = `${botSrc}\n${appCallbacksSrc}`;

assert.ok(
  botSrc.includes('function brandAppWhatNow(status, opts = {}) {') &&
    botSrc.includes('💡 <b>Сейчас</b>') &&
    botSrc.includes('brandAppWhatNow(st, { pending: acceptPending, dealStage })'),
  'Expected brand application cards to expose a short “Что сейчас” hint instead of only a dense status/history dump'
);

assert.ok(
  botSrc.includes('const threadBlock = formatBrandAppThread(thread, 3);') &&
    botSrc.includes('<b>Последние сообщения</b>') &&
    botSrc.includes('Показаны последние 3 из ${thread.length}.'),
  'Expected brand application cards to show a compact last-messages preview instead of a long dialogue dump'
);

assert.ok(
  combinedSrc.includes('const flash = prevSt === st') &&
    combinedSrc.includes('Статус обновлён: ${(LEAD_STATUSES[prevSt]?.title || LEAD_STATUSES[prevSt]?.label || prevSt)} → ${(LEAD_STATUSES[st]?.title || LEAD_STATUSES[st]?.label || st)}') &&
    combinedSrc.includes('const nextBack = { status: st, page: back.page, flash };') &&
    combinedSrc.includes('await renderBrandAppView(ctx, u.id, appId, nextBack);'),
  'Expected status changes to produce a clear inline confirmation and rerender flash state on the application card'
);

assert.ok(
  botSrc.includes('function brandAppStatusActionLabel(targetStatus, activeStatus) {') &&
    botSrc.includes(".text(brandAppStatusActionLabel('in_progress', st), `a:brand_app_set|id:${app.id}|st:in_progress|s:${back.status}|p:${back.page}`)") &&
    botSrc.includes(".text(brandAppStatusActionLabel('closed', st), `a:brand_app_set|id:${app.id}|st:closed|s:${back.status}|p:${back.page}`)"),
  'Expected the active internal status action to be visually marked in the brand application card'
);

console.log('✅ smoke brand app density contract OK');
