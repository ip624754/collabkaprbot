#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const botPath = path.join(ROOT, 'src', 'bot', 'bot.js');
const dbPath = path.join(ROOT, 'src', 'db', 'queries.js');
const botSrc = fs.readFileSync(botPath, 'utf8');
const dbSrc = fs.readFileSync(dbPath, 'utf8');

assert.ok(
  dbSrc.includes("jsonb_build_object('set_by_user_id',$3::bigint,'set_at',now())"),
  'Expected deal stage metadata writer to cast set_by_user_id explicitly inside jsonb_build_object()'
);
assert.ok(
  botSrc.includes("kb.text(brandAppDealButtonLabel(), `a:brand_deal_view|id:${app.id}|st:${dealStage}|p:0|ab:${leadStatusToCb(back.status)}.${back.page}`).row();") &&
    botSrc.includes("return '🤝 Этап сделки';") &&
    !botSrc.includes("kb.text('📌 В сделках', `a:brand_deal_view|id:${app.id}|st:${dealStage}|p:0`).row();"),
  'Expected local application card CTA to use the canonical accepted-deal stage label'
);
assert.ok(
  botSrc.includes("<i>Это принятая заявка. Здесь хранятся диалог и этап сделки.</i>") &&
    botSrc.includes("if (backCtx.appStatus) {") &&
    botSrc.includes("kb.text(brandAppOpenButtonLabel(app.id), appBackCb).text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');"),
  'Expected deal view opened from an application to keep local context with a short hint and a concrete application-return footer'
);
assert.ok(
  botSrc.includes("if (hasPrev) kb.text('⬅️ Назад', `a:brand_apps|ws:0|s:${st}|p:${p - 1}`);") &&
    botSrc.includes("if (hasNext) kb.text('➡️ Далее', `a:brand_apps|ws:0|s:${st}|p:${p + 1}`);") &&
    botSrc.includes("if (hasPrev) kb.text('⬅️ Назад', `a:brand_deals|ws:0|st:${st}|p:${p - 1}`);") &&
    botSrc.includes("if (hasNext) kb.text('➡️ Далее', `a:brand_deals|ws:0|st:${st}|p:${p + 1}`);"),
  'Expected brand application/deal lists to expose readable pagination labels instead of icon-only arrows'
);

console.log('✅ smoke brand deal stage + navigation contract OK');
