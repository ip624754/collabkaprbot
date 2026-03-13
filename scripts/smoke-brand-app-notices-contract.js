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
  botSrc.includes('function brandAppOpenButtonLabel(appId = 0) {') &&
    botSrc.includes("function brandAppDealButtonLabel() {") &&
    botSrc.includes("function brandAppNoticeWhatNext(appId = 0, status = 'new', dealStage = '') {") &&
    botSrc.includes("function brandAppNoticeKb(appId = 0, opts = {}) {") &&
    botSrc.includes("function buildBrandAppServiceNoticeText({ appId = 0, kind = 'reply', brandName = '', creatorName = '', body = '', status = 'new', dealStage = '' } = {}) {") &&
    botSrc.includes("return id ? `✉️ Заявка #${id}` : '✉️ Заявка';") &&
    botSrc.includes("return '📌 Стадия сделки';") &&
    botSrc.includes("return `Открой «${openLabel}» или «${dealLabel}» и продолжи работу.`;") &&
    botSrc.includes("const title = kind === 'new_app'") &&
    botSrc.includes("const bodyLabel = kind === 'new_app' ? 'Текст заявки' : 'Последнее сообщение';"),
  'Expected brand application service notices to centralize vocabulary and what-next copy for notice/notification surfaces'
);

assert.ok(
  botSrc.includes('const notifText = buildBrandAppServiceNoticeText({') &&
    botSrc.includes("kind: 'new_app'") &&
    botSrc.includes("const kbNotif = brandAppNoticeKb(res.id, { status: 'new', page: 0, dismiss: false });") &&
    botSrc.includes('const dealStage = getAppDealStage(app);') &&
    botSrc.includes('const appStatusForNotice = normLeadStatus(app.status) === \'new\' ? \'in_progress\' : normLeadStatus(app.status);') &&
    botSrc.includes('const notif = buildBrandAppServiceNoticeText({') &&
    botSrc.includes('const kb = brandAppNoticeKb(appId, {') &&
    botSrc.includes("dismiss: true"),
  'Expected brand-side application notifications to use the same service notice text/CTA system for new applications and creator replies'
);

assert.ok(
  botSrc.includes("try { await ctx.answerCallbackQuery({ text: '✅ Отправлено креатору' }); } catch {}") &&
    botSrc.includes('✅ Ответ доставлен креатору.') &&
    botSrc.includes('💡 Сейчас: ${brandAppNoticeWhatNext(appId, normLeadStatus(app.status) === \'new\' ? \'in_progress\' : normLeadStatus(app.status), getAppDealStage(app))}') &&
    botSrc.includes('brandAppNoticeKb(appId, {') &&
    botSrc.includes('brandAppNoticeKb(app.id, {') &&
    botSrc.includes('brandAppDealButtonLabel(), backCb') &&
    botSrc.includes('brandAppOpenButtonLabel(app.id)') &&
    botSrc.includes('Попроси креатора нажать /start в этом боте и попробуй ещё раз.'),
  'Expected brand-side reply/deal follow-up receipts to reuse the same what-next language and app/deal entrypoints'
);

console.log('✅ smoke brand-side brand-app notices contract OK');
