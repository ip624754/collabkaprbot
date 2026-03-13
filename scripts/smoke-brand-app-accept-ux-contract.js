#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const botPath = path.join(ROOT, 'src', 'bot', 'bot.js');
const workerPath = path.join(ROOT, 'api', 'qstash', 'monetization-retry.js');
const botSrc = fs.readFileSync(botPath, 'utf8');
const workerSrc = fs.readFileSync(workerPath, 'utf8');

assert.ok(
  botSrc.includes(".text('📨 Открыть заявку', openAppCb)") && botSrc.includes(".text('💬 В работе', inProgressCb)"),
  'Expected brand_app_accept pending UX to offer application/work routes instead of generic Inbox CTA'
);
assert.ok(
  botSrc.includes("Кредит спишется после завершения обработки.") && botSrc.includes("вкладку «💬 В работе»"),
  'Expected accept pending copy to explain async credit charge and in-progress destination'
);
assert.ok(
  botSrc.includes(".text('📨 Открыть заявку', `a:brand_app_view|id:${app.id}|s:in_progress|p:${back.page}`)") && botSrc.includes("const bpLines = brandPassCreditsBlockLines(creditsCached, { showHintWhenUnknown: true });"),
  'Expected accepted/pending brand application card to keep application CTA and Redis-only credits block visible'
);
assert.ok(
  botSrc.includes(".text('📨 Открыть заявку', `a:brand_app_view|id:${res.id}|s:new|p:0`)") && !botSrc.includes(".text('📥 Открыть в Inbox', `a:brand_app_view|id:${res.id}|s:new|p:0`)"),
  'Expected new creator-application notifications to say Открыть заявку, not Inbox'
);
assert.ok(
  workerSrc.includes("{ text: '📨 Открыть заявку', callback_data: `a:brand_app_view|id:${appId}|s:in_progress|p:0` }") && workerSrc.includes("{ text: '💬 В работе', callback_data: 'a:brand_apps|ws:0|s:in_progress|p:0' }"),
  'Expected worker follow-up DM to route brand actor back into application / in-progress flow'
);

console.log('✅ smoke brand application accept UX contract OK');
