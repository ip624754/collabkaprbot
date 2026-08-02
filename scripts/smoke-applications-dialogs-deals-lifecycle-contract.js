#!/usr/bin/env node
import { readQueryImplementationSource } from './lib/query-source-reader.js';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMonetizationRetryWorkerSource } from './lib/step590g3-source-reader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const botSrc = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'bot.js'), 'utf8');
const applicationCallbacksSrc = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'domains', 'applications', 'callbacks.js'), 'utf8');
const dbSrc = readQueryImplementationSource();
const starsSrc = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'payments', 'starsHandlers.js'), 'utf8');
const retrySrc = readMonetizationRetryWorkerSource(ROOT);
const runtimeSrc = [botSrc, applicationCallbacksSrc, starsSrc, retrySrc].join('\n');

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `start marker not found: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `end marker not found after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

const creatorMenu = between(botSrc, 'function mainMenuCreatorKb(', '\nfunction currentWsLabel(');
const brandMenu = between(botSrc, 'function mainMenuBrandKb(', '\nfunction navKb(');
const dialogList = between(botSrc, 'async function renderBxInbox(', '\nasync function renderBxThread(');
const creatorCard = between(botSrc, 'async function renderBrandAppCardForCreator(', '\nasync function startBrandAppChatForCreator(');
const brandAppCard = between(botSrc, 'async function renderBrandAppView(', '\nasync function startBrandAppReply(');
const dealView = between(botSrc, 'async function renderBrandDealView(', '\nasync function renderBrandAppView(');
const dealReply = between(botSrc, 'async function startBrandDealReply(', '\nasync function renderBrandDealTemplates(');
const dealTemplates = between(botSrc, 'async function renderBrandDealTemplates(', '\nasync function sendBrandDealTemplateReply(');
const dealTemplateSend = between(botSrc, 'async function sendBrandDealTemplateReply(', '\nasync function _renderTplFlowLead(');
const dealSetHandler = between(applicationCallbacksSrc, "\tif (p.a === 'a:brand_deal_set') {", "if (p.a === 'a:brand_deal_reply') {");

// Canonical visible taxonomy. Callback identities stay unchanged.
assert.ok(creatorMenu.includes(".text('💬 Диалоги', 'a:go_dialogs')"), 'creator menu must expose 💬 Диалоги on the existing callback');
assert.ok(brandMenu.includes(".text('💬 Диалоги', 'a:bx_inbox|ws:0|p:0|h:mm')"), 'brand menu must expose offer conversations as Диалоги');
assert.ok(brandMenu.includes(".text('📨 Заявки', 'a:brand_apps|ws:0|s:new|p:0')"), 'brand menu must expose pre-acceptance applications as Заявки');
assert.ok(brandMenu.includes(".text('🤝 Сделки', 'a:brand_deals|ws:0|st:negotiation|p:0')"), 'brand menu must expose accepted applications as Сделки');
for (const callback of ['a:bx_inbox', 'a:brand_apps', 'a:brand_deals', 'a:brand_app_view', 'a:brand_deal_view', 'a:brand_app_card']) {
  assert.ok(runtimeSrc.includes(callback), `lifecycle callback must remain present: ${callback}`);
}

// Dialogs are offer conversations, not an alias for applications.
assert.ok(dialogList.includes('💬 <b>Диалоги</b>'), 'dialog list must use the canonical title');
assert.ok(dialogList.includes('Переписка по офферам и свежие сообщения.'), 'dialog list must explain its real scope');
assert.ok(dialogList.includes('Заявки к брендам открываются в разделе «Заявки».'), 'dialog empty state must route applications to the right surface');
assert.ok(!runtimeSrc.includes('📥 Диалоги'), 'legacy inbox icon must not remain on active dialog labels');
assert.ok(!runtimeSrc.includes('в Диалоги'), 'ungrammatical legacy Inbox replacement must not remain');
assert.ok(!runtimeSrc.includes('из своего Диалоги'), 'legacy delete copy must not remain');

// A pre-acceptance application must not be presented as a deal.
assert.ok(creatorCard.includes("const cardTitle = st === 'new'"), 'creator application card must derive its title from state');
assert.ok(creatorCard.includes("? `📨 <b>Заявка #${app.id}</b>`"), 'new application must be titled Заявка');
assert.ok(creatorCard.includes("? `🤝 <b>Сделка #${app.id}</b>`"), 'accepted application with deal evidence may be titled Сделка');
assert.ok(creatorCard.includes("if (dealStage) {"), 'deal stage must be shown only when authoritative evidence exists');
assert.ok(brandAppCard.includes("if (dealStage) {"), 'brand application card must gate deal UI on deal_stage evidence');
assert.ok(brandAppCard.includes('kb.text(brandAppDealButtonLabel()'), 'accepted application card must use the canonical deal-stage CTA');
assert.ok(!brandAppCard.includes("kb.text('📌 Стадия сделки'"), 'legacy deal-stage CTA must be removed');
assert.ok(botSrc.includes("lost: { id: 'lost', icon: '🗑', label: 'Остановлено' }"), 'stopped deal state must use one canonical label');
assert.ok(botSrc.includes('`Этап: <b>${escapeHtml(dealStageTitle(st))}</b>\\n`;'), 'deal list must call the lifecycle state an Этап, not an internal stage');

// Deal surfaces and mutations require both accepted_by_user_id and deal_stage.
assert.ok(botSrc.includes('function isAcceptedBrandDeal(app)'), 'runtime must define one accepted-deal invariant');
assert.ok(dealView.includes('if (!isAcceptedBrandDeal(app))'), 'deal view must reject forged pre-acceptance routes');
assert.ok(dealReply.includes('if (!isAcceptedBrandDeal(app))'), 'deal reply must reject forged pre-acceptance routes');
assert.ok(dealTemplates.includes('if (!isAcceptedBrandDeal(app))'), 'deal template picker must reject forged pre-acceptance routes');
assert.ok(dealTemplateSend.includes('if (!isAcceptedBrandDeal(app))'), 'deal template send must reject forged pre-acceptance routes');
assert.ok(dealSetHandler.includes('const access = await assertBrandAppsAccess'), 'deal-stage mutation must verify actor access before writing');
assert.ok(dealSetHandler.includes('if (!isAcceptedBrandDeal(app))'), 'deal-stage mutation must reject applications that were not accepted');
assert.ok(dbSrc.includes("coalesce(meta->'deal'->>'accepted_by_user_id','') <> '' and coalesce(meta->>'deal_stage','') <> ''"), 'deal queries must require accepted evidence plus deal stage');
assert.ok(dbSrc.includes("where id=$1\n       and coalesce(meta->'deal'->>'accepted_by_user_id','') <> ''\n       and coalesce(meta->>'deal_stage','') <> ''"), 'deal-stage writer must preserve the accepted-only invariant');
assert.ok(dbSrc.includes("jsonb_build_object('set_by_user_id',$3::bigint,'set_at',now())"), 'deal-stage audit trail must remain intact');

// Acceptance receipts and async notifications state the actual transition.
assert.ok(botSrc.includes('Бренд увидит её в разделе «Заявки».'), 'application send receipt must route the brand to Applications');
assert.ok(botSrc.includes('Сделка открыта. Переписка продолжается в этом боте.'), 'accepted notification must state the deal transition');
assert.ok(retrySrc.includes('Сделка открыта, а переписка продолжается в боте.'), 'QStash acceptance notification must use the same lifecycle truth');

// Payment surfaces point to offer conversations without changing callbacks or economics.
assert.ok(starsSrc.includes(".text('💬 Диалоги', `a:bx_inbox|ws:${wsId}|p:0|h:bo`)"), 'credits success route must retain the existing dialog callback through canonical fulfillment context');
assert.ok(starsSrc.includes('Дальше: открой «💬 Диалоги» и выбери нужный диалог.'), 'payment copy must name the next action precisely');

console.log('✅ Applications → Dialogs → Deals lifecycle contract OK');
