#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTION_GUARD, ACTION_REGISTRY, ACTION_TYPES } from '../src/bot/actionRegistry.js';

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

function expectRegistry(action, { type, guard }) {
  const meta = ACTION_REGISTRY[action];
  assert.ok(meta, `missing action registry entry: ${action}`);
  assert.equal(meta.type, type, `unexpected type for ${action}`);
  assert.equal(meta.guard, guard, `unexpected guard for ${action}`);
}

const botSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'bot.js'), 'utf8');

expectRegistry('a:wsp_contact_req', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:wsp_contact_unlock', { type: ACTION_TYPES.PAY, guard: ACTION_GUARD.QUEUE_FIRST });

const renderWsProfileContactsStructuredSrc = extractBetween(
  botSource,
  'async function renderWsProfileContactsStructured(ctx, ownerUserId, wsId, opts = {}) {',
  '\n\nasync function renderWsProfileContactsClearMenu(ctx, ownerUserId, wsId) {'
);
assert.ok(renderWsProfileContactsStructuredSrc.includes('Эти поля <b>показываются бренду только после</b>'), 'structured contacts editor must explain paywalled reveal');
assert.ok(renderWsProfileContactsStructuredSrc.includes('Приоритет после разлока: <b>структурные</b> → (если пусто) <b>Контакт</b>.'), 'structured contacts editor must state structured-over-legacy priority');
assert.ok(renderWsProfileContactsStructuredSrc.includes(".text('🧹 Очистить поле', `a:ws_prof_contacts_clear|ws:${wsId}`)"), 'structured contacts editor must expose explicit clear CTA');

const renderWsPublicProfileSrc = extractBetween(
  botSource,
  'async function renderWsPublicProfile(ctx, wsId, opts = {}) {',
  '\n\nasync function renderWsLeadsList(ctx, ownerUserId, wsId, status = \'new\', page = 0, ret = null) {'
);
assert.ok(renderWsPublicProfileSrc.includes('// Public view: hide direct contacts/channel by default to prevent bypassing the bot.'), 'public profile must document anti-bypass default hidden contacts');
assert.ok(renderWsPublicProfileSrc.includes('// Contacts can be revealed via paid unlock (Brand Pass credits) and cached in Redis.'), 'public profile must document Brand Pass paid unlock');
assert.ok(renderWsPublicProfileSrc.includes('// DB fallback ONLY when Redis is unavailable.'), 'public profile contact unlock must keep DB fallback only for Redis degradation');
assert.ok(renderWsPublicProfileSrc.includes('const revealContacts = !!isPreview || !!unlocked || !!opts?.revealContacts;'), 'public profile must gate reveal strictly via preview/unlock');
assert.ok(renderWsPublicProfileSrc.includes('// Primary contact URL for brand-facing "💬 Написать".'), 'public profile must keep a single primary contact URL resolver');
assert.ok(renderWsPublicProfileSrc.includes('// Prefer structured Telegram username, then legacy, then structured site.'), 'public profile primary contact preference must stay structured→legacy→site');
assert.ok(renderWsPublicProfileSrc.includes('if (cTg) return `https://t.me/${cTg}`;'), 'public profile primary contact must prefer structured Telegram');
assert.ok(renderWsPublicProfileSrc.includes('if (contactUrlLegacy) return contactUrlLegacy;'), 'public profile primary contact must fall back to legacy contact');
assert.ok(renderWsPublicProfileSrc.includes('if (cSite) return cSite;'), 'public profile primary contact must only then fall back to structured site');
assert.ok(renderWsPublicProfileSrc.includes('const canUnlockContacts = hasStructuredContacts || !!contactRawTxt || !!ws.channel_username || !!ig || (ports && ports.length);'), 'public profile unlock CTA must depend on actual hidden contact surface');
assert.ok(renderWsPublicProfileSrc.includes('// Trust layer: verified badge is allowed BEFORE unlock, but handle/url are paywalled (contacts).'), 'public profile must keep verified-without-handle trust layer');
assert.ok(renderWsPublicProfileSrc.includes('portLine = `<b>🔒 скрыто</b>'), 'public profile must keep portfolio hidden before unlock');

const renderBrandLeadDialogSrc = extractBetween(
  botSource,
  'async function renderBrandLeadDialog(ctx, brandUserId, leadId, wsId = 0) {',
  '\n\nasync function renderLeadNotesViewer(ctx, actorUserId, leadId, back = { wsId: null, status: \'new\', page: 0, ret: \'\' }, notesPage = 0) {'
);
assert.ok(renderBrandLeadDialogSrc.includes('// Prevent monetization bypass: do not reveal direct channel handle in the lead dialog'), 'brand lead dialog must document anti-bypass channel hiding');
assert.ok(renderBrandLeadDialogSrc.includes('// unless contacts were unlocked for this brand on this workspace.'), 'brand lead dialog must only reveal channel after unlock');
assert.ok(renderBrandLeadDialogSrc.includes('// DB fallback ONLY when Redis is unavailable.'), 'brand lead dialog must keep DB fallback only for Redis degradation');
assert.ok(renderBrandLeadDialogSrc.includes("const channelShown = (ws?.channel_username && !contactsUnlocked) ? '🔒 скрыто' : channel;"), 'brand lead dialog must hide channel handle until contacts are unlocked');
assert.ok(renderBrandLeadDialogSrc.includes("kb.text(contactUnlockBtnLabel(), `a:wsp_contact_req|ws:${realWsId}|r:bl|l:${id}`)"), 'brand lead dialog must route contact unlock through Brand Pass CTA');

assert.ok(botSource.includes('// Do NOT include contacts in IG templates (anti-bypass).'), 'IG templates must keep anti-bypass no-contacts rule');
assert.ok(botSource.includes('// Anti-bypass: no contacts in template footer. Only bot link is in the template body.'), 'IG templates must keep no-contacts footer rule');
assert.ok(botSource.includes('// IMPORTANT: Do NOT include portfolio links in IG DM templates (portfolio may contain contacts).'), 'IG DM templates must keep no-portfolio anti-bypass rule');

console.log('smoke-contacts-brand-pass-contract: OK');
