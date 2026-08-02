#!/usr/bin/env node
import { readQueryImplementationSource } from './lib/query-source-reader.js';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function extractBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `marker not found: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `end marker not found after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

const botSource = read('src/bot/bot.js');
const sharingSource = read('src/bot/domains/userServices/sharingCallbacks.js');
const inviteRuntimeSource = `${botSource}\n${sharingSource}`;
const queriesSource = readQueryImplementationSource();
const registrySource = read('src/bot/actionRegistry.js');
const migrationSource = read('migrations/046_invite_reward_ledger.sql');
const inviteUserSource = extractBetween(
  botSource,
  'function inviteSourceLabel(source) {',
  '\nasync function sendInviteCardMessage(ctx, inviteState) {'
);

// Public IA and terminology.
for (const token of [
  '📨 <b>Приглашения</b>',
  '📊 <b>Статистика приглашений</b>',
  '📄 <b>История приглашений</b>',
  '💎 <b>Баллы за приглашения</b>',
  '🎁 <b>Награды за приглашения</b>',
  '🧾 <b>Карточка приглашения</b>',
  '<b>Код приглашения:</b>',
  '<b>Доступно:</b>',
  '<b>В ожидании:</b>',
  '<b>Использовано:</b>',
  "return s === 'activated' ? 'активирован' : 'приглашён';",
  "if (s === 'inline_share') return 'через Telegram';",
  "if (s === 'invite_card') return 'по карточке';",
  "return 'по ссылке';",
  "title: 'Пригласить в Collabka'",
  "description: 'Отправить карточку приглашения в чат'",
  "description: 'Отправить персональную ссылку в чат'",
]) {
  assert.ok(inviteUserSource.includes(token), `public invite contract missing: ${token}`);
}

for (const stale of [
  'Статистика инвайтов',
  'История инвайтов',
  'Инвайт-карта',
  'Код инвайта',
  'инвайт-баллы',
  'Обменяно',
  'Ожидает подтверждения join',
  'Почему pending',
  'Share Collabka invite',
  'Share your personal Collabka invite',
  'completed profile',
  'Pro-target',
  'days Pro',
]) {
  assert.ok(!inviteUserSource.includes(stale), `stale public invite term leaked: ${stale}`);
}
assert.ok(!/\bpts\b/i.test(inviteUserSource), 'public invite surface must not expose pts');

// Mechanism truth must have one source used by both DB and copy.
for (const token of [
  "export const INVITE_REWARD_PUBLIC_RULES = Object.freeze({",
  "join: Object.freeze({ rewardType: 'invite_join', points: 2, confirmationHours: 24 })",
  "activation: Object.freeze({ rewardType: 'invite_activation', points: 10, confirmationHours: 48 })",
  "pro7: Object.freeze({ key: 'pro7', rewardType: 'pro_7d', costPoints: 100, days: 7, label: '7 дней PRO' })",
  "pro30: Object.freeze({ key: 'pro30', rewardType: 'pro_30d', costPoints: 250, days: 30, label: '30 дней PRO' })",
  'const rule = INVITE_REWARD_PUBLIC_RULES.join;',
  'const rule = INVITE_REWARD_PUBLIC_RULES.activation;',
  'rule.confirmationHours * 60 * 60 * 1000',
  'insertInviteEarnRewardIfMissing(client, row, rule.rewardType, rule.points, confirmAfter)',
]) {
  assert.ok(queriesSource.includes(token), `DB invite mechanism truth missing: ${token}`);
}
for (const token of [
  'const INVITE_JOIN_RULE = db.INVITE_REWARD_PUBLIC_RULES.join;',
  'const INVITE_ACTIVATION_RULE = db.INVITE_REWARD_PUBLIC_RULES.activation;',
  '...db.INVITE_REWARD_CATALOG.pro7',
  '...db.INVITE_REWARD_CATALOG.pro30',
  `+\${INVITE_JOIN_RULE.points}`,
  `+\${INVITE_ACTIVATION_RULE.points}`,
  `\${INVITE_JOIN_RULE.confirmationHours} часа`,
  `\${INVITE_ACTIVATION_RULE.confirmationHours} часов`,
]) {
  assert.ok(botSource.includes(token), `bot copy must use DB invite truth: ${token}`);
}

// Eligibility and anti-abuse rules remain authoritative in storage code.
for (const token of [
  "reason: 'self_referral'",
  "reason: 'existing_user_not_eligible'",
  'select id from member_invites where invited_user_id = $1 limit 1',
  "and inv.activated_at is not null",
  "on conflict do nothing",
  "select pg_try_advisory_xact_lock(hashtext($1)) as ok",
  "entry_kind = 'earn' and status = 'confirmed'",
  "entry_kind = 'redeem' and status = 'redeemed'",
]) {
  assert.ok(queriesSource.includes(token), `invite anti-abuse/invariant missing: ${token}`);
}

// Public copy states the eligibility and balance boundaries.
for (const token of [
  'первый запуск нового пользователя по твоей ссылке',
  'Простой переход по ссылке баллы не начисляет.',
  'Своя ссылка и уже существующие аккаунты не учитываются.',
  `незаполненный профиль не даёт дополнительные \${INVITE_ACTIVATION_RULE.points} баллов за активацию.`,
  'Один приглашённый может дать каждую награду только один раз.',
  'Баллы в ожидании пока нельзя использовать.',
  'Денежного вывода и перевода баллов другому пользователю нет.',
]) {
  assert.ok(inviteUserSource.includes(token), `public mechanism boundary missing: ${token}`);
}

// Redeem confirmation and success must name the cost, remaining balance and actual target.
for (const token of [
  'Будет использовано:',
  'Останется:',
  '<b>Куда добавится срок</b>',
  'Если есть профиль бренда — к Brand Plan PRO.',
  'Иначе, если есть канал — к PRO последнего созданного канала.',
  'После подтверждения действие нельзя отменить автоматически.',
  'function renderInviteRedeemSuccessText({ reward, rewards, result = null })',
  'const targetLabel = inviteRewardTargetLabel(result?.target);',
  'Применено к:',
  'renderInviteRedeemSuccessText({ reward, rewards: inviteState.rewards, result })',
]) {
  assert.ok(inviteRuntimeSource.includes(token), `redeem truth contract missing: ${token}`);
}

// Callback identities and persisted ledger schema stay stable.
for (const action of [
  'a:share',
  'a:share_perf',
  'a:share_points',
  'a:share_history',
  'a:share_rewards',
  'a:share_redeem',
  'a:share_redeem_do',
  'a:share_link',
  'a:share_card',
]) {
  assert.ok(inviteRuntimeSource.includes(action), `bot callback missing: ${action}`);
  assert.ok(registrySource.includes(`"${action}"`), `action registry callback missing: ${action}`);
}
assert.ok(migrationSource.includes("reward_type in ('invite_join', 'invite_activation', 'pro_7d', 'pro_30d')"), 'reward_type DB contract changed');
assert.ok(migrationSource.includes("status in ('pending', 'confirmed', 'rejected', 'redeemed')"), 'reward status DB contract changed');

console.log('✅ smoke invite language + mechanism honesty contract OK');
