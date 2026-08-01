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
const curatorManagementSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'domains', 'curators', 'managementCallbacks.js'), 'utf8');

expectRegistry('a:ws_share', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:ws_share_send', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:cur_invite', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });

const tgShareUrlSrc = extractBetween(
  botSource,
  'function tgShareUrl(url, text) {',
  '\n\nasync function trackAcqSource(tgId, src) {'
);
assert.ok(tgShareUrlSrc.includes('const qs = `url=${encodeURIComponent(u)}'), 'generic tgShareUrl helper must keep explicit url= parameter');
assert.ok(!tgShareUrlSrc.includes('share/url?text='), 'generic tgShareUrl helper must not emit text-only share URLs');

const sendWsShareTextMessageSrc = extractBetween(
  botSource,
  "async function sendWsShareTextMessage(ctx, ownerUserId, wsId, variant = 'short') {",
  '\n\nasync function renderWsIgTemplatesMenu(ctx, ownerUserId, wsId) {'
);
assert.ok(sendWsShareTextMessageSrc.includes("const plain = buildWsSharePlain(ws, wsId, variant);"), 'workspace share send must build plain text payload');
assert.ok(sendWsShareTextMessageSrc.includes("const shareUrl = `https://t.me/share/url?url=${encodeURIComponent('\\u2060')}&text=${encodeURIComponent(plain)}`;"), 'workspace share send must use invisible url= workaround');
assert.ok(sendWsShareTextMessageSrc.includes(".url('📨 Отправить', shareUrl)"), 'workspace share send must keep Telegram share button');
assert.ok(sendWsShareTextMessageSrc.includes('Some Telegram clients ignore share links without the `url=` param.'), 'workspace share send must document why the workaround exists');
assert.ok(!sendWsShareTextMessageSrc.includes('share/url?text='), 'workspace share send must not regress to text-only share URL');
assert.ok(!sendWsShareTextMessageSrc.includes('share/url?url=&text='), 'workspace share send must not use empty url= share URL');

const curatorInviteHandlerSrc = extractBetween(
  curatorManagementSource,
  "if (p.a === 'a:cur_invite') {",
  "\n\nif (p.a === 'a:cur_add_username') {"
);
assert.ok(curatorInviteHandlerSrc.includes("const shareUrl = `https://t.me/share/url?url=${encodeURIComponent('\\u2060')}&text=${encodeURIComponent(shareText)}`;"), 'curator invite share must use invisible url= workaround');
assert.ok(curatorInviteHandlerSrc.includes(".url('📤 Поделиться', shareUrl)"), 'curator invite flow must keep share button');
assert.ok(curatorInviteHandlerSrc.includes('Some Telegram clients ignore share links when `url=` is empty.'), 'curator invite flow must document empty-url incompatibility');
assert.ok(!curatorInviteHandlerSrc.includes('share/url?text='), 'curator invite flow must not regress to text-only share URL');
assert.ok(!curatorInviteHandlerSrc.includes('share/url?url=&text='), 'curator invite flow must not regress to empty url= share URL');

assert.ok(!/https:\/\/t\.me\/share\/url\?text=/.test(botSource + curatorManagementSource), 'bot/domain source must not contain text-only Telegram share URLs');
assert.ok(!/https:\/\/t\.me\/share\/url\?url=&text=/.test(botSource + curatorManagementSource), 'bot/domain source must not contain empty-url Telegram share URLs');

console.log('smoke-share-url-compat-contract: OK');
