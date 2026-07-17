import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const botSource = fs.readFileSync(path.join(root, 'src', 'bot', 'bot.js'), 'utf8');
const dbSource = fs.readFileSync(path.join(root, 'src', 'db', 'queries.js'), 'utf8');

function assertAbsent(source, needle, message) {
  assert.equal(source.includes(needle), false, message || `legacy copy must be absent: ${needle}`);
}

function assertPresent(source, needle, message) {
  assert.equal(source.includes(needle), true, message || `required contract missing: ${needle}`);
}

// Shared user-safe failure contract.
assertPresent(botSource, 'function copySafetyUnavailableHtml(', 'copy safety message helper must exist');
assertPresent(botSource, 'function copySafetyRecoveryKb(', 'copy safety recovery keyboard must exist');
assertPresent(botSource, 'function reportCopySafetyDiagnostic(', 'copy safety diagnostic helper must exist');
assertPresent(botSource, "console.warn('[copy_safety]'", 'copy safety diagnostics must keep an audit breadcrumb');
assertPresent(botSource, "text('💬 Поддержка', 'a:support')", 'safe failures must expose Support');
assertPresent(botSource, "text('📋 Меню', 'a:menu')", 'safe failures must expose Menu');
assertPresent(botSource, "text('🏠 Home', 'a:home')", 'safe failures must preserve Home callback contract');

// Ordinary-user copy must not expose migrations, tables, ENV keys or deployment instructions.
const legacyUserLeaks = [
  'В Neon должна быть таблица <code>brand_managers</code>.',
  'В Neon должна быть таблица <code>brand_profiles</code>.',
  'В базе нет таблицы brand_profiles. Применяй миграцию migrations/024_brand_profiles.sql в Neon и повтори.',
  'Не задан <code>BOT_USERNAME</code> в ENV.',
  'Invite-tracking сейчас недоступен:',
  'пока не применена миграция invite-layer',
  '<b>Нужна миграция soft-delete</b>',
  'Instagram OAuth пока отключён администратором (IG_OAUTH_ENABLED=0).',
  'Instagram OAuth сейчас недоступен: не настроен <code>IG_TOKEN_ENC_KEY',
  'Instagram OAuth сейчас недоступен: не настроены <code>IG_OAUTH_CLIENT_ID',
  '⚠️ Не настроено: PUBLIC_BASE_URL.',
  'Нет миграции invite rewards.',
  'Reward layer пока недоступен:',
  'Недостаточно available points',
];
for (const needle of legacyUserLeaks) assertAbsent(botSource, needle);

// The bounded taxonomy migration is explicit and stable.
for (const needle of [
  '7 дней PRO',
  '30 дней PRO',
  'заполнил основной профиль',
  'полная история баллов',
  'доступных баллов',
]) assertPresent(botSource, needle);

for (const needle of ['7 days Pro', '30 days Pro', 'completed profile', 'invite ledger', 'Pro-target']) {
  assertAbsent(botSource, needle, `ordinary-user invite legacy term must be absent: ${needle}`);
}
assert.equal(/(^|[^А-Яа-яЁё])офер([^А-Яа-яЁё]|$)/u.test(botSource), false, 'active typo «офер» must be absent');

// DB catalog labels are user-facing outputs; reward keys and economics stay unchanged.
assertPresent(dbSource, "pro7: { key: 'pro7', rewardType: 'pro_7d', costPoints: 100, days: 7, label: '7 дней PRO' }");
assertPresent(dbSource, "pro30: { key: 'pro30', rewardType: 'pro_30d', costPoints: 250, days: 30, label: '30 дней PRO' }");
assertAbsent(dbSource, "label: '7 days Pro'");
assertAbsent(dbSource, "label: '30 days Pro'");

// Technical truth remains available to operators through structured diagnostics.
const diagnostics = [
  "'brand_managers_relation_missing'",
  "relation: 'brand_managers'",
  "migration: '026_brand_managers'",
  "'brand_profiles_relation_missing'",
  "relation: 'brand_profiles'",
  "migration: '024_brand_profiles'",
  "'soft_delete_columns_missing'",
  "columns: ['is_deleted', 'deleted_at']",
  "runner: 'migrations/run.js'",
  "'invite_bot_username_missing'",
  "config: 'BOT_USERNAME'",
  "'ig_oauth_disabled'",
  "'ig_oauth_encryption_key_invalid'",
  "'ig_oauth_client_config_missing'",
  "'ig_oauth_public_base_url_missing'",
  "'invite_rewards_summary_unavailable'",
  "relation: 'invite_reward_ledger'",
  "'invite_snapshot_unavailable'",
  "relation: 'member_invites'",
];
for (const needle of diagnostics) assertPresent(botSource, needle);

// This STEP changes labels and failure presentation, not action identities.
for (const callback of ["'a:share_redeem_do'", "'a:support'", "'a:menu'", "'a:home'"]) {
  assertPresent(botSource, callback, `callback contract must remain present: ${callback}`);
}

console.log('OK: STEP586A copy safety and taxonomy foundation contract');
