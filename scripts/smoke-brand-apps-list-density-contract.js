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
  botSrc.includes('📨 <b>Заявки от креаторов</b>') &&
    botSrc.includes('Показываю последние движения по входящим заявкам к бренду.') &&
    botSrc.includes('Открой карточку: там заявка, ответ, история и действия.'),
  'Expected brand-side applications list to expose a compact signal-first header with a clear follow-up hint instead of a dense list dump'
);

assert.ok(
  botSrc.includes("const stTitle = (LEAD_STATUSES[st] || LEAD_STATUSES.new).title;") &&
    botSrc.includes("const itemTitle = (LEAD_STATUSES[itemSt] || LEAD_STATUSES.new).title;") &&
    botSrc.includes("const when = a.updated_at ? fmtTs(a.updated_at) : (a.created_at ? fmtTs(a.created_at) : '—');") &&
    botSrc.includes("const short = clipText(msg || '—', 56);") &&
    botSrc.includes('text += `${icon} <b>${escapeHtml(who)}</b>') &&
    botSrc.includes('<i>${escapeHtml(itemTitle)} · #${a.id} · ${escapeHtml(when)}</i>') &&
  'Expected brand-side applications list rows to emphasize creator + status + updated-at, with clipped message previews'
);

assert.ok(
  botSrc.includes("const label = clipText(`${icon} ${who} · #${a.id}`, 50);") &&
    botSrc.includes("if (hasPrev) kb.text('⬅️ Назад', `a:brand_apps|ws:0|s:${st}|p:${p - 1}`);") &&
    botSrc.includes("if (hasNext) kb.text('➡️ Далее', `a:brand_apps|ws:0|s:${st}|p:${p + 1}`);") &&
    botSrc.includes('disable_web_page_preview: true'),
  'Expected brand-side applications list buttons/pagination to stay compact and readable'
);

console.log('✅ smoke brand apps list density contract OK');
