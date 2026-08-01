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
const leadCallbacksSrc = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'domains', 'leads', 'callbacks.js'), 'utf8');
const combinedSrc = `${botSrc}\n${leadCallbacksSrc}`;

const fnStart = botSrc.indexOf('async function renderWsLeadsList(');
const fnEnd = botSrc.indexOf('// -----------------------------\n// Curator application queue', fnStart);
assert.ok(fnStart >= 0 && fnEnd > fnStart, 'Expected renderWsLeadsList function block to exist');
const fnSrc = botSrc.slice(fnStart, fnEnd);

assert.ok(
  fnSrc.includes('📨 <b>Заявки от брендов</b>') &&
    fnSrc.includes('Последние входящие заявки в этот канал.') &&
    fnSrc.includes('Открой заявку: там статус, последние сообщения, заметки и действия.') &&
    fnSrc.includes('const total = Number(counts?.[st] || 0);') &&
    fnSrc.includes('const hasMultiplePages = total > limit;') &&
    fnSrc.includes('const summaryMeta = hasMultiplePages') &&
    fnSrc.includes('всего ${total}') &&
    fnSrc.includes('стр ${p + 1}'),
  'Expected creator-side brand-leads list to expose a short summary-only header with page context only when pagination is real'
);

assert.ok(
  !fnSrc.includes('text += `${icon} <b>${escapeHtml(who)}</b>') &&
    !fnSrc.includes('text += `<i>${escapeHtml(stTitle)} · #${l.id} · ${escapeHtml(when)}</i>') &&
    !fnSrc.includes('text += `${escapeHtml(short)}') &&
    !fnSrc.includes("const short = clipText(msg || '—', 56);") &&
    !fnSrc.includes("const stTitle = (LEAD_STATUSES[rowStatus] || LEAD_STATUSES.new).title;"),
  'Expected creator-side brand-leads list to stop rendering a duplicated text dump above the interactive buttons'
);

assert.ok(
  fnSrc.includes("const btnLabel = clipText(`${leadStatusIcon(l.status)} ${whoShort} · #${l.id}`, 50);") &&
    fnSrc.includes("if (p > 0) kb.row().text('⬅️ Назад', `a:ws_leads|w:${wsId}|s:${leadStatusToCb(st)}|p:${p - 1}${rPart}`);") &&
    fnSrc.includes("if (p > 0) kb.text('➡️ Далее', `a:ws_leads|w:${wsId}|s:${leadStatusToCb(st)}|p:${p + 1}${rPart}`);") &&
    fnSrc.includes('disable_web_page_preview: true'),
  'Expected creator-side brand-leads list buttons/pagination to remain the only primary list representation'
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
  'Expected creator-side brand-lead dialog cards to stay signal-first, with short what-now/state blocks and only the last 3 messages/notes'
);

assert.ok(
  combinedSrc.includes('const flash = `Шаблон отправлен: ${leadTplLabel(tplKey)}`;') &&
    combinedSrc.includes('Статус обновлён: ${(LEAD_STATUSES[stBefore]?.title || stBefore)} → ${(LEAD_STATUSES[stAfter]?.title || stAfter)}') &&
    combinedSrc.includes('await renderLeadView(ctx, u.id, leadId, { wsId: wsId || null, status: backStatus || st, page: backPage, ret: retKey, flash });'),
  'Expected creator-side brand-lead status/template actions to rerender the same card with a visible inline flash'
);

console.log('✅ smoke creator-side brand leads density contract OK');
