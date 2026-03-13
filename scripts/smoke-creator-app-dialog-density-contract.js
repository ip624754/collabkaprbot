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
  botSrc.includes('function creatorBrandAppWhatNow(status) {') &&
    botSrc.includes('💡 <b>Сейчас</b>') &&
    botSrc.includes('creatorBrandAppWhatNow(st)'),
  'Expected creator-side application dialog cards to expose a short “Что сейчас” hint instead of only a dense header/history dump'
);

assert.ok(
  botSrc.includes('const msgText = msgRaw ? clipText(msgRaw, 700) : \'—\';') &&
    botSrc.includes("const msgEsc = escapeHtml(msgText) + (msgRaw && msgRaw.length > 700 ? '\\n<i>(сокращено)</i>' : '');") &&
    botSrc.includes("const replyEsc = replyText") &&
    botSrc.includes("replyText.length > 500 ? '\\n<i>(сокращено)</i>' : ''"),
  'Expected creator-side application dialog cards to clip long application/reply previews instead of dumping the full text'
);

assert.ok(
  botSrc.includes('const threadBlock = formatBrandAppThread(thread, 3);') &&
    botSrc.includes('<b>Последние сообщения</b>') &&
    botSrc.includes('Показаны последние 3 из ${thread.length}.'),
  'Expected creator-side application dialog cards to show only the last 3 thread messages with an explicit count hint'
);

assert.ok(
  botSrc.includes('Пока бренд не принял заявку — кнопка «💬 Написать бренду» появится после принятия.') &&
    botSrc.includes('Сообщения идут внутри этого бота — без перехода в личку.') &&
    botSrc.includes("function creatorBrandAppReplyButtonLabel() {") &&
    botSrc.includes("if (st !== 'new') kb.text(creatorBrandAppReplyButtonLabel(), `a:brand_app_chat|id:${app.id}`).row();"),
  'Expected creator-side application dialog cards to keep honest reply gating: no reply button before accept, clear in-bot messaging after accept'
);

console.log('✅ smoke creator app dialog density contract OK');
