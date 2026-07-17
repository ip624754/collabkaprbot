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
  botSrc.includes("function brandAppReplyButtonLabel() {") &&
    botSrc.includes("function brandAppReplyRecoveryKb(opts = {}) {") &&
    botSrc.includes("function buildBrandAppReplyPromptText({ appId = 0, creatorName = '', subjectLabel = '', contextLabel = '', secondaryLabel = '' } = {}) {") &&
    botSrc.includes("function buildBrandAppReplyRecoveryText({ appId = 0, kind = 'open_error', subjectLabel = '', contextLabel = '', secondaryLabel = '', replyLabel = '' } = {}) {") &&
    botSrc.includes("return '✍️ Ответить креатору';") &&
    botSrc.includes("return `✍️ <b>Ответить креатору по ${escapeHtml(subject)}</b>") &&
    botSrc.includes("return `⛔ <b>Сейчас нельзя открыть ввод ответа по ${escapeHtml(subject)}</b>") &&
    botSrc.includes("return `⚠️ <b>Не удалось открыть ввод ответа по ${escapeHtml(subject)}</b>"),
  'Expected brand-side reply prompt/recovery helpers to centralize entry/fallback copy'
);

assert.ok(
  botSrc.includes("const msg = buildBrandAppReplyRecoveryText({") &&
    botSrc.includes("kind: 'degraded',") &&
    botSrc.includes("const text = buildBrandAppReplyPromptText({") &&
    botSrc.includes("secondaryLabel: '📨 Заявки'") &&
    botSrc.includes("secondaryLabel: '📨 Открыть заявку'"),
  'Expected app/deal reply open flows to reuse centralized brand-side prompt and degraded fallback helpers'
);

assert.ok(
  botSrc.includes("buildBrandAppReplyRecoveryText({ kind: 'missing_id' })") &&
    botSrc.includes("kind: 'too_short',") &&
    botSrc.includes("kind: 'too_long',") &&
    botSrc.includes("kind: 'not_found',") &&
    botSrc.includes("kind: 'no_access',") &&
    botSrc.includes("kind: 'not_accepted',") &&
    botSrc.includes("kind: 'no_creator_tg',") &&
    botSrc.includes("kind: 'rate_limit',") &&
    botSrc.includes("kind: 'open_error',"),
  'Expected brand-side reply open/send recovery paths to use centralized recovery copy for validation, guards, and open errors'
);

console.log('✅ smoke brand-side reply entry/fallback contract OK');
