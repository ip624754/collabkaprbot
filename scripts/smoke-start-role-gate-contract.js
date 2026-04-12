#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTION_GUARD, ACTION_REGISTRY, ACTION_TYPES } from '../src/bot/actionRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function assertMatch(src, re, msg) {
  assert.ok(re.test(src), msg || `expected source to match ${re}`);
}

function extractBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `marker not found: ${startMarker}`);
  const end = src.indexOf(endMarker, start);
  assert.ok(end > start, `end marker not found after ${startMarker}: ${endMarker}`);
  return src.slice(start, end);
}

function expectRegistry(action, { type, guard, breakGlass = undefined }) {
  const meta = ACTION_REGISTRY[action];
  assert.ok(meta, `missing action registry entry: ${action}`);
  assert.equal(meta.type, type, `unexpected type for ${action}`);
  assert.equal(meta.guard, guard, `unexpected guard for ${action}`);
  if (breakGlass !== undefined) {
    assert.equal(!!meta.breakGlass, !!breakGlass, `unexpected breakGlass for ${action}`);
  }
}

const botSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'bot.js'), 'utf8');
const helpersSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'helpers.js'), 'utf8');

const startHandlerSrc = extractBetween(
  botSource,
  "  bot.command('start', async (ctx) => {",
  "\n\n\n  bot.command('invite', async (ctx) => {"
);

const renderRoleSelectionSrc = extractBetween(
  botSource,
  'async function renderRoleSelection(ctx, u, opts = {}) {',
  '\n\nasync function renderAccountDeletedGate(ctx, opts = {}) {'
);

const homeModeHandlerSrc = extractBetween(
  botSource,
  "    if (p.a === 'a:home_mode') {",
  "\n\n    if (p.a === 'a:main_menu') {"
);

const uiModeSetHandlerSrc = extractBetween(
  botSource,
  "if (p.a === 'a:ui_mode_set') {",
  "\n\nif (p.a === 'a:guide') {"
);

const setUiModeSrc = extractBetween(
  botSource,
  'async function setUiMode(tgId, mode) {',
  '\n\nasync function getUiMode(tgId) {'
);

const parseStartPayloadSrc = extractBetween(
  helpersSource,
  'export function parseStartPayload(text) {',
  '\n\nexport function nowIso() {'
);

// Payload parser contract for supported deep-links.
assert.ok(parseStartPayloadSrc.includes("m = t.match(/\\/start\\s+gwj_(\\d+)/);"), 'parseStartPayload must support gwj_*');
assert.ok(parseStartPayloadSrc.includes("m = t.match(/\\/start\\s+gwc_(\\d+)/);"), 'parseStartPayload must support gwc_*');
assert.ok(parseStartPayloadSrc.includes("m = t.match(/\\/start\\s+gw_(\\d+)/);"), 'parseStartPayload must support gw_*');
assert.ok(parseStartPayloadSrc.includes("m = t.match(/\\/start\\s+bp_(\\d+)/);"), 'parseStartPayload must support bp_*');
assert.ok(parseStartPayloadSrc.includes("m = t.match(/\\/start\\s+offer_(\\d+)/);"), 'parseStartPayload must support offer_*');
assert.ok(parseStartPayloadSrc.includes("m = t.match(/\\/start\\s+wsp_(\\d+)/);"), 'parseStartPayload must support wsp_*');
assert.ok(parseStartPayloadSrc.includes("m = t.match(/\\/start\\s+fs_(\\w+)/);"), 'parseStartPayload must support fs_*');
assert.ok(parseStartPayloadSrc.includes("m = t.match(/\\/start\\s+ig_verify(?:_([A-Za-z0-9._]{2,30}))?/i);"), 'parseStartPayload must support ig_verify payloads');
assert.ok(parseStartPayloadSrc.includes("m = t.match(/\\/start\\s+src_(ig|tg)(?:\\b|_)/);"), 'parseStartPayload must support src_* acquisition markers');

// /start handler: payload priority before role gate + fail-open Redis gate.
assert.ok(startHandlerSrc.includes("const rawPayload = parseStartPayload(ctx.message?.text || '');"), '/start must parse payload first');
assert.ok(startHandlerSrc.includes('let payload = rawPayload;'), '/start must keep parsed payload as first-class routing input');
assert.ok(startHandlerSrc.includes("const acqSrc = payload?.type === 'src' ? String(payload.src || '').toLowerCase() : null;"), '/start must split acquisition markers from business payloads');
assertMatch(
  startHandlerSrc,
  /if \(acqSrc\) \{[\s\S]*?await trackAcqSource\(ctx\.from\?\.id, acqSrc\);[\s\S]*?payload = null;[\s\S]*?\}/s,
  '/start must convert src_* markers into tracking-only flow and continue as a normal /start'
);
assert.ok(startHandlerSrc.includes("if (payload?.type === 'wsp') {"), '/start must keep wsp_* deep-link branch before role gate');
assert.ok(startHandlerSrc.includes("if (payload?.type === 'bp') {"), '/start must keep bp_* deep-link branch before role gate');
assert.ok(startHandlerSrc.includes("if (payload?.type === 'offer') {"), '/start must keep offer_* deep-link branch before role gate');
assert.ok(startHandlerSrc.includes("if (payload?.type === 'ig_verify') {"), '/start must keep ig_verify payload branch before role gate');
assert.ok(startHandlerSrc.includes("if (payload?.type === 'fs') {"), '/start must keep fs_* payload branch before role gate');
assert.ok(startHandlerSrc.includes('let hasUiModeKey = false;'), '/start must derive gate state from raw Redis key presence');
assert.ok(startHandlerSrc.includes("const raw = await redis.get(k(['ui_mode', ctx.from.id]));"), '/start role gate must read ui_mode key directly');
assert.ok(startHandlerSrc.includes('hasUiModeKey = true; // fail-open: если Redis недоступен — ведём себя как раньше'), '/start role gate must stay fail-open on Redis outage');
assertMatch(
  startHandlerSrc,
  /if \(!hasUiModeKey\) \{[\s\S]*?await renderRoleSelection\(ctx, u, \{ edit: false \}\);[\s\S]*?return;[\s\S]*?\}\s*[\s\S]*?const flags = await getRoleFlags\(u, ctx\.from\.id\);/s,
  '/start must render role gate only when ui_mode key is absent and only load flags after passing the gate'
);
assert.ok(!startHandlerSrc.includes('await resolveUiMode('), '/start hot path must not resolve ui_mode via defaulting helper before the gate');
assert.ok(!startHandlerSrc.includes('db.listBrandsForManager('), '/start hot path must not add brand-manager DB reads');

const idxIgVerify = startHandlerSrc.indexOf("if (payload?.type === 'ig_verify') {");
const idxFounderSale = startHandlerSrc.indexOf("if (payload?.type === 'fs') {");
const idxGate = startHandlerSrc.indexOf('let hasUiModeKey = false;');
const idxRoleFlags = startHandlerSrc.indexOf('const flags = await getRoleFlags(u, ctx.from.id);');
assert.ok(idxIgVerify >= 0 && idxIgVerify < idxGate, 'ig_verify payload branch must stay before the role gate');
assert.ok(idxFounderSale >= 0 && idxFounderSale < idxGate, 'fs_* payload branch must stay before the role gate');
assert.ok(idxGate >= 0 && idxGate < idxRoleFlags, 'role gate must execute before HomeHub role flags load');

// Role selection screen contract.
assert.ok(renderRoleSelectionSrc.includes('🏠 <b>Добро пожаловать</b>'), 'Role gate must keep welcome heading');
assert.ok(renderRoleSelectionSrc.includes('Выбери, как хочешь работать:'), 'Role gate must keep short first-run split copy');
assert.ok(renderRoleSelectionSrc.includes('✨ Creator / канал — офферы, Inbox и заявки брендов через твои каналы.'), 'Role gate must explain creator path briefly');
assert.ok(renderRoleSelectionSrc.includes('🏷 Бренд — лента креаторов, Inbox, заявки и фильтры.'), 'Role gate must explain brand path briefly');
assert.ok(renderRoleSelectionSrc.includes('<i>Режим можно поменять позже на «🏠 Home».</i>'), 'Role gate must keep later-switch hint');
assert.ok(renderRoleSelectionSrc.includes(".text('🏢 Бренд / Заказчик', 'a:home_mode|m:brand')"), 'Role gate must keep brand pick button');
assert.ok(renderRoleSelectionSrc.includes(".text('🤳 Креатор / Блогер', 'a:home_mode|m:creator')"), 'Role gate must keep creator pick button');
assert.ok(renderRoleSelectionSrc.includes(".text('📨 Инвайты', 'a:share');"), 'Role gate must keep share button');

// Strong-intent role switch contract.
assert.ok(homeModeHandlerSrc.includes('let hadUiMode = true;'), 'a:home_mode must detect first explicit role pick');
assert.ok(homeModeHandlerSrc.includes('hadUiMode = true; // fail-open'), 'a:home_mode must stay fail-open if Redis read fails');
assert.ok(homeModeHandlerSrc.includes('managerBrands = await db.listBrandsForManager(u.id);'), 'a:home_mode may query manager brands only on explicit click');
assertMatch(
  homeModeHandlerSrc,
  /if \(m === 'creator'\) \{[\s\S]*?await setUiMode\(ctx\.from\.id, UI_MODES\.CREATOR\);[\s\S]*?await disableBrandManagerState\(ctx\.from\.id\);[\s\S]*?await setCuratorMode\(ctx\.from\.id, false\);[\s\S]*?await renderRoleHub\(ctx, u, flags2\);[\s\S]*?return;[\s\S]*?\}/s,
  'a:home_mode creator path must persist creator mode, clear brand-manager/curator overlays, and render role hub'
);
assertMatch(
  homeModeHandlerSrc,
  /if \(m === 'brand'\) \{[\s\S]*?await setUiMode\(ctx\.from\.id, UI_MODES\.BRAND\);[\s\S]*?await disableBrandManagerState\(ctx\.from\.id\);[\s\S]*?await setCuratorMode\(ctx\.from\.id, false\);[\s\S]*?await renderRoleHub\(ctx, u, flags2\);[\s\S]*?return;[\s\S]*?\}/s,
  'a:home_mode brand path must persist brand mode, clear overlays, and render role hub'
);

// Legacy/direct ui_mode switch must still clear manager context and stay non-blocking.
assertMatch(
  uiModeSetHandlerSrc,
  /await disableBrandManagerState\(ctx\.from\.id\);[\s\S]*?await setUiMode\(ctx\.from\.id, mode\);/s,
  'a:ui_mode_set must clear brand-manager state before setting ui_mode'
);
assert.ok(uiModeSetHandlerSrc.includes('hadUiMode = true; // fail-open'), 'a:ui_mode_set must keep fail-open behavior on Redis read failure');
assert.ok(uiModeSetHandlerSrc.includes('await renderMainMenu(ctx, flags, { edit: true, user: u, modeOverride: mode });'), 'a:ui_mode_set must still render main menu directly after switch');

// Redis write helper itself must swallow failures for fail-open UX.
assertMatch(
  setUiModeSrc,
  /try \{[\s\S]*?await redis\.set\(k\(\['ui_mode', tgId\]\), normalizeUiMode\(mode\), \{ ex: 365 \* 24 \* 3600 \}\);[\s\S]*?\} catch \{[\s\S]*?\/\/ ignore[\s\S]*?\}/s,
  'setUiMode must ignore Redis write failures to preserve fail-open role switching'
);

expectRegistry('a:home_mode', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:ui_mode_set', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:home', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:menu', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:share', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS });

console.log('✅ smoke start role-gate contract OK');
