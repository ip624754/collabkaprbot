#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAdminOpsText } from '../src/bot/adminOpsText.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function assertIncludes(haystack, needle, msg) {
  assert.ok(String(haystack).includes(needle), msg || `expected output to include: ${needle}`);
}

function extractRenderAdminOpsSource(src) {
  const marker = "async function renderAdminOps(ctx, { banner = '' } = {}) {";
  const start = src.indexOf(marker);
  assert.ok(start >= 0, 'renderAdminOps() marker not found');
  const tail = src.slice(start, start + 3500);
  return tail;
}

function run() {
  const okText = buildAdminOpsText({
    banner: 'READY',
    redisState: { configured: true, ok: true, latencyMs: 17 },
    paymentsState: {
      hmacKey: 'x'.repeat(40),
      fallbackState: { effective: false, envEnabled: false, runtimeEnabled: false },
    },
    opsState: {
      items: [
        {
          kind: 'broadcast_tick_deferred_redis',
          count: 2,
          lastAt: '2026-03-07T17:41:00.000Z',
          lastWhere: 'cron.broadcastTick',
        },
      ],
    },
    pendingSnapshot: {
      visible: true,
      ok: true,
      snap: { ts: '2026-03-07T17:42:55.000Z', broadcast_id: 42, pending_count: 3 },
    },
  });

  assertIncludes(okText, 'READY', 'banner must be rendered');
  assertIncludes(okText, '✅ <b>Redis OK</b> (17ms)', 'redis OK status must be rendered');
  assertIncludes(okText, '⚠️ <b>Broadcast: tick deferred (Redis)</b>', 'ops metric block must be rendered');
  assertIncludes(okText, '📦 <b>Broadcast pending snapshot</b>', 'pending snapshot block must be rendered');
  assertIncludes(okText, '• broadcast: <b>#42</b>; pending: <b>3</b>;', 'pending snapshot values must be rendered');

  const degradedText = buildAdminOpsText({
    redisState: { configured: true, ok: false, error: 'simulated redis timeout' },
    paymentsState: {
      hmacKey: '',
      fallbackState: {
        effective: true,
        envEnabled: false,
        runtimeEnabled: true,
        runtime: {
          byTgId: 123,
          reason: 'incident tail cleanup',
          at: '2026-03-07T17:00:00.000Z',
          expAt: '2026-03-07T18:00:00.000Z',
        },
      },
    },
    pendingSnapshot: { visible: true, ok: false },
  });

  assertIncludes(degradedText, '⚠️ <b>Redis degraded</b>', 'redis degraded banner must be rendered');
  assertIncludes(degradedText, 'simulated redis timeout', 'redis error tail must be rendered');
  assertIncludes(degradedText, '🚨 <b>Payments: HMAC key отсутствует</b>', 'payments HMAC warning must be rendered');
  assertIncludes(degradedText, '🚨 <b>Payments: fallback apply ENABLED</b>', 'payments fallback banner must be rendered');
  assertIncludes(degradedText, '• ⚠️ недоступно (Redis degraded)', 'degraded pending snapshot must stay graceful');

  const probeFailText = buildAdminOpsText({
    redisState: { configured: true, ok: false, probeFailed: true },
    paymentsState: { hmacKey: 'x'.repeat(40), fallbackState: { effective: false } },
  });
  assertIncludes(probeFailText, 'не удалось выполнить probe', 'probe failure fallback text must be rendered');

  const botSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'bot.js'), 'utf8');
  const renderAdminOpsSrc = extractRenderAdminOpsSource(botSource);
  assert.ok(/let r = null;\s*let key = null;/.test(renderAdminOpsSrc), 'renderAdminOps must keep r/key in function scope');
  assert.ok(/if \(r && key\) \{[\s\S]{0,1200}?pendingSnapshot = \{ visible: true \};/s.test(botSource), 'pending snapshot branch must stay guarded by r/key');
  assert.ok(/const text = buildAdminOpsText\(/.test(botSource), 'renderAdminOps must use buildAdminOpsText()');

  console.log('✅ smoke admin-ops render OK');
}

run();
