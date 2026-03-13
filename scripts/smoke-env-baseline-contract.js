#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function parseEnvText(src) {
  const out = {};
  for (const rawLine of String(src || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadLocalEnvFiles() {
  const merged = {};
  const files = ['.env', '.env.local', '.env.production', '.env.production.local'];
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    Object.assign(merged, parseEnvText(fs.readFileSync(abs, 'utf8')));
  }
  return merged;
}

function assertDocHas(doc, needle, msg) {
  assert.ok(doc.includes(needle), msg || `expected docs baseline to mention ${needle}`);
}

function assertDocLacks(doc, needle, msg) {
  assert.ok(!doc.includes(needle), msg || `docs baseline must not mention obsolete ${needle}`);
}

const envExample = parseEnvText(readText('.env.example'));
const envDoc = readText('docs/92_PROD_ENV_BASELINE.md');
const configSource = readText('src/lib/config.js');

const requiredExampleKeys = [
  'APP_ENV',
  'BOT_TOKEN',
  'BOT_USERNAME',
  'DATABASE_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'WEBHOOK_SECRET_TOKEN',
  'CRON_SECRET',
  'SUPER_ADMIN_TG_IDS',
  'BRAND_APP_SUPERADMIN_COPY_ENABLED',
  'PUBLIC_BASE_URL',
  'SUPPORT_CHAT_ID',
  'QSTASH_TOKEN',
  'QSTASH_CURRENT_SIGNING_KEY',
  'QSTASH_NEXT_SIGNING_KEY',
  'QSTASH_RETRY_MAX',
  'PAYMENTS_PROVIDER_TOKEN',
  'PAYMENTS_PAYLOAD_HMAC_KEY',
  'PAYMENTS_PAYLOAD_HMAC_LEN',
  'PAYMENTS_FALLBACK_ALLOW_UNSIGNED',
  'PAYMENTS_FALLBACK_APPLY_ENABLED',
  'BROADCAST_QUARANTINE_THRESHOLD',
  'BROADCAST_QUARANTINE_SEC',
  'BROADCAST_GLOBAL_429_THRESHOLD',
  'BROADCAST_GLOBAL_429_WINDOW_SEC',
  'BROADCAST_HARD_SKIP_TTL_DAYS',
  'AUDIT_BUFFER_ENABLED',
  'AUDIT_BUFFER_ON_DB_ERROR',
  'AUDIT_BUFFER_MAX_LEN',
  'AUDIT_BUFFER_TTL_SEC',
  'AUDIT_BUFFER_FLUSH_BATCH',
  'AUDIT_BUFFER_FLUSH_MAX_MS',
  'IG_OAUTH_ENABLED',
  'IG_ROUTES_ENABLED',
  'IG_OAUTH_UI_ENABLED',
  'IG_VERIFY_TICK_ENABLED',
];

for (const key of requiredExampleKeys) {
  assert.ok(Object.prototype.hasOwnProperty.call(envExample, key), `.env.example must include ${key}`);
}

assert.equal(envExample.APP_ENV, 'prod', '.env.example must default APP_ENV=prod for prod-like release sanity');
assert.equal(envExample.BRAND_APP_SUPERADMIN_COPY_ENABLED, '1', '.env.example must keep BRAND_APP_SUPERADMIN_COPY_ENABLED=1 for zero-regression rollout');
assert.equal(envExample.PAYMENTS_FALLBACK_ALLOW_UNSIGNED, '0', '.env.example must keep PAYMENTS_FALLBACK_ALLOW_UNSIGNED=0');
assert.equal(envExample.PAYMENTS_FALLBACK_APPLY_ENABLED, '0', '.env.example must keep PAYMENTS_FALLBACK_APPLY_ENABLED=0');
assert.equal(envExample.IG_OAUTH_ENABLED, 'false', '.env.example must keep IG_OAUTH_ENABLED=false in parked prod baseline');
assert.equal(envExample.IG_ROUTES_ENABLED, 'false', '.env.example must keep IG_ROUTES_ENABLED=false in parked prod baseline');
assert.equal(envExample.IG_OAUTH_UI_ENABLED, 'false', '.env.example must keep IG_OAUTH_UI_ENABLED=false in parked prod baseline');
assert.equal(envExample.IG_VERIFY_TICK_ENABLED, 'false', '.env.example must keep IG_VERIFY_TICK_ENABLED=false in parked prod baseline');

assertDocHas(envDoc, 'PUBLIC_BASE_URL=<set>', 'docs/92 must mention PUBLIC_BASE_URL in Core baseline');
assertDocHas(envDoc, 'SUPER_ADMIN_TG_IDS=<set>', 'docs/92 must mention SUPER_ADMIN_TG_IDS in Core baseline');
assertDocHas(envDoc, 'BRAND_APP_SUPERADMIN_COPY_ENABLED=1', 'docs/92 must mention BRAND_APP_SUPERADMIN_COPY_ENABLED=1 in Core baseline');
assertDocHas(envDoc, 'PAYMENTS_FALLBACK_APPLY_ENABLED=0', 'docs/92 must document safe default PAYMENTS_FALLBACK_APPLY_ENABLED=0');
assertDocHas(envDoc, 'PAYMENTS_FALLBACK_ALLOW_UNSIGNED=0', 'docs/92 must document safe default PAYMENTS_FALLBACK_ALLOW_UNSIGNED=0');
assertDocHas(envDoc, 'IG_OAUTH_UI_ENABLED=false', 'docs/92 must document parked IG UI baseline');
assertDocLacks(envDoc, 'BOT_WEBHOOK_URL=<set>', 'docs/92 must not refer to obsolete BOT_WEBHOOK_URL baseline');
assertDocLacks(envDoc, 'SUPER_ADMIN_IDS=<set>', 'docs/92 must not refer to obsolete SUPER_ADMIN_IDS baseline');

assert.ok(configSource.includes("if (!CFG.WEBHOOK_SECRET_TOKEN) missing.push('WEBHOOK_SECRET_TOKEN');"), 'assertEnv must require WEBHOOK_SECRET_TOKEN in prod');
assert.ok(configSource.includes("if (!CFG.CRON_SECRET) missing.push('CRON_SECRET');"), 'assertEnv must require CRON_SECRET in prod');
assert.ok(configSource.includes("if (!CFG.SUPER_ADMIN_TG_IDS?.length) missing.push('SUPER_ADMIN_TG_IDS');"), 'assertEnv must require SUPER_ADMIN_TG_IDS in prod');
assert.ok(configSource.includes("if (!CFG.BOT_TOKEN) missing.push('BOT_TOKEN');"), 'assertEnv must require BOT_TOKEN');
assert.ok(configSource.includes("if (!CFG.BOT_USERNAME) missing.push('BOT_USERNAME');"), 'assertEnv must require BOT_USERNAME');
assert.ok(configSource.includes("if (!CFG.DATABASE_URL) missing.push('DATABASE_URL');"), 'assertEnv must require DATABASE_URL');
assert.ok(configSource.includes("if (!CFG.UPSTASH_REDIS_REST_URL) missing.push('UPSTASH_REDIS_REST_URL');"), 'assertEnv must require UPSTASH_REDIS_REST_URL');
assert.ok(configSource.includes("if (!CFG.UPSTASH_REDIS_REST_TOKEN) missing.push('UPSTASH_REDIS_REST_TOKEN');"), 'assertEnv must require UPSTASH_REDIS_REST_TOKEN');

const localEnv = loadLocalEnvFiles();
const merged = { ...localEnv, ...process.env };
const appEnv = String(merged.APP_ENV || '').trim().toLowerCase();
if (appEnv === 'prod' || appEnv === 'production') {
  const requiredRuntimeKeys = [
    'BOT_TOKEN',
    'BOT_USERNAME',
    'DATABASE_URL',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'WEBHOOK_SECRET_TOKEN',
    'CRON_SECRET',
    'SUPER_ADMIN_TG_IDS',
  ];

  const missing = requiredRuntimeKeys.filter((key) => !String(merged[key] || '').trim());
  assert.equal(missing.length, 0, `prod-like local env is missing: ${missing.join(', ')}`);

  const truthy = (v) => ['1', 'true', 'yes', 'y', 'on'].includes(String(v || '').trim().toLowerCase());
  assert.ok(!truthy(merged.PAYMENTS_FALLBACK_ALLOW_UNSIGNED), 'prod-like local env must not enable PAYMENTS_FALLBACK_ALLOW_UNSIGNED');
  assert.ok(!truthy(merged.PAYMENTS_FALLBACK_APPLY_ENABLED), 'prod-like local env must not enable PAYMENTS_FALLBACK_APPLY_ENABLED by default');

  if (truthy(merged.OFFICIAL_PUBLISH_ENABLED)) {
    assert.ok(String(merged.OFFICIAL_CHANNEL_ID || '').trim(), 'prod-like local env with OFFICIAL_PUBLISH_ENABLED=true must set OFFICIAL_CHANNEL_ID');
  }
}

console.log('smoke-env-baseline-contract: OK');
