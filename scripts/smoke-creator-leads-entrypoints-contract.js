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
  botSrc.includes(".text('📨 Заявки брендов', `a:ws_leads|ws:${wsId}|s:new|p:0|ret:ws_open`)") &&
    botSrc.includes("kb.text(`📨 Заявки брендов${leadBadge}`, `a:ws_leads|w:${wsId}|s:n|p:0${retPartShort('cw')}`).row();") &&
    botSrc.includes('Сначала открой «📨 Заявки брендов»: там вход в список, карточки и диалоги по заявкам брендов.') &&
    botSrc.includes('📨 «Заявки брендов» — вход в список заявок, карточки и диалоги по брендам.'),
  'Expected creator-side lead entrypoints in workspace/curator screens to use one shared “📨 Заявки брендов” vocabulary with a clear open-path hint'
);

assert.ok(
  botSrc.includes('function creatorLeadOpenButtonLabel(leadId) {') &&
    botSrc.includes("return id ? `🔎 Заявка #${id}` : '🔎 Открыть заявку';") &&
    botSrc.includes('function creatorLeadListButtonLabel() {') &&
    botSrc.includes("return '📨 К заявкам';"),
  'Expected creator-side lead entrypoints to centralize open/back labels instead of mixing “👀 Открыть”, “Открыть заявку”, and “Заявки”'
);

assert.ok(
  botSrc.includes(".text(creatorLeadOpenButtonLabel(leadId), leadOpenCb).text('✍️ Ответить', leadReplyCb);") &&
    botSrc.includes(".text(creatorLeadOpenButtonLabel(leadId), `a:lead_view|id:${leadId}|w:${Number(ws.id)}|s:n|p:0`)") &&
    botSrc.includes(".text(creatorLeadOpenButtonLabel(leadId), `a:lead_view|id:${leadId}|w:${wsId}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`)") &&
    botSrc.includes(".text(creatorLeadListButtonLabel(), `a:ws_leads|w:${wsId}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`)") &&
    botSrc.includes('• Нажми «🔎 Заявка #${leadId}» — откроется карточка заявки.'),
  'Expected creator-side receipts/notifications to open lead cards with one consistent label and to route list returns as “📨 К заявкам”'
);

console.log('✅ smoke creator-side lead entrypoints contract OK');
