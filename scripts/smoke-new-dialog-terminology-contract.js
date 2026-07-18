#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const botSrc = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'bot.js'), 'utf8');
const starsSrc = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'payments', 'starsHandlers.js'), 'utf8');
const cronSrc = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'cron.js'), 'utf8');

assert.ok(
  botSrc.includes('• Новый диалог по офферу: <b>${cost}</b>') &&
    botSrc.includes('📆 Новых диалогов сегодня: <b>${usedToday}</b> из <b>${dailyLimit}</b>.') &&
    botSrc.includes('Сообщения внутри уже открытого диалога: <b>бесплатно</b>'),
  'Expected credit copy to keep the canonical «Новый диалог» terminology'
);

assert.ok(
  !botSrc.includes('Интро = новый диалог') &&
    !botSrc.includes('Stars для интро.') &&
    !botSrc.includes('интро-диалог') &&
    !botSrc.includes('Stars тратятся только на новые диалоги.'),
  'Expected old mixed or false new-dialog monetization copy to be removed'
);

assert.ok(
  starsSrc.includes('Кредиты расходуются на новые диалоги, принятие заявок и открытие контактов.') &&
    !starsSrc.includes('Интро = новый диалог'),
  'Expected Stars receipt copy to use the complete credit-spend contract'
);

assert.ok(
  cronSrc.includes('По одному из новых диалогов не было ответа') &&
    cronSrc.includes('при следующем новом диалоге.'),
  'Expected retry-credit notifications to keep the same «Новый диалог» terminology'
);

console.log('✅ smoke new-dialog terminology contract OK');
