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
  botSrc.includes('📨 <b>Мои заявки</b>') &&
    botSrc.includes('Показываю последние движения по твоим заявкам к брендам.') &&
    botSrc.includes('Открой карточку: там статус, ответ бренда и история.'),
  'Expected creator-side applications list to expose a compact signal-first header with a clear follow-up hint instead of a dense list dump'
);

assert.ok(
  botSrc.includes("const brandName = String(a.brand_name || '').trim();") &&
    botSrc.includes("const brandUsername = String(a.brand_username || '').trim().replace(/^@/, '');") &&
    botSrc.includes("const stTitle = (LEAD_STATUSES[st] || LEAD_STATUSES.new).title;") &&
    botSrc.includes("const short = clipText(msg || '—', 56);") &&
    botSrc.includes('text += `${icon} <b>${escapeHtml(brand)}</b>') &&
    botSrc.includes('text += `<i>${escapeHtml(stTitle)} · #${a.id} · ${escapeHtml(when)}</i>'),
  'Expected creator-side applications list rows to emphasize brand + status + updated-at, with clipped message previews'
);

assert.ok(
  botSrc.includes("const label = clipText(`${icon} ${brand} · #${a.id}`, 50);") &&
    botSrc.includes("if (p > 0) kb.text('⬅️ Назад', `a:my_apps|p:${p - 1}`);") &&
    botSrc.includes("if (hasNext) kb.text('➡️ Далее', `a:my_apps|p:${p + 1}`);") &&
    botSrc.includes("disable_web_page_preview: true"),
  'Expected creator-side applications list buttons/pagination to stay compact and readable'
);

console.log('✅ smoke creator apps list density contract OK');
