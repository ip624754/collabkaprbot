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
  botSrc.includes('function creatorBrandAppDialogButtonLabel(appId = 0) {') &&
    botSrc.includes("function creatorBrandAppReplyButtonLabel() {") &&
    botSrc.includes("function creatorBrandAppListButtonLabel() {") &&
    botSrc.includes("function creatorBrandAppNoticeWhatNext(appId = 0, status = 'new') {") &&
    botSrc.includes("function creatorBrandAppNoticeKb(appId = 0, brandUserId = 0, opts = {}) {") &&
    botSrc.includes("function buildCreatorBrandAppServiceNoticeText({ appId = 0, kind = 'reply', brandName = '', body = '', status = 'new', deliveryLine = '' } = {}) {") &&
    botSrc.includes("return id ? `✉️ Диалог #${id}` : '✉️ Диалог';") &&
    botSrc.includes("return '✍️ Ответить бренду';") &&
    botSrc.includes("return '📨 Мои заявки';") &&
    botSrc.includes("return `Открой «${dialogLabel}» или нажми «${replyLabel}». Все сообщения идут внутри этого бота.`;"),
  'Expected creator-side brand-app notices to centralize dialog/open/reply/list vocabulary and what-next copy'
);

assert.ok(
  botSrc.includes("kind: 'accepted'") &&
    botSrc.includes("const outKb = creatorBrandAppNoticeKb(app.id, brandUserId, {") &&
    botSrc.includes("status: 'in_progress'") &&
    botSrc.includes("const outText = buildCreatorBrandAppServiceNoticeText({") &&
    botSrc.includes('notify creator'),
  'Expected brand-accepted creator notification to use the centralized creator-side notice text/CTA system'
);

assert.ok(
  botSrc.includes("const creatorStatus = normLeadStatus(app.status) === 'new' ? 'in_progress' : normLeadStatus(app.status);") &&
    botSrc.includes("body: [link ? `Сайт/ссылка: ${link}` : '', prof?.contact ? `Контакт: ${String(prof.contact)}` : '', reply].filter(Boolean).join(' · ')") &&
    botSrc.includes("body: [link ? `Сайт/ссылка: ${link}` : '', cUrl ? `Контакт: ${String(prof.contact)}` : '', replyText].filter(Boolean).join(' · ')") &&
    botSrc.includes("const outKb = creatorBrandAppNoticeKb(appId, brandUserId, {") &&
    botSrc.includes("const outKb = creatorBrandAppNoticeKb(app.id, brandUserId, {") &&
    botSrc.includes("kind: 'reply'") &&
    botSrc.includes("kind: 'sent'") &&
    botSrc.includes("deliveryLine: ackLine") &&
    botSrc.includes("reply_markup: creatorBrandAppNoticeKb(appId, brandUserId, {") &&
    botSrc.includes(".text(creatorBrandAppDialogButtonLabel(appId), `a:brand_app_card|id:${appId}`)"),
  'Expected creator-side reply notifications, template notifications, and dialog receipts to reuse the same centralized notice/CTA language'
);

console.log('✅ smoke creator-side brand-app notices contract OK');
