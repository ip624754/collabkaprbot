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
  botSrc.includes("async function safeBrandManagers(primaryFn, fallbackFn) {") &&
    botSrc.includes("if (isMissingRelationError(e, 'brand_managers')) {") &&
    botSrc.includes("const managers = await safeBrandManagers(() => db.listBrandManagers(brandUserId), async () => []);") ,
  'Expected creator application reply runtime path to guard listBrandManagers via a defined safeBrandManagers helper'
);

assert.ok(
  botSrc.includes('Напиши обычное сообщение в поле ввода Telegram снизу и отправь его') &&
    botSrc.includes('После отправки я сразу верну тебя в этот диалог.'),
  'Expected creator reply composer copy to explicitly point the user to the Telegram input field and promise same-dialog return after send'
);

console.log('✅ smoke creator-side application reply runtime guard contract OK');
