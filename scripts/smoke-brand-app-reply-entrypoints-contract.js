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
const applicationCallbacksSrc = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'domains', 'applications', 'callbacks.js'), 'utf8');
const runtimeSrc = [botSrc, applicationCallbacksSrc].join('\n');

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
  runtimeSrc.includes("const msg = buildBrandAppReplyRecoveryText({") &&
    runtimeSrc.includes("kind: 'degraded',") &&
    runtimeSrc.includes("const text = buildBrandAppReplyPromptText({") &&
    runtimeSrc.includes("secondaryLabel: '📨 Заявки'") &&
    runtimeSrc.includes("secondaryLabel: '📨 Открыть заявку'"),
  'Expected app/deal reply open flows to reuse centralized brand-side prompt and degraded fallback helpers'
);

assert.ok(
  runtimeSrc.includes("buildBrandAppReplyRecoveryText({ kind: 'missing_id' })") &&
    runtimeSrc.includes("kind: 'too_short',") &&
    runtimeSrc.includes("kind: 'too_long',") &&
    runtimeSrc.includes("kind: 'not_found',") &&
    runtimeSrc.includes("kind: 'no_access',") &&
    runtimeSrc.includes("kind: 'not_accepted',") &&
    runtimeSrc.includes("kind: 'no_creator_tg',") &&
    runtimeSrc.includes("kind: 'rate_limit',") &&
    runtimeSrc.includes("kind: 'open_error',"),
  'Expected brand-side reply open/send recovery paths to use centralized recovery copy for validation, guards, and open errors'
);

console.log('✅ smoke brand-side reply entry/fallback contract OK');
