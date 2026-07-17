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
    botSrc.includes('function creatorBrandAppReplyButtonLabel() {') &&
    botSrc.includes('function creatorBrandAppDialogReturnButtonLabel(appId = 0) {') &&
    botSrc.includes('function creatorBrandAppCardReturnButtonLabel(appId = 0) {') &&
    botSrc.includes('function creatorBrandAppOpenBrandCallback(brandUserId = 0, appId = 0, backPage = 0) {') &&
    botSrc.includes('function creatorBrandAppListButtonLabel() {') &&
    botSrc.includes("return id ? `💬 Диалог #${id}` : '💬 Диалог';") &&
    botSrc.includes("return '✍️ Ответить бренду';") &&
    botSrc.includes("return id ? `⬅️ К диалогу #${id}` : '⬅️ К диалогу';") &&
    botSrc.includes("return id ? `⬅️ К заявке #${id}` : '⬅️ К заявке';") &&
    botSrc.includes("return '📨 Мои заявки';"),
  'Expected creator-side brand-app notice helpers to keep current dialog / reply / local-return vocabulary centralized'
);

assert.ok(
  botSrc.includes("function creatorBrandAppNoticeWhatNext(appId = 0, status = 'new') {") &&
    botSrc.includes('function creatorBrandAppNoticeKb(appId = 0, brandUserId = 0, opts = {}) {') &&
    botSrc.includes("function buildCreatorBrandAppServiceNoticeText({ appId = 0, kind = 'reply', brandName = '', body = '', status = 'new', deliveryLine = '' } = {}) {") &&
    botSrc.includes("if (brandUserId) kb.text('🪟 Открыть бренд', creatorBrandAppOpenBrandCallback(Number(brandUserId || 0), Number(appId || 0), 0));") &&
    botSrc.includes("kb.text(creatorBrandAppListButtonLabel(), 'a:my_apps|p:0');") &&
    botSrc.includes("return `Открой «${dialogLabel}» или нажми «${replyLabel}». Все сообщения идут внутри этого бота.`;"),
  'Expected creator-side notices to keep the current local dialog + open-brand + list-return CTA system'
);

assert.ok(
  botSrc.includes("kind === 'accepted'") &&
    botSrc.includes("kind === 'sent'") &&
    botSrc.includes('notify creator') &&
    botSrc.includes('const deliveryKind = (targetsMap.size === 0)') &&
    botSrc.includes('return renderBrandAppCardForCreator(ctx, u.id, appId, {') &&
    botSrc.includes('sendReceipt: {') &&
    botSrc.includes('kind: deliveryKind'),
  'Expected creator-side accepted/reply flows to reuse the centralized notice text while send completion renders back into the same dialog with receipt metadata'
);

console.log('✅ smoke creator-side brand-app notices contract OK');
