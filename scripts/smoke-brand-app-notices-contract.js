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
    botSrc.includes("function brandAppNoticeOpenButtonLabel(appId = 0, kind = 'reply') {") &&
    botSrc.includes("function brandAppDealButtonLabel() {") &&
    botSrc.includes("function brandAppNoticeWhatNext(appId = 0, status = 'new', dealStage = '', kind = 'reply') {") &&
    botSrc.includes("function brandAppNoticeKb(appId = 0, opts = {}) {") &&
    botSrc.includes("function buildBrandAppServiceNoticeText({ appId = 0, kind = 'reply', brandName = '', creatorName = '', body = '', status = 'new', dealStage = '' } = {}) {") &&
    botSrc.includes("if (noticeKind === 'new_app') return brandAppOpenButtonLabel(id);") &&
    botSrc.includes("return id ? `💬 Диалог #${id}` : '💬 Диалог';") &&
    botSrc.includes("return '📌 Стадия сделки';") &&
    botSrc.includes("const whatNext = brandAppNoticeWhatNext(id, status, dealStage, kind);") &&
    botSrc.includes("const title = kind === 'new_app'") &&
    botSrc.includes("const bodyLabel = kind === 'new_app' ? 'Текст заявки' : 'Последнее сообщение';"),
  'Expected brand application notices to separate new-application CTA wording from reply/dialog CTA wording'
);

assert.ok(
  botSrc.includes('const notifText = buildBrandAppServiceNoticeText({') &&
    botSrc.includes("kind: 'new_app'") &&
    botSrc.includes("const kbNotif = brandAppNoticeKb(res.id, { status: 'new', page: 0, kind: 'new_app', dismiss: false });") &&
    botSrc.includes('const dealStage = getAppDealStage(app);') &&
    botSrc.includes('const appStatusForNotice = normLeadStatus(app.status) === \'new\' ? \'in_progress\' : normLeadStatus(app.status);') &&
    botSrc.includes('const notif = buildBrandAppServiceNoticeText({') &&
    botSrc.includes('const kb = brandAppNoticeKb(appId, {') &&
    botSrc.includes("kind: 'reply'") &&
    botSrc.includes("dismiss: true"),
  'Expected brand-side application notifications to keep new-app notices on application wording and creator-reply notices on dialog wording'
);

assert.ok(
  botSrc.includes("try { await ctx.answerCallbackQuery({ text: '✅ Отправлено креатору' }); } catch {}") &&
    botSrc.includes('✅ Ответ доставлен креатору.') &&
    botSrc.includes('💡 Сейчас: ${brandAppNoticeWhatNext(appId, normLeadStatus(app.status) === \'new\' ? \'in_progress\' : normLeadStatus(app.status), getAppDealStage(app), \'reply\')}') &&
    botSrc.includes('brandAppNoticeKb(appId, {') &&
    botSrc.includes('brandAppNoticeKb(app.id, {') &&
    botSrc.includes('brandAppDealButtonLabel(), backCb') &&
    botSrc.includes('brandAppOpenButtonLabel(app.id)') &&
    botSrc.includes('Попроси креатора нажать /start в этом боте и попробуй ещё раз.'),
  'Expected brand-side reply/deal follow-up receipts to reuse the same what-next language and app/deal entrypoints'
);

console.log('✅ smoke brand-side brand-app notices contract OK');
