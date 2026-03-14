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
  botSrc.includes('📥 <b>Inbox</b>') &&
    botSrc.includes('Здесь появляются новые диалоги и свежие сообщения.') &&
    botSrc.includes('Открой диалог: там статус, стадия, последние сообщения и действия.'),
  'Expected Inbox list to expose a compact header, a human-readable description, and a clear open-dialog hint'
);

assert.ok(
  botSrc.includes('function bxInboxPrimaryIcon(thread, userId, replySt) {') &&
    botSrc.includes("const previewRaw = String(t.last_body || t.offer_title || '').replace(/\\s+/g, ' ').trim();") &&
    botSrc.includes("const label = clipText(`${icon} ${other} · #${t.id}`, 50);") &&
    botSrc.includes("if (hasPrev) kb.text('⬅️ Назад', `a:bx_inbox|ws:${wsId}|p:${page - 1}|h:${h}`);") &&
    botSrc.includes("if (hasNext) kb.text('➡️ Далее', `a:bx_inbox|ws:${wsId}|p:${page + 1}|h:${h}`);"),
  'Expected brand Inbox list rows/buttons to emphasize who + state + preview, with readable pagination labels'
);

assert.ok(
  botSrc.includes('function bxThreadWhatNow(thread, viewerUserId, replySt) {') &&
    botSrc.includes('💡 <b>Сейчас</b>') &&
    botSrc.includes('📌 <b>Состояние</b>') &&
    botSrc.includes('💬 <b>Последние сообщения</b>') &&
    botSrc.includes('const threadBlock = formatBxThreadMessages(msgs, userId, 3);') &&
    botSrc.includes('Показаны последние 3 из ${msgs.length}.'),
  'Expected brand Inbox thread-open screens to be signal-first, with a short what-now block and only the last 3 messages'
);

assert.ok(
  botSrc.includes('const built = await buildBxThreadView(userId, threadId, { flash: opts.flash });') &&
    botSrc.includes('const flash = `Стадия: ${bxThreadStageTitle(stage) || stage}`;') &&
    botSrc.includes('flash = `Обработка: ${bxThreadTriageTitle(triage)}`;') &&
    botSrc.includes('await renderBxThread(ctx, bmRes.userId, wsId, threadId, { back, offerId, page, h, flash });'),
  'Expected stage/triage changes in brand Inbox threads to rerender with a clear inline flash state'
);



assert.ok(
  botSrc.includes('if (rows.length) {') &&
    botSrc.includes('Пока здесь пусто.') &&
    botSrc.includes('Новый диалог появится, когда кто-то напишет первым.') &&
    botSrc.includes('Если переписка идёт внутри заявки, открой её карточку.'),
  'Expected Inbox empty-state to hide noisy page counters and explain what appears here in plain language'
);
console.log('✅ smoke brand Inbox density contract OK');
