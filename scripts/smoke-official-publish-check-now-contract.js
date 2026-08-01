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

function expectRegistry(action, { type, guard }) {
  const meta = ACTION_REGISTRY[action];
  assert.ok(meta, `missing action registry entry: ${action}`);
  assert.equal(meta.type, type, `unexpected type for ${action}`);
  assert.equal(meta.guard, guard, `unexpected guard for ${action}`);
}

const botSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'bot.js'), 'utf8');
const barterCallbacksSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'domains', 'barter', 'callbacks.js'), 'utf8');
const helperSource = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'officialPublishVerify.js'), 'utf8');
const workerSource = fs.readFileSync(path.join(ROOT, 'api', 'qstash', 'official-publish-verify.js'), 'utf8');

const renderOfficialManageViewSrc = extractBetween(
  botSource,
  "async function renderOfficialManageView(ctx, userId, wsId, offerId, page = 0, back = '') {",
  "\n\nasync function renderOfficialRequestHome(ctx, userId, wsId, offerId, page = 0, back = '') {"
);
assertMatch(
  renderOfficialManageViewSrc,
  /if \(isMod && st === 'PUBLISHING'\) \{[\s\S]*?kb\.text\('🩺 Проверить статус', `a:off_verify\|ws:\$\{wsId\}\|o:\$\{offerId\}\|p:\$\{page\}\|back:\$\{back\}`\)\.row\(\);[\s\S]*?\}/s,
  'Official manage view must expose check-now button for PUBLISHING moderators'
);

const offVerifyCallbackSrc = extractBetween(
  barterCallbacksSource,
  "    if (p.a === 'a:off_verify') {",
  "    if (p.a === 'a:off_upd') {"
);
assert.ok(offVerifyCallbackSrc.includes("await ctx.answerCallbackQuery({ text: 'Проверяю статус…' });"), 'Official publish check-now callback must keep initial toast');
assertMatch(
  offVerifyCallbackSrc,
  /const can = await isModerator\(u, ctx\.from\.id\);[\s\S]*?if \(!can\) \{[\s\S]*?Нет прав\./s,
  'Official publish check-now callback must keep moderator gate'
);
assert.ok(offVerifyCallbackSrc.includes("mode: 'manual'"), 'Official publish check-now callback must call verify helper in manual mode');
assert.ok(offVerifyCallbackSrc.includes('Публикация ещё слишком свежая. Проверь чуть позже.'), 'Official publish check-now callback must keep too-fresh toast');
assert.ok(offVerifyCallbackSrc.includes('Синхронизировано: ACTIVE.'), 'Official publish check-now callback must keep ACTIVE toast');
assert.ok(offVerifyCallbackSrc.includes('Статус сброшен в PENDING.'), 'Official publish check-now callback must keep reset toast');
assert.ok(offVerifyCallbackSrc.includes("await renderOfficialManageView(ctx, u.id, wsId, offerId, Number(p.p || 0), p.back || '');"), 'Official publish check-now callback must rerender manage view');

assert.ok(helperSource.includes('export async function verifyOfficialPublishState(input = {}) {'), 'officialPublishVerify helper must export verifyOfficialPublishState');
assert.ok(helperSource.includes("if (st !== 'PUBLISHING') {"), 'officialPublishVerify helper must keep not_publishing fast exit');
assert.ok(helperSource.includes("should_reschedule: mode === 'worker' && attempt < maxAttempts"), 'officialPublishVerify helper must keep worker-only reschedule signal');
assert.ok(helperSource.includes("via: 'redis_msgid'"), 'officialPublishVerify helper must keep redis_msgid heal path');
assert.ok(helperSource.includes("await db.setOfficialPostStatus(offerId, 'PENDING'"), 'officialPublishVerify helper must keep reset_pending heal path');

assert.ok(workerSource.includes("const result = await verifyOfficialPublishState({ ...payload, mode: 'worker' });"), 'official-publish-verify worker must delegate to verify helper');
assert.ok(workerSource.includes("if (result?.reason === 'too_fresh' && result?.should_reschedule) {"), 'official-publish-verify worker must keep bounded too-fresh reschedule');

expectRegistry('a:off_verify', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:off_manage', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:off_queue', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });

console.log('✅ smoke official-publish check-now contract OK');
