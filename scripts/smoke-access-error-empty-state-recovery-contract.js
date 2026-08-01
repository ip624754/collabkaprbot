#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECOVERY_KINDS,
  emptyStateText,
  getRecoveryCopy,
  recoveryHtml,
  recoveryPlain,
  recoveryToast,
} from '../src/bot/recoveryCopy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const botSrc = read('src/bot/bot.js');
const barterCallbacksSrc = read('src/bot/domains/barter/callbacks.js');
const workspaceCallbacksSrc = read('src/bot/domains/workspaces/callbacks.js');
const runtimeSrc = `${botSrc}\n${barterCallbacksSrc}\n${workspaceCallbacksSrc}`;
const gwAccessSrc = read('src/bot/gwAccess.js');
const recoverySrc = read('src/bot/recoveryCopy.js');

function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `Missing source anchor: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, `Missing source end anchor: ${end}`);
  return source.slice(from, to);
}

assert.deepEqual(RECOVERY_KINDS, [
  'channel',
  'application',
  'dialog',
  'offer',
  'giveaway',
  'folder',
  'role',
  'generic',
]);

for (const kind of RECOVERY_KINDS) {
  const item = getRecoveryCopy(kind);
  assert.ok(item.title && item.reason && item.action && item.toast, `Incomplete recovery copy: ${kind}`);
  assert.match(recoveryPlain(kind), /\n\n/);
  assert.match(recoveryHtml(kind), /^⚠️ <b>/);
  assert.equal(recoveryToast(kind), item.toast);
  for (const forbidden of ['Neon', 'Redis', 'QStash', 'миграц', 'таблиц', 'ENV', 'relation']) {
    assert.equal(recoveryPlain(kind).includes(forbidden), false, `Recovery copy leaks infrastructure (${kind}): ${forbidden}`);
  }
}

assert.equal(
  emptyStateText({ title: 'Пусто', reason: 'Причина.', action: 'Следующее действие.' }),
  'Пусто\n\nПричина.\n\nСледующее действие.'
);

// Recovery presentation stays bounded and does not turn every old toast into a modal alert.
assert.ok(botSrc.includes("show_alert: opts.showAlert === true"));
assert.ok(botSrc.includes("function recoveryBackCb(kind = 'generic', backCb = '')"));
assert.ok(botSrc.includes("if (kind === 'channel') return 'a:ws_list';"));
assert.ok(botSrc.includes("if (kind === 'application') return 'a:my_apps|p:0';"));
assert.ok(botSrc.includes("if (kind === 'giveaway') return 'a:gw_list';"));
assert.ok(botSrc.includes("return 'a:menu';"));

// Blind find-or-access wording is forbidden on ordinary user surfaces.
for (const forbidden of [
  'Канал не найден или нет доступа',
  'Заявка не найдена или нет доступа',
  'Оффер не найден или нет доступа',
]) {
  assert.equal(botSrc.includes(forbidden), false, `Ambiguous recovery copy remains: ${forbidden}`);
}

for (const forbidden of [
  'Временно недоступно: Redis',
  'Временно недоступно (Redis)',
  'Workspace не найден.',
  'cid: ${cid}',
]) {
  assert.equal(botSrc.includes(forbidden), false, `User-facing technical error copy remains: ${forbidden}`);
}
for (const diagnostic of [
  "'workspace_disconnected_surface'",
  "'curator_notes_store_unavailable'",
  "'curator_invite_store_unavailable'",
  "'curator_username_input_store_unavailable'",
  "'curator_reminder_rate_limit_store_unavailable'",
  "'curator_owner_notice_rate_limit_store_unavailable'",
]) {
  assert.ok(botSrc.includes(diagnostic), `Missing operator diagnostic breadcrumb: ${diagnostic}`);
}

// This is not a blind global replacement: operator-only authorization gates remain explicit.
assert.ok(botSrc.includes("if (!isSuperAdminTg(tgId)) { await ctx.reply('Нет доступа.'); return; }"));

// Representative ordinary-user boundaries use a classified recovery route.
for (const required of [
  "if (!o) return answerRecovery(ctx, 'offer');",
  "if (!built) return answerRecovery(ctx, 'dialog');",
  "if (!ws) return answerRecovery(ctx, 'channel');",
  "return answerRecovery(ctx, 'giveaway');",
  "await renderRecovery(ctx, 'role', { backCb: 'a:menu' });",
]) {
  assert.ok(runtimeSrc.includes(required), `Missing classified recovery boundary: ${required}`);
}
assert.ok(gwAccessSrc.includes("recoveryToast('giveaway')"));
assert.ok(gwAccessSrc.includes("recoveryPlain('giveaway')"));
assert.ok(gwAccessSrc.includes('const g = await db.getGiveawayForOwner(gwId, ownerUserId);'));

// Forged curator callbacks must not use unrestricted workspace lookup before membership proof.
const curatorWorkspace = sliceBetween(
  botSrc,
  'async function renderCuratorWorkspace(ctx, userId, wsId, opts = {})',
  'function curatorGwKb('
);
const membershipAt = curatorWorkspace.indexOf('db.listCuratorWorkspaces(userId)');
const unrestrictedAt = curatorWorkspace.indexOf('db.getWorkspaceAny(wsIdNum)');
assert.ok(membershipAt >= 0 && unrestrictedAt >= 0, 'Curator workspace proof spine missing');
assert.ok(membershipAt < curatorWorkspace.lastIndexOf('db.getWorkspaceAny(wsIdNum)'), 'Membership proof must precede curator workspace lookup');
assert.ok(curatorWorkspace.includes("await renderRecovery(ctx, 'channel', { backCb: 'a:cur_home' });"));

const curatorLegacyAction = sliceBetween(workspaceCallbacksSrc, "if (p.a === 'a:cur_ws_off')", "if (p.a === 'a:cur_ws')");
assert.ok(curatorLegacyAction.includes('const flags = await getRoleFlags(u, ctx.from.id);'));
assert.ok(curatorLegacyAction.indexOf('!flags.isCurator && !flags.isAdmin') < curatorLegacyAction.indexOf('renderCuratorWorkspace('));

// Empty states explain why the list is empty and what the user can do next.
for (const required of [
  "title: '📦 Неактивных каналов нет'",
  "reason: 'Все подключённые каналы сейчас активны.'",
  "title: 'История пока пуста'",
  "title: 'Действий по выбранным условиям нет'",
  "title: 'Офферов пока нет'",
  "action: 'Обнови ленту позже или настрой фильтры креаторов.'",
  "title: 'Подтверждений пока нет'",
  "action: 'Нажми «➕ Ссылка» или «📎 Скрин», когда появится подтверждение.'",
  "title: 'Событий пока нет'",
]) {
  assert.ok(runtimeSrc.includes(required), `Missing recovery/empty-state contract: ${required}`);
}

// Existing authorization and mutation boundaries stay authoritative.
const folderMutation = sliceBetween(workspaceCallbacksSrc, "if (p.a === 'a:folder_add')", "if (p.a === 'a:folder_remove')");
assert.ok(folderMutation.includes('if (!access || !access.canEdit)'));
assert.ok(folderMutation.indexOf('if (!access || !access.canEdit)') < folderMutation.indexOf('db.isWorkspacePro'));
assert.ok(folderMutation.indexOf('if (!access || !access.canEdit)') < folderMutation.indexOf('setExpectText'));

const mediaPhoto = sliceBetween(botSrc, "if (String(exp.type) === 'bx_media_photo')", "return next();");
assert.ok(mediaPhoto.indexOf('db.getBarterOfferForOwner') < mediaPhoto.indexOf('db.updateBarterOffer'));

// Action identities and recovery destinations are unchanged.
for (const callback of [
  "'a:ws_list'",
  "'a:my_apps|p:0'",
  "'a:gw_list'",
  "'a:menu'",
  "'a:home'",
  "'a:cur_ws'",
  "'a:bx_proof_link'",
]) {
  assert.ok(runtimeSrc.includes(callback), `Callback invariant missing: ${callback}`);
}

// Recovery copy is a pure presentation module; it must not query DB or external services.
for (const forbidden of ['db.', 'redis.', 'fetch(', 'process.env', 'getWorkspaceAny']) {
  assert.equal(recoverySrc.includes(forbidden), false, `Recovery copy must stay pure: ${forbidden}`);
}

console.log('✅ smoke access, error and empty-state recovery contract OK');
