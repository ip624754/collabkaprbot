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
  botSrc.includes('function dealStageWhatNow(s) {') &&
    botSrc.includes('💡 <b>Сейчас</b>') &&
    botSrc.includes('dealStageWhatNow(stage)'),
  'Expected deal cards to expose a short “Что сейчас” hint instead of only a raw status label'
);

assert.ok(
  botSrc.includes('const threadBlock = formatBrandAppThread(thread, 3);') &&
    botSrc.includes('<b>Последние сообщения</b>') &&
    botSrc.includes('Показаны последние 3 из ${thread.length}.'),
  'Expected deal cards to show a compact last-messages preview instead of a long dialogue dump'
);

assert.ok(
  botSrc.includes('const flash = prevStage === stage') &&
    botSrc.includes('Этап обновлён: ${dealStageTitle(prevStage)} → ${dealStageTitle(stage)}') &&
    botSrc.includes("await ctx.answerCallbackQuery({ text: flash })") &&
    botSrc.includes('await renderBrandDealView(ctx, u.id, appId, { ...back, flash });'),
  'Expected stage changes to produce a clear inline confirmation and rerender flash state'
);

assert.ok(
  botSrc.includes("dealStageButtonLabel('negotiation', stage)") &&
    botSrc.includes('function dealStageButtonLabel(targetStage, activeStage) {'),
  'Expected the active stage button to be visually marked in the deal card'
);

console.log('✅ smoke brand deal density contract OK');
