#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

const configSource = readText('src/lib/config.js');
const botSource = readText('src/bot/bot.js');
const envExample = readText('.env.example');
const envDoc = readText('docs/92_PROD_ENV_BASELINE.md');

assert.ok(
  configSource.includes("BRAND_APP_SUPERADMIN_COPY_ENABLED: parseBoolSafe(process.env.BRAND_APP_SUPERADMIN_COPY_ENABLED, true),"),
  'config must expose BRAND_APP_SUPERADMIN_COPY_ENABLED with safe default true'
);
assert.ok(
  envExample.includes('BRAND_APP_SUPERADMIN_COPY_ENABLED=1'),
  '.env.example must document BRAND_APP_SUPERADMIN_COPY_ENABLED=1'
);
assert.ok(
  envDoc.includes('BRAND_APP_SUPERADMIN_COPY_ENABLED=1'),
  'docs/92_PROD_ENV_BASELINE.md must mention BRAND_APP_SUPERADMIN_COPY_ENABLED=1'
);

const startMarker = "  const notifText = `📝 <b>Новая заявка от креатора</b>";
const endMarker = "\n\n  // cleanup draft";
const start = botSource.indexOf(startMarker);
assert.ok(start >= 0, 'brand application notify block must keep notifText marker');
const end = botSource.indexOf(endMarker, start);
assert.ok(end > start, 'brand application notify block must end before cleanup draft');
const notifyBlock = botSource.slice(start, end);

assert.ok(
  notifyBlock.includes("const opsCopyText = `🛠 <b>OPS COPY · Заявка креатора бренду</b>"),
  'brand application notify block must define explicit OPS COPY text for super-admins'
);
assert.ok(
  notifyBlock.includes('Это операторская копия. Основной workflow идёт у бренда.'),
  'OPS COPY text must explain this is an operator copy and brand keeps the main workflow'
);
assert.ok(
  notifyBlock.includes('const brandRecipients = new Set();'),
  'brand application notify block must keep dedicated brandRecipients set'
);
assert.ok(
  notifyBlock.includes('const superAdminRecipients = new Set();'),
  'brand application notify block must keep dedicated superAdminRecipients set'
);
assert.ok(
  notifyBlock.includes('if (ownerTid) brandRecipients.add(ownerTid);'),
  'brand owner must stay in the normal brandRecipients audience'
);
assert.ok(
  notifyBlock.includes('if (tid) brandRecipients.add(tid);'),
  'brand managers must stay in the normal brandRecipients audience'
);
assert.ok(
  notifyBlock.includes('if (CFG.BRAND_APP_SUPERADMIN_COPY_ENABLED) {'),
  'super-admin copies must honor BRAND_APP_SUPERADMIN_COPY_ENABLED'
);
assert.ok(
  notifyBlock.includes('if (adminTid) superAdminRecipients.add(adminTid);'),
  'super-admin recipients must be added only to the ops-copy audience'
);
assert.ok(
  notifyBlock.includes("await api.sendMessage(chatId, notifText, { parse_mode: 'HTML', reply_markup: kbNotif, disable_web_page_preview: true });"),
  'brand recipients must continue receiving the original notification text'
);
assert.ok(
  notifyBlock.includes("await api.sendMessage(chatId, opsCopyText, { parse_mode: 'HTML', reply_markup: kbNotif, disable_web_page_preview: true });"),
  'super-admin recipients must receive the OPS COPY relabeled text'
);
assert.ok(
  !notifyBlock.includes('for (const tid of (CFG.SUPER_ADMIN_TG_IDS || [])) recipients.add(Number(tid));'),
  'legacy combined recipients set with unconditional super-admin fanout must be removed'
);

console.log('✅ smoke brand-app-ops-copy contract OK');
