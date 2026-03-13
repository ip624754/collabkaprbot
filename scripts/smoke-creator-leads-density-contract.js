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
  botSrc.includes('📨 <b>Заявки брендов</b>') &&
    botSrc.includes('Показываю последние движения по заявкам брендов в этот канал.') &&
    botSrc.includes('Открой заявку: там статус, последние сообщения, заметки и действия.'),
  'Expected creator-side brand-leads list to expose a compact signal-first header with a clear open-card hint'
);

assert.ok(
  botSrc.includes("const whoRaw = l.brand_username ? '@' + String(l.brand_username).replace(/^@/, '')") &&
    botSrc.includes("const short = clipText(msg || '—', 56);") &&
    botSrc.includes('text += `${icon} <b>${escapeHtml(who)}</b>') &&
    botSrc.includes('text += `<i>${escapeHtml(stTitle)} · #${l.id} · ${escapeHtml(when)}</i>') &&
    botSrc.includes("const btnLabel = clipText(`${leadStatusIcon(l.status)} ${whoShort} · #${l.id}`, 50);") &&
    botSrc.includes("if (p > 0) kb.row().text('⬅️ Назад', `a:ws_leads|w:${wsId}|s:${leadStatusToCb(st)}|p:${p - 1}${rPart}`);") &&
    botSrc.includes("if (p > 0) kb.text('➡️ Далее', `a:ws_leads|w:${wsId}|s:${leadStatusToCb(st)}|p:${p + 1}${rPart}`);"),
  'Expected creator-side brand-leads list rows/buttons to emphasize brand + status + updated-at, with readable pagination labels'
);

assert.ok(
  botSrc.includes('function creatorLeadWhatNow(status, opts = {}) {') &&
    botSrc.includes('function formatCreatorLeadThread(items, limit = 3) {') &&
    botSrc.includes('💡 <b>Сейчас</b>') &&
    botSrc.includes('📌 <b>Состояние</b>') &&
    botSrc.includes('💬 <b>Последние сообщения</b>') &&
    botSrc.includes('📝 <b>Последние заметки</b>') &&
    botSrc.includes('Показаны последние 3 из ${thread.length}.') &&
    botSrc.includes('Кураторский режим: ручной ответ недоступен — используй шаблоны, статус и заметки.'),
  'Expected creator-side brand-lead dialog cards to be signal-first, with short what-now/state blocks and only the last 3 messages/notes'
);

assert.ok(
  botSrc.includes('const flash = `Шаблон отправлен: ${leadTplLabel(tplKey)}`;') &&
    botSrc.includes('Статус обновлён: ${(LEAD_STATUSES[stBefore]?.title || stBefore)} → ${(LEAD_STATUSES[stAfter]?.title || stAfter)}') &&
    botSrc.includes('await renderLeadView(ctx, u.id, leadId, { wsId: wsId || null, status: backStatus || st, page: backPage, ret: retKey, flash });'),
  'Expected creator-side brand-lead status/template actions to rerender the same card with a visible inline flash'
);

console.log('✅ smoke creator-side brand leads density contract OK');
