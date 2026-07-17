#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const botPath = path.join(ROOT, 'src', 'bot', 'bot.js');
const workerPath = path.join(ROOT, 'api', 'qstash', 'monetization-retry.js');
const botSrc = fs.readFileSync(botPath, 'utf8');
const workerSrc = fs.readFileSync(workerPath, 'utf8');

const acceptFnStart = botSrc.indexOf('async function acceptBrandApplication(');
const creatorListStart = botSrc.indexOf("async function renderCreatorApplications(");
assert.ok(acceptFnStart >= 0 && creatorListStart > acceptFnStart, 'Expected to locate acceptBrandApplication() source block');
const acceptFnSrc = botSrc.slice(acceptFnStart, creatorListStart);

assert.ok(
  botSrc.includes("function brandAppAcceptPendingKey(appId)"),
  'Expected brand_app_accept flow to keep a dedicated pending marker for queued completion checks'
);
assert.ok(
  acceptFnSrc.includes(".text('🔄 Проверить заявку', refreshCb)") &&
    acceptFnSrc.includes(".text('📨 Заявки', listCb)"),
  'Expected accept pending UX to keep the user on the same application / list flow instead of sending them into work tabs too early'
);
assert.ok(
  acceptFnSrc.includes("Кредит спишется, а заявка появится во вкладке «💬 В работе» только после завершения обработки.") &&
    acceptFnSrc.includes("Сейчас не нужно нажимать ✅ Принять повторно"),
  'Expected accept pending copy to explain completion semantics and prevent repeated accept clicks'
);
assert.ok(
  !acceptFnSrc.includes(".text('💬 В работе', inProgressCb)") &&
    !acceptFnSrc.includes(".text('📨 Открыть заявку', openAppCb)"),
  'Expected accept pending keyboard to remove misleading in-progress/open-app shortcuts before accept completion'
);
assert.ok(
  !acceptFnSrc.includes("lock_key: lockKey, lock_token: lock.token"),
  'Expected brand_app_accept to stop queue-first lock fanout and prefer sync completion before async fallback'
);
assert.ok(
  acceptFnSrc.includes("await clearAcceptPending();") &&
    workerSrc.includes("brandAppAcceptPendingKey(appId)") &&
    workerSrc.includes("await redis.del(pendingKey)"),
  'Expected queued accept pending marker to be cleared on terminal click/worker outcomes'
);

console.log('✅ smoke brand application accept completion contract OK');
