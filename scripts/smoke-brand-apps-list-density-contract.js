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

const fnStart = botSrc.indexOf('async function renderBrandAppsList(');
const fnEnd = botSrc.indexOf('async function renderBrandDealsList(', fnStart);
assert.ok(fnStart >= 0 && fnEnd > fnStart, 'Expected renderBrandAppsList function block to exist');
const fnSrc = botSrc.slice(fnStart, fnEnd);

assert.ok(
  fnSrc.includes('📨 <b>Заявки от креаторов</b>') &&
    fnSrc.includes('Последние входящие заявки к бренду.') &&
    fnSrc.includes('Открой карточку: там заявка, ответ, история и действия.') &&
    fnSrc.includes('const hasMultiplePages = total > limit;') &&
    fnSrc.includes('const summaryMeta = hasMultiplePages') &&
    fnSrc.includes('стр ${p + 1}') &&
    fnSrc.includes('всего ${total}'),
  'Expected brand-side applications list to expose a short summary-only header with page context only when pagination is real'
);

assert.ok(
  !fnSrc.includes('text += `${icon} <b>${escapeHtml(who)}</b>') &&
    !fnSrc.includes('<i>${escapeHtml(itemTitle)} · #${a.id} · ${escapeHtml(when)}</i>') &&
    !fnSrc.includes("const itemTitle = (LEAD_STATUSES[itemSt] || LEAD_STATUSES.new).title;") &&
    !fnSrc.includes("const short = clipText(msg || '—', 56);"),
  'Expected brand-side applications list to stop rendering a duplicated text dump above the interactive buttons'
);

assert.ok(
  fnSrc.includes("const label = clipText(`${icon} ${who} · #${a.id}`, 50);") &&
    fnSrc.includes("if (hasPrev) kb.text('⬅️ Назад', `a:brand_apps|ws:0|s:${st}|p:${p - 1}`);") &&
    fnSrc.includes("if (hasNext) kb.text('➡️ Далее', `a:brand_apps|ws:0|s:${st}|p:${p + 1}`);") &&
    fnSrc.includes('disable_web_page_preview: true'),
  'Expected brand-side applications list buttons and pagination to remain the only primary list representation'
);

console.log('✅ smoke brand apps list density contract OK');
