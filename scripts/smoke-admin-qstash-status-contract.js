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

const renderAdminQStashStatusSrc = extractBetween(
  botSource,
  'async function renderAdminQStashStatus(ctx) {',
  '\n\nasync function renderAdminDmTemplates(ctx, page = 0) {'
);

const adminQStashCallbacksSrc = extractBetween(
  botSource,
  '    // Admin: QStash status / signed ping (Redis-only metrics)',
  '\n\n    // Admin: Founder Sale (runtime controls in Redis)'
);

assert.ok(renderAdminQStashStatusSrc.includes('const fanout = await getSysBool(SYS_KEYS.broadcast_qstash_fanout, false);'), 'Admin → QStash status must keep broadcast fan-out sys toggle read');
assert.ok(renderAdminQStashStatusSrc.includes('const lib = getQStashLibHealth();'), 'Admin → QStash status must keep QStash lib health read');
assert.ok(renderAdminQStashStatusSrc.includes("const envTokenOk = !!(process.env.QSTASH_TOKEN || '');"), 'Admin → QStash status must keep token env line');
assert.ok(renderAdminQStashStatusSrc.includes("const envSignOk = !!(process.env.QSTASH_CURRENT_SIGNING_KEY || '');"), 'Admin → QStash status must keep signing env line');
assert.ok(renderAdminQStashStatusSrc.includes("const envBaseOk = !!(CFG.PUBLIC_BASE_URL || '');"), 'Admin → QStash status must keep base_url env line');
assert.ok(renderAdminQStashStatusSrc.includes("let text = `🛰 <b>QStash — статус</b>\n\n`;"), 'Admin → QStash status must keep stable title');
assert.ok(renderAdminQStashStatusSrc.includes("text += `Lib (@upstash/qstash): <b>${lib.available ? 'OK' : 'MISSING'}</b>\n`;"), 'Admin → QStash status must keep lib line');
assert.ok(renderAdminQStashStatusSrc.includes("text += `ENV: token <b>${envTokenOk ? 'OK' : 'MISS'}</b> · signing <b>${envSignOk ? 'OK' : 'MISS'}</b> · base_url <b>${envBaseOk ? 'OK' : 'MISS'}</b>\n\n`;"), 'Admin → QStash status must keep ENV status line');
assert.ok(renderAdminQStashStatusSrc.includes("text += `Fan-out (Redis): <b>${fanout ? 'ON' : 'OFF'}</b>\n`;"), 'Admin → QStash status must keep fan-out line');
assert.ok(renderAdminQStashStatusSrc.includes("text += `Broadcast tick last_run: ${tickTs ? fmtAgo(tickTs) : '—'}${tickMode ? `\n• mode: <b>${escapeHtml(String(tickMode))}</b>` : ''}\n\n`;"), 'Admin → QStash status must keep broadcast tick line');
assert.ok(renderAdminQStashStatusSrc.includes("text += `Worker last delivery: ${lastDeliveryAt ? fmtAgo(lastDeliveryAt) : '—'}\n`;"), 'Admin → QStash status must keep delivery line');
assert.ok(renderAdminQStashStatusSrc.includes("text += `Ping received: ${lastPingAt ? fmtAgo(lastPingAt) : '—'}\n`;"), 'Admin → QStash status must keep ping received line');
assert.ok(renderAdminQStashStatusSrc.includes("if (lastPingEnqNonce) text += `• ping status: <b>${pingOk}</b>\n`;"), 'Admin → QStash status must keep ping status line');
assert.ok(renderAdminQStashStatusSrc.includes("text += `\nBroadcast cooldown: <b>${cdActive ? 'ACTIVE' : 'OFF'}</b>`;"), 'Admin → QStash status must keep cooldown line');
assert.ok(renderAdminQStashStatusSrc.includes("if (cooldownBid) text += `• broadcast_id: <code>${cooldownBid}</code>\n`;"), 'Admin → QStash status must keep cooldown broadcast_id line');
assert.ok(renderAdminQStashStatusSrc.includes("if (cooldownLast429At) text += `• last_429_at: ${fmtAgo(cooldownLast429At)}\n`;"), 'Admin → QStash status must keep cooldown last_429_at line');
assert.ok(renderAdminQStashStatusSrc.includes("if (cooldownReason) text += `• reason: <code>${escapeHtml(String(cooldownReason))}</code>\n`;"), 'Admin → QStash status must keep cooldown reason line');
assertMatch(
  renderAdminQStashStatusSrc,
  /const kb = new InlineKeyboard\([\s\S]*?\.text\('🧪 Send signed ping', 'a:admin_qstash_ping'\)\s*\.row\(\)\s*\.text\(`📣 Fan-out: \$\{fanout \? 'ON' : 'OFF'\}`, 'a:admin_bc_qstash_toggle'\)\s*\.text\('⬅️ Система', 'a:admin_sys'\)\s*\.row\(\)\s*\.text\('📋 Меню', 'a:menu'\)\s*\.text\('🏠 Home', 'a:home'\);/s,
  'Admin → QStash status keyboard/footer must keep ping, fan-out toggle, System/Menu/Home'
);

assert.ok(adminQStashCallbacksSrc.includes("if (p.a === 'a:admin_qstash_status') {"), 'Admin → QStash status open callback must exist');
assert.ok(adminQStashCallbacksSrc.includes("if (p.a === 'a:admin_qstash_ping') {"), 'Admin → QStash status ping callback must exist');
assertMatch(
  adminQStashCallbacksSrc,
  /if \(p\.a === 'a:admin_qstash_status'\) \{[\s\S]*?const isAdmin = isSuperAdminTg\(ctx\.from\.id\);[\s\S]*?if \(!isAdmin\) return ctx\.answerCallbackQuery\(\{ text: 'Нет доступа\.' \}\);[\s\S]*?await ctx\.answerCallbackQuery\(\);[\s\S]*?await renderAdminQStashStatus\(ctx\);[\s\S]*?return;[\s\S]*?\}/s,
  'Admin → QStash status open callback must keep admin gate and rerender'
);
assertMatch(
  adminQStashCallbacksSrc,
  /if \(p\.a === 'a:admin_qstash_ping'\) \{[\s\S]*?const isAdmin = isSuperAdminTg\(ctx\.from\.id\);[\s\S]*?if \(!isAdmin\) return ctx\.answerCallbackQuery\(\{ text: 'Нет доступа\.' \}\);[\s\S]*?await ctx\.answerCallbackQuery\(\{ text: 'Пинг отправляю…' \}\);/s,
  'Admin → QStash ping callback must keep admin gate and initial toast'
);
assert.ok(adminQStashCallbacksSrc.includes('`⛔ QStash недоступен: пакет <code>@upstash/qstash</code> не установлен.'), 'Admin → QStash ping callback must keep lib-missing screen');
assert.ok(adminQStashCallbacksSrc.includes("'⛔ QSTASH_TOKEN не задан в Vercel. Ping недоступен.'"), 'Admin → QStash ping callback must keep missing-token screen');
assert.ok(adminQStashCallbacksSrc.includes("'⛔ PUBLIC_BASE_URL не задан. Ping недоступен.'"), 'Admin → QStash ping callback must keep missing-base-url screen');
assert.ok(adminQStashCallbacksSrc.includes("await redis.set(k(['qstash', 'ping', 'last_enqueued_at']), nowIso, { ex: 14 * 24 * 60 * 60 });"), 'Admin → QStash ping callback must keep last_enqueued_at breadcrumb');
assert.ok(adminQStashCallbacksSrc.includes("await redis.set(k(['qstash', 'ping', 'last_enqueued_nonce']), String(nonce), { ex: 14 * 24 * 60 * 60 });"), 'Admin → QStash ping callback must keep last_enqueued_nonce breadcrumb');
assertMatch(
  adminQStashCallbacksSrc,
  /await qstashPublishJSON\(\{[\s\S]*?url,[\s\S]*?body: \{[\s\S]*?kind: 'signed_ping',[\s\S]*?ts: nowIso,[\s\S]*?nonce,[\s\S]*?by_tg_id: Number\(ctx\.from\.id \|\| 0\) \|\| 0,[\s\S]*?\},[\s\S]*?deduplicationId: `qping:\$\{nonce\}`,[\s\S]*?retries: 0,[\s\S]*?timeout: '10s',[\s\S]*?\}\);/s,
  'Admin → QStash ping callback must keep signed_ping publish payload, dedup, retries=0, timeout=10s'
);
assert.ok(adminQStashCallbacksSrc.includes('`⛔ Не удалось отправить ping через QStash.'), 'Admin → QStash ping callback must keep publish-failed screen');
assert.ok(adminQStashCallbacksSrc.includes('Подсказка: это не всегда ENV/signing keys.'), 'Admin → QStash ping callback must keep non-misleading helper hint');
assert.ok(adminQStashCallbacksSrc.includes('await renderAdminQStashStatus(ctx);'), 'Admin → QStash ping callback must rerender status after successful publish');
assertMatch(
  adminQStashCallbacksSrc,
  /reply_markup: new InlineKeyboard\(\)\.text\('⬅️ Назад', 'a:admin_qstash_status'\)/s,
  'Admin → QStash ping helper screens must keep Back → a:admin_qstash_status navigation'
);

expectRegistry('a:admin_qstash_status', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_qstash_ping', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_bc_qstash_toggle', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_sys', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:menu', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:home', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });

console.log('✅ smoke admin-qstash-status contract OK');
