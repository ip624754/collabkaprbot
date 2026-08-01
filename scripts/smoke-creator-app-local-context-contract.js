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
const brandDirectoryPath = path.join(ROOT, 'src', 'bot', 'domains', 'brands', 'directoryCallbacks.js');
const brandDirectorySrc = fs.readFileSync(brandDirectoryPath, 'utf8');

assert.ok(
  botSrc.includes("function creatorBrandAppDialogReturnButtonLabel(appId = 0) {") &&
    botSrc.includes("function creatorBrandAppCardReturnButtonLabel(appId = 0) {") &&
    botSrc.includes("function creatorBrandAppOpenBrandCallback(brandUserId = 0, appId = 0, backPage = 0) {") &&
    botSrc.includes("return id ? `⬅️ К диалогу #${id}` : '⬅️ К диалогу';") &&
    botSrc.includes("return id ? `⬅️ К заявке #${id}` : '⬅️ К заявке';"),
  'Expected creator application flow to expose dedicated local-return labels/helpers for dialog and brand-card hops'
);

assert.ok(
  botSrc.includes("const showBrandOpen = opts.showBrandOpen === true && brandId > 0;") &&
    botSrc.includes("if (showDialog) kb.text(creatorBrandAppDialogReturnButtonLabel(id), `a:brand_app_card|id:${id}`);") &&
    botSrc.includes("kb.text(creatorBrandAppListReturnButtonLabel(), 'a:my_apps|p:0');") &&
    botSrc.includes("if (showBrandOpen) kb.text('🪟 Открыть бренд', creatorBrandAppOpenBrandCallback(brandId, id, 0));"),
  'Expected creator reply composer keyboard to stay local-first and keep open-brand opt-in only'
);

assert.ok(
  botSrc.includes("const backCb = brandAppId > 0 ? `a:brand_app_card|id:${brandAppId}` : `a:brands_home|p:${backPage}`;") &&
    botSrc.includes("const backLabel = brandAppId > 0 ? creatorBrandAppCardReturnButtonLabel(brandAppId) : '⬅️ Назад к списку';") &&
    botSrc.includes("kb.text(backLabel, backCb).row();") &&
    botSrc.includes("creatorBrandAppOpenBrandCallback(brandUserId, app.id, 0)") &&
    botSrc.includes("creatorBrandAppOpenBrandCallback(Number(brandUserId || 0), Number(appId || 0), 0)") &&
    brandDirectorySrc.includes("const brandAppId = Math.max(0, Number(p.ba || 0));") &&
    !botSrc.includes("if (p.a === 'a:brand_dir_open') {") &&
    botSrc.includes('handleBrandDirectoryCallback'),
  'Expected creator-side open-brand actions to carry local application context and brand cards to return back into that application'
);

console.log('✅ smoke creator-side application local-context contract OK');
