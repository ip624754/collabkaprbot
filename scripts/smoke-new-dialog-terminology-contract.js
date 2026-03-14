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
  botSrc.includes('<b>Кредиты</b> = Stars для новых диалогов.') &&
    botSrc.includes('• 💬 Новый диалог: <b>${cost}</b>') &&
    botSrc.includes('📆 Лимит новых диалогов в день: <b>${dailyLimit}</b>') &&
    botSrc.includes('Stars тратятся только на новые диалоги.') &&
    botSrc.includes("ruPlural(intros,'новый диалог','новых диалога','новых диалогов')"),
  'Expected active brand-pass / paywall copy to consistently use «Новый диалог» terminology'
);

assert.ok(
  !botSrc.includes('Интро = новый диалог') &&
    !botSrc.includes('Stars для интро.') &&
    !botSrc.includes('интро-диалог'),
  'Expected old mixed «Интро = новый диалог» copy to be removed from active bot source'
);

assert.ok(
  starsSrc.includes('• 💬 Новый диалог: ${introCost} кредит(ов)') &&
    !starsSrc.includes('Интро = новый диалог'),
  'Expected Stars auto-apply receipt copy to use «Новый диалог» terminology'
);

assert.ok(
  cronSrc.includes('По одному из новых диалогов не было ответа') &&
    cronSrc.includes('при следующем новом диалоге.'),
  'Expected retry-credit notifications to use the same «Новый диалог» terminology'
);

console.log('✅ smoke new-dialog terminology contract OK');
