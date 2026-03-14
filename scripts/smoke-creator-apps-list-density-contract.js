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

const fnStart = botSrc.indexOf('async function renderCreatorApplications(');
const fnEnd = botSrc.indexOf('function buildCreatorBrandAppSendReceiptBlock', fnStart);
assert.ok(fnStart >= 0 && fnEnd > fnStart, 'Expected renderCreatorApplications function block to exist');
const fnSrc = botSrc.slice(fnStart, fnEnd);

assert.ok(
  fnSrc.includes('📨 <b>Мои заявки</b>') &&
    fnSrc.includes('Последние заявки к брендам.') &&
    fnSrc.includes('const hasMultiplePages = total > limit;') &&
    fnSrc.includes('const summaryMeta = hasMultiplePages') &&
    fnSrc.includes('всего ${total}') &&
    fnSrc.includes('стр ${p + 1}') &&
    fnSrc.includes('Открой карточку: там статус, ответ бренда и история.'),
  'Expected creator-side applications list to expose a short summary-only header with page context only when pagination is real'
);

assert.ok(
  !fnSrc.includes('text += `${icon} <b>${escapeHtml(brand)}</b>') &&
    !fnSrc.includes('text += `<i>${escapeHtml(stTitle)} · #${a.id} · ${escapeHtml(when)}</i>') &&
    !fnSrc.includes('text += `<code>${escapeHtml(short)}</code>') &&
    !fnSrc.includes("const stTitle = (LEAD_STATUSES[st] || LEAD_STATUSES.new).title;") &&
    !fnSrc.includes("const short = clipText(msg || '—', 56);"),
  'Expected creator-side applications list to stop rendering a duplicated text dump above the interactive buttons'
);

assert.ok(
  fnSrc.includes("const label = clipText(`${icon} ${brand} · #${a.id}`, 50);") &&
    fnSrc.includes("if (p > 0) kb.text('⬅️ Назад', `a:my_apps|p:${p - 1}`);") &&
    fnSrc.includes("if (hasNext) kb.text('➡️ Далее', `a:my_apps|p:${p + 1}`);") &&
    fnSrc.includes('disable_web_page_preview: true'),
  'Expected creator-side applications list buttons/pagination to remain the only primary list representation'
);

console.log('✅ smoke creator apps list density contract OK');
