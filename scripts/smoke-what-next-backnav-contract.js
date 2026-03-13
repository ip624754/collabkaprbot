#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function extractBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `marker not found: ${startMarker}`);
  const end = src.indexOf(endMarker, start);
  assert.ok(end > start, `end marker not found after ${startMarker}: ${endMarker}`);
  return src.slice(start, end);
}

const botSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'bot.js'), 'utf8');

const navKbSrc = extractBetween(
  botSource,
  'function navKb(backCb) {',
  '\n\nfunction navKbInput(backCb) {'
);
assert.ok(navKbSrc.includes("if (backCb && backCb !== 'a:menu' && backCb !== 'a:home') kb.text('⬅️ Назад', backCb);"), 'navKb must keep Back only for real return routes');
assert.ok(navKbSrc.includes("kb.text('📋 Меню', 'a:menu');"), 'navKb must keep Menu escape hatch');
assert.ok(navKbSrc.includes("kb.text('🏠 Home', 'a:home');"), 'navKb must keep Home escape hatch');
assert.ok(!navKbSrc.includes('Открыть меню'), 'navKb must keep current runtime label 📋 Меню');

const navKbInputSrc = extractBetween(
  botSource,
  'function navKbInput(backCb) {',
  '\n\nfunction kbNavRow(kb, backCb) {'
);
assert.ok(navKbInputSrc.includes("kb.text('❌ Отмена', 'a:menu');"), 'navKbInput must keep explicit cancel-to-menu escape hatch');
assert.ok(navKbInputSrc.includes("kb.text('🏠 Home', 'a:home');"), 'navKbInput must keep Home escape hatch');

const kbNavRowSrc = extractBetween(
  botSource,
  'function kbNavRow(kb, backCb) {',
  "\n\nfunction kbAdminFooter(kb, backText = '⬅️ Админка', backCb = 'a:admin_home') {"
);
assert.ok(kbNavRowSrc.includes("if (backCb && backCb !== 'a:menu' && backCb !== 'a:home') kb.text('⬅️ Назад', backCb);"), 'kbNavRow must keep Back only for real return routes');
assert.ok(kbNavRowSrc.includes("kb.text('📋 Меню', 'a:menu');"), 'kbNavRow must keep Menu escape hatch');
assert.ok(kbNavRowSrc.includes("kb.text('🏠 Home', 'a:home');"), 'kbNavRow must keep Home escape hatch');

const renderGwNewGateSrc = extractBetween(
  botSource,
  "async function renderGwNewGate(ctx, { backCb = 'a:gw_list', reason = '' } = {}) {",
  '\n\nasync function getRoleFlags(userRow, tgId) {'
);
assert.ok(renderGwNewGateSrc.includes(".text('🚀 Подключить канал', 'a:setup')"), 'giveaway gate must keep connect CTA');
assert.ok(renderGwNewGateSrc.includes(".text('📣 Мои каналы', 'a:ws_list')"), 'giveaway gate must keep workspace list CTA');
assert.ok(renderGwNewGateSrc.includes(".text('📣 Выбрать канал', 'a:gw_new_pick')"), 'giveaway gate must keep explicit pick CTA');
assert.ok(renderGwNewGateSrc.includes(".text('⬅️ Назад', backCb)"), 'giveaway gate must keep Back CTA');
assert.ok(renderGwNewGateSrc.includes(".text('📋 Меню', 'a:menu')"), 'giveaway gate must keep Menu CTA');
assert.ok(renderGwNewGateSrc.includes(".text('🏠 Home', 'a:home');"), 'giveaway gate must keep Home CTA');

const kbBrandApplyDoneSrc = extractBetween(
  botSource,
  'function kbBrandApplyDone(brandUserId, backPage = 0, canOpenInbox = false) {',
  '\n\nfunction kbBrandApplyMore(brandUserId, backPage = 0, canOpenInbox = false) {'
);
assert.ok(kbBrandApplyDoneSrc.includes("kb.text('🔎 Открыть бренд', `a:brand_dir_open|u:${brandUserId}|p:${backPage}`).row();"), 'brand apply done must keep open-brand CTA');
assert.ok(kbBrandApplyDoneSrc.includes("kb.text('⋯ Ещё действия', `a:more|k:brand_apply_done|u:${brandUserId}|p:${backPage}|inb:${canOpenInbox ? 1 : 0}`).row();"), 'brand apply done must keep more-actions CTA');
assert.ok(kbBrandApplyDoneSrc.includes("kb.text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');"), 'brand apply done must keep Menu/Home escape hatches');

const kbBrandApplyMoreSrc = extractBetween(
  botSource,
  'function kbBrandApplyMore(brandUserId, backPage = 0, canOpenInbox = false) {',
  '\n\n\nfunction kbBrandAppAcceptedDone(appId, brandUserId) {'
);
assert.ok(kbBrandApplyMoreSrc.includes("kb.text('🏷 Каталог брендов', `a:brands_home|p:${backPage}`).row();"), 'brand apply more must keep catalog CTA');
assert.ok(kbBrandApplyMoreSrc.includes("kb.text('✍️ Ещё заявку', `a:brand_apply|u:${brandUserId}|p:${backPage}`).row();"), 'brand apply more must keep re-apply CTA');
assert.ok(kbBrandApplyMoreSrc.includes("kb.text('⬅️ Назад', `a:brand_apply_done|u:${brandUserId}|p:${backPage}|inb:${canOpenInbox ? 1 : 0}`).row();"), 'brand apply more must keep Back CTA');
assert.ok(kbBrandApplyMoreSrc.includes("kb.text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');"), 'brand apply more must keep Menu/Home escape hatches');

const kbBrandAppAcceptedDoneSrc = extractBetween(
  botSource,
  'function kbBrandAppAcceptedDone(appId, brandUserId) {',
  '\n\nfunction kbBrandAppAcceptedMore(appId, brandUserId) {'
);
assert.ok(kbBrandAppAcceptedDoneSrc.includes("kb.text('💬 Написать бренду', `a:brand_app_chat|id:${appId}`).row();"), 'accepted-done screen must keep chat CTA');
assert.ok(kbBrandAppAcceptedDoneSrc.includes("kb.text('⋯ Ещё действия', `a:more|k:brand_app_accepted|id:${appId}|u:${brandUserId}`).row();"), 'accepted-done screen must keep more-actions CTA');
assert.ok(kbBrandAppAcceptedDoneSrc.includes("kb.text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');"), 'accepted-done screen must keep Menu/Home escape hatches');

const kbBrandAppAcceptedMoreSrc = extractBetween(
  botSource,
  'function kbBrandAppAcceptedMore(appId, brandUserId) {',
  "\n\n\n// STEP308: Hydration tokens for oversized callback_data (>64 bytes)."
);
assert.ok(kbBrandAppAcceptedMoreSrc.includes("kb.text('📨 Открыть заявку', `a:brand_app_card|id:${appId}`).row();"), 'accepted-more screen must keep open-application CTA');
assert.ok(kbBrandAppAcceptedMoreSrc.includes("kb.text('🪟 Открыть бренд', `a:brand_dir_open|u:${brandUserId}|p:0`).row();"), 'accepted-more screen must keep open-brand CTA');
assert.ok(kbBrandAppAcceptedMoreSrc.includes("kb.text('⬅️ Назад', `a:brand_app_accepted_done|id:${appId}|u:${brandUserId}`).row();"), 'accepted-more screen must keep Back CTA');
assert.ok(kbBrandAppAcceptedMoreSrc.includes("kb.text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');"), 'accepted-more screen must keep Menu/Home escape hatches');

const renderBrandApplyPreviewSrc = extractBetween(
  botSource,
  'async function renderBrandApplyPreview(ctx, u, brandUserId, backPage, opts = {}) {',
  '\n\nasync function sendBrandApplyDraft(ctx, u, brandUserId, backPage, opts = {}) {'
);
assert.ok(renderBrandApplyPreviewSrc.includes('kbNavRow(kb, `a:brand_apply|u:${brandUserId}|p:${backPage}`);'), 'brand apply preview must keep shared Back/Menu/Home footer helper');

assert.ok(!botSource.includes('📋 Открыть меню'), 'runtime should consistently use current label 📋 Меню, not stale docs label');

console.log('smoke-what-next-backnav-contract: OK');
