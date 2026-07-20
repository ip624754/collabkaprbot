#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MONETIZATION_LABELS,
  brandPlanTierLabel,
  buildRecoveredPaymentMessage,
  buildStarsInvoiceDescription,
  buildStarsInvoiceTitle,
  paymentRecoveryBoundaryText,
  starsAmountLabel,
  STARS_INVOICE_DESCRIPTION_MAX,
  STARS_INVOICE_TITLE_MAX,
} from '../src/bot/monetizationCopy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const botSrc = read('src/bot/bot.js');
const starsSrc = read('src/bot/payments/starsHandlers.js');
const helpersSrc = read('src/bot/helpers.js');
const fallbackSrc = read('src/bot/payments_fallback.js') + '\n' + read('src/bot/paymentFulfillmentCore.js');
const cronSrc = read('src/bot/cron.js');
const qstashSrc = read('api/qstash/monetization-retry.js');
const configSrc = read('src/lib/config.js');

assert.deepEqual(MONETIZATION_LABELS, {
  BRAND_PLAN: 'Brand Plan',
  BRAND_CREDITS: 'Кредиты',
  CREATOR_PRO: 'PRO канала',
  MATCHING: 'Умный подбор',
  FEATURED: 'Продвижение',
  FOUNDER_SALE: 'Founder Sale',
  OFFICIAL_PLACEMENT: 'Размещение в официальном канале',
});
assert.equal(brandPlanTierLabel('basic'), 'Старт');
assert.equal(brandPlanTierLabel('max'), 'Про');
assert.equal(starsAmountLabel(250), '250 Stars');
assert.match(paymentRecoveryBoundaryText(), /Автоматического возврата нет/);
assert.ok(Array.from(buildStarsInvoiceTitle('x'.repeat(80))).length <= STARS_INVOICE_TITLE_MAX);
const boundedInvoiceDescription = buildStarsInvoiceDescription('x'.repeat(400));
assert.ok(Array.from(boundedInvoiceDescription).length <= STARS_INVOICE_DESCRIPTION_MAX);
assert.match(boundedInvoiceDescription, /\/paysupport/);
assert.match(boundedInvoiceDescription, /Автоматического возврата нет/);
assert.match(buildRecoveredPaymentMessage({ result: { kind: 'brand_plan', plan: 'pro', days: 30, credits: 50 }, amount: 1000 }), /Brand Plan «Про» активирован на 30 дней/);

for (const required of [
  'PRO_STARS_PRICE: parseIntSafe(process.env.PRO_STARS_PRICE, 500)',
  'PRO_DURATION_DAYS: parseIntSafe(process.env.PRO_DURATION_DAYS, 30)',
  'BRAND_PLAN_START_PRICE: parseIntSafe(process.env.BRAND_PLAN_START_PRICE, 250)',
  'BRAND_PLAN_START_CREDITS: parseIntSafe(process.env.BRAND_PLAN_START_CREDITS, 10)',
  'BRAND_PLAN_PRO_PRICE: parseIntSafe(process.env.BRAND_PLAN_PRO_PRICE, 1000)',
  'BRAND_PLAN_PRO_CREDITS: parseIntSafe(process.env.BRAND_PLAN_PRO_CREDITS, 50)',
  'BRAND_PLAN_DURATION_DAYS: parseIntSafe(process.env.BRAND_PLAN_DURATION_DAYS, 30)',
]) assert.ok(configSrc.includes(required), `Missing unchanged runtime price/duration config: ${required}`);

assert.ok(botSrc.includes("import { MONETIZATION_LABELS, buildStarsInvoiceDescription, buildStarsInvoiceTitle, starsAmountLabel } from './monetizationCopy.js';"));
assert.ok(botSrc.includes('const fullDescription = buildStarsInvoiceDescription(description);'));
assert.ok(botSrc.includes('title: buildStarsInvoiceTitle(title),'));
assert.ok(botSrc.includes('PRO действует только для выбранного канала. Он не включает Brand Plan и не начисляет кредиты бренда.'));
assert.ok(botSrc.includes('Brand Plan — подписка для бренда.'));
assert.ok(botSrc.includes('Кредиты — внутренние расходуемые единицы бренда.'));
assert.ok(botSrc.includes('Покупка кредитов не активирует Brand Plan.'));
assert.ok(botSrc.includes('Отличие тарифов сейчас — цена и число кредитов при активации.'));
assert.ok(botSrc.includes('🎯 <b>Умный подбор</b>'));
assert.ok(botSrc.includes('🔥 <b>Продвижение</b>'));
assert.ok(botSrc.includes('Это отдельная услуга. Она не списывает кредиты бренда.'));
assert.ok(botSrc.includes('title: `${MONETIZATION_LABELS.CREATOR_PRO} · ${CFG.PRO_DURATION_DAYS} дней`'));
assert.ok(botSrc.includes('title: `${MONETIZATION_LABELS.BRAND_CREDITS} · ${pack.credits} шт.`'));
assert.ok(botSrc.includes('title: `${MONETIZATION_LABELS.BRAND_PLAN} · ${label} · ${CFG.BRAND_PLAN_DURATION_DAYS} дней`'));
assert.ok(botSrc.includes('title: `${MONETIZATION_LABELS.MATCHING} · ${tier.title}`'));
assert.ok(botSrc.includes('title: `${MONETIZATION_LABELS.FEATURED} · ${d.title}`'));
assert.ok(botSrc.includes("{ id: 'S', credits: CFG.BRAND_TOPUP_S_CREDITS, stars: CFG.BRAND_TOPUP_S_PRICE }"));
assert.ok(!botSrc.includes("title: '+10 кредитов'"));

assert.ok(botSrc.includes('РОЗЫГРЫШ ДЛЯ БРЕНДОВ: Brand Plan «Про»'));
assert.ok(botSrc.includes('Умный подбор: до ${(MATCH_TIERS.find'));
assert.ok(botSrc.includes('Продвижение: ${BRAND_PLAN_INCLUDED_FEATURED_DAYS} дней'));
assert.ok(botSrc.includes('РОЗЫГРЫШ ДЛЯ КРЕАТОРОВ: PRO канала'));
assert.ok(botSrc.includes('До ${CFG.BARTER_MAX_ACTIVE_OFFERS_PRO} активных офферов'));
assert.ok(!botSrc.includes('• Smart Match (10 каналов/мес)'));
assert.ok(!botSrc.includes('• Featured размещение (7 дней)'));
assert.ok(!botSrc.includes('• Приоритет в ленте брендов'));
assert.ok(botSrc.includes('Оплата создаёт заявку на размещение. Публикация начнётся только после одобрения модератором.'));
assert.ok(botSrc.includes('Публикация после модерации.'));
assert.ok(!botSrc.includes('модератор нажмёт Apply'));
assert.ok(starsSrc.includes('Оффер передан модератору. Публикация начнётся только после одобрения.'));
assert.ok(!starsSrc.includes('Модератор опубликует его вручную.'));

for (const forbidden of [
  '<b>Кредиты</b> = Stars для новых диалогов.',
  'Stars тратятся только на новые диалоги.',
  '🎯 <b>Smart Matching (подбор офферов)</b>',
  '🔥 <b>Featured</b>',
  'MicroGiveaways PRO',
  '⭐️/мес',
]) assert.ok(!botSrc.includes(forbidden), `Forbidden monetization copy remains: ${forbidden}`);

assert.ok(starsSrc.includes('MATCH_TIERS,') && starsSrc.includes('FEATURED_DURATIONS,') && starsSrc.includes('BRAND_PLANS,'), 'Payment bundle must receive its runtime catalogs explicitly');
assert.ok(starsSrc.includes('Списано: <b>${starsAmountLabel(sp.total_amount)}</b>'));
assert.ok(starsSrc.includes('Кредиты расходуются на новые диалоги, принятие заявок и открытие контактов.'));
assert.ok(starsSrc.includes('CRM-этапы, менеджеры, Умный подбор и Продвижение доступны по условиям плана.'));
assert.ok(!starsSrc.includes('Smart Matching активирован'));
assert.ok(!starsSrc.includes('Featured активирован'));
assert.ok(botSrc.includes("title: 'Brand Plan «Про»'"));
assert.ok(botSrc.includes("title: 'PRO канала'"));
assert.ok(!botSrc.includes('Brand Plan Pro'));
assert.ok(!starsSrc.includes('Brand Plan Pro'));
assert.ok(helpersSrc.includes("else if (src === 'CREDITS') label = 'Кредиты';"));
assert.ok(!helpersSrc.includes("label = 'Brand Pass'"));

assert.ok(fallbackSrc.includes("kind: 'pro', wsId, days"));
assert.ok(fallbackSrc.includes("kind: 'brand_plan', plan: planId, days, credits, brandCreditsBalance: balance"));
assert.ok(cronSrc.includes('buildRecoveredPaymentMessage({'));
assert.ok(qstashSrc.includes('buildRecoveredPaymentMessage({'));

for (const invariant of [
  "const payloadPrefix = `pro_${wsId}_${u.id}_`;",
  "const payloadPrefix = `brand_${u.id}_${pack.id}_`;",
  "const payloadPrefix = `bplan_${u.id}_${plan}_`;",
  "const payloadPrefix = `match_${u.id}_${tier.id}_`;",
  "const payloadPrefix = `feat_${u.id}_${d.days}_`;",
  "const token = _signStarsInvoiceToken(payloadPrefix, tokenRaw);",
  "a:ws_pro_buy|ws:${wsId}",
  "a:brand_buy|ws:${wsId}",
  "a:brand_plan_buy|ws:${wsId}",
  "a:match_buy",
  "a:feat_buy",
]) assert.ok(botSrc.includes(invariant), `Payment callback/payload invariant missing: ${invariant}`);

for (const mechanism of [
  'verifyPayloadHmac(payloadRaw, cfg)',
  'applyPaymentAtomicTx({',
  "status='APPLIED'",
  "reason: 'ledger_amount_mismatch'",
  'insert into payment_fulfillments',
]) assert.ok(fallbackSrc.includes(mechanism), `Exactly-once/payment safety mechanism missing: ${mechanism}`);

console.log('✅ smoke monetization paid-product clarity contract OK');
