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
  botSrc.includes('function brandAppThreadEmptyStateText(status, opts = {}) {') &&
    botSrc.includes('Истории пока нет. Нажми «✍️ Ответить креатору» или «⚡ Шаблоны» — первое сообщение появится здесь.') &&
    botSrc.includes('Истории пока нет. Нажми «✍️ Ответить» или «⚡ Шаблоны» — первое сообщение появится здесь.') &&
    botSrc.includes("brandAppThreadEmptyStateText(st, { pending: acceptPending, dealStage })") &&
    botSrc.includes("brandAppThreadEmptyStateText(st, { role: 'deal', dealStage: stage })"),
  'Expected brand-side application/deal cards to keep a real empty-history state instead of dropping the messages block entirely'
);

assert.ok(
  botSrc.includes('function creatorBrandAppThreadEmptyStateText(status) {') &&
    botSrc.includes('Истории пока нет. Бренд ещё не принял заявку — дождись решения здесь.') &&
    botSrc.includes('Истории пока нет. Нажми «✍️ Ответить бренду» — первое сообщение появится в этом диалоге.') &&
    botSrc.includes('creatorBrandAppThreadEmptyStateText(st)'),
  'Expected creator-side application dialogs to explain the first-message / not-yet-accepted state instead of showing a blank history area'
);

assert.ok(
  botSrc.includes('function creatorLeadThreadEmptyStateText(status, opts = {}) {') &&
    botSrc.includes('function brandLeadThreadEmptyStateText(opts = {}) {') &&
    botSrc.includes('Истории пока нет. Используй шаблоны, статус или заметку — первое сообщение появится здесь.') &&
    botSrc.includes('витрина и контакты останутся рядом.') &&
    botSrc.includes('creatorLeadThreadEmptyStateText(st, { canManualReply })') &&
    botSrc.includes('brandLeadThreadEmptyStateText({ contactsUnlocked })'),
  'Expected lead/dialog screens on both sides to keep a consistent empty-history / first-message explanation'
);

console.log('✅ smoke empty-state contract OK');
