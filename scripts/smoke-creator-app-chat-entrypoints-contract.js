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
const appCallbacksSrc = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'domains', 'applications', 'callbacks.js'), 'utf8');
const combinedSrc = `${botSrc}\n${appCallbacksSrc}`;

assert.ok(
  botSrc.includes('function creatorBrandAppChatRecoveryKb(appId = 0, brandUserId = 0, opts = {}) {') &&
    botSrc.includes("function buildCreatorBrandAppChatPromptText({ appId = 0, brandName = '' } = {}) {") &&
    botSrc.includes("function buildCreatorBrandAppChatRecoveryText({ appId = 0, kind = 'open_error' } = {}) {") &&
    botSrc.includes("return `✍️ <b>Ответ бренду по заявке #${id}</b>") &&
    botSrc.includes("return `⛔ <b>Сейчас нельзя открыть ввод ответа по заявке #${id}</b>") &&
    botSrc.includes("return `⚠️ <b>Не удалось открыть ответ по заявке #${id}</b>"),
  'Expected creator-side brand-app chat entry/fallback helpers to centralize prompt and recovery copy'
);

assert.ok(
  botSrc.includes("const kb = creatorBrandAppChatRecoveryKb(app.id, brandUserId, {") &&
    botSrc.includes("safeMode: true,") &&
    botSrc.includes("const msg = buildCreatorBrandAppChatRecoveryText({ appId: app.id, kind: 'degraded' });") &&
    botSrc.includes("const kb = creatorBrandAppChatRecoveryKb(app.id, brandUserId);") &&
    botSrc.includes("const text = buildCreatorBrandAppChatPromptText({ appId: app.id, brandName });"),
  'Expected creator-side chat open flow to reuse centralized prompt and degraded fallback helpers'
);

assert.ok(
  combinedSrc.includes("const kb = creatorBrandAppChatRecoveryKb(appId, 0);") &&
    combinedSrc.includes("const msg = buildCreatorBrandAppChatRecoveryText({ appId, kind: 'open_error' });") &&
    combinedSrc.includes("buildCreatorBrandAppChatRecoveryText({ kind: 'missing_id' })") &&
    combinedSrc.includes("buildCreatorBrandAppChatRecoveryText({ appId, kind: 'too_short' })") &&
    combinedSrc.includes("buildCreatorBrandAppChatRecoveryText({ appId, kind: 'too_long' })") &&
    combinedSrc.includes("buildCreatorBrandAppChatRecoveryText({ appId, kind: 'rate_limit' })") &&
    combinedSrc.includes("buildCreatorBrandAppChatRecoveryText({ appId, kind: 'not_found' })") &&
    combinedSrc.includes("buildCreatorBrandAppChatRecoveryText({ appId, kind: 'no_access' })") &&
    combinedSrc.includes("buildCreatorBrandAppChatRecoveryText({ appId, kind: 'not_accepted' })"),
  'Expected creator-side chat open/send recovery paths to use centralized recovery copy for open, validation, and guard failures'
);

console.log('✅ smoke creator-side brand-app chat entry/fallback contract OK');
