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
  botSrc.includes('function buildCreatorBrandAppSendReceiptBlock(input = null) {') &&
    botSrc.includes("let title = '✅ <b>Сообщение отправлено бренду</b>';") &&
    botSrc.includes("title = '⚠️ <b>Сообщение добавлено в диалог</b>';") &&
    botSrc.includes("const receiptBlock = buildCreatorBrandAppSendReceiptBlock(opts.sendReceipt || null);") &&
    botSrc.includes("text += `\\n\\n${receiptBlock}`;") &&
    !botSrc.includes('🔔 Уведомление (') &&
    !botSrc.includes('deliveryLine: ackLine'),
  'Expected creator application dialog receipt to stay user-facing without internal delivery counters'
);

assert.ok(
  botSrc.includes('После отправки я сразу верну тебя в этот диалог.') &&
    botSrc.includes("return renderBrandAppCardForCreator(ctx, u.id, appId, {") &&
    botSrc.includes("const deliveryKind = (targetsMap.size === 0)") &&
    botSrc.includes("kind: deliveryKind") &&
    !botSrc.includes("const ackLine ="),
  'Expected creator reply send flow to return into the same application dialog without exposing notify telemetry in the receipt'
);

console.log('✅ smoke creator-side application reply completion contract OK');
