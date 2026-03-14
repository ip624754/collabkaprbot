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

const renderAdminPaymentsFallbackSrc = extractBetween(
  botSource,
  'async function renderAdminPaymentsFallback(ctx, toast = \'\') {',
  '\n\n// =====================================================\n// Admin tool: Broadcast hard-skip list'
);

const paymentsFallbackCallbacksSrc = extractBetween(
  botSource,
  '    // Admin: Payments fallback apply (runtime TTL override)',
  "\n\n    if (p.a === 'a:admin_matchfeat_auto_toggle') {"
);

assert.ok(renderAdminPaymentsFallbackSrc.includes('const st = await getPaymentsFallbackApplyState();'), 'Admin → Payments Fallback must read fallback apply state');
assert.ok(renderAdminPaymentsFallbackSrc.includes('const guard = getPaymentsFallbackGuardrailConfig();'), 'Admin → Payments Fallback must read guardrail config');
assert.ok(renderAdminPaymentsFallbackSrc.includes('const envOn = !!st.envEnabled;'), 'Admin → Payments Fallback must keep ENV state');
assert.ok(renderAdminPaymentsFallbackSrc.includes('const rtOn = !!st.runtimeEnabled;'), 'Admin → Payments Fallback must keep runtime state');
assert.ok(renderAdminPaymentsFallbackSrc.includes('const eff = !!st.effective;'), 'Admin → Payments Fallback must keep effective state');
assert.ok(renderAdminPaymentsFallbackSrc.includes("let text = `🧯 <b>Payments fallback apply</b>\\n\\n`;"), 'Admin → Payments Fallback must keep stable title');
assert.ok(renderAdminPaymentsFallbackSrc.includes("if (toast) text += `<b>${escapeHtml(String(toast))}</b>\\n\\n`;"), 'Admin → Payments Fallback must keep toast slot');
assert.ok(renderAdminPaymentsFallbackSrc.includes("text += `EFFECTIVE: <b>${eff ? 'ON' : 'OFF'}</b>\\n`;"), 'Admin → Payments Fallback must keep EFFECTIVE line');
assert.ok(renderAdminPaymentsFallbackSrc.includes("text += `ENV: <b>${envOn ? 'ON' : 'OFF'}</b>\\n`;"), 'Admin → Payments Fallback must keep ENV line');
assert.ok(renderAdminPaymentsFallbackSrc.includes("text += `RUNTIME: <b>${rtOn ? 'ON' : 'OFF'}</b>`;"), 'Admin → Payments Fallback must keep RUNTIME line');
assert.ok(renderAdminPaymentsFallbackSrc.includes("if (rtOn && leftSec !== null) text += ` (ещё ~${escapeHtml(fmtWait(leftSec))})`;"), 'Admin → Payments Fallback must keep runtime TTL hint');
assertMatch(
  renderAdminPaymentsFallbackSrc,
  /if \(rtOn && Number\.isFinite\(rt\.hoursActive\)\) text \+= `ACTIVE: <b>~\$\{escapeHtml\(String\(rt\.hoursActive\)\)\}h<\/b>\\n`;/,
  'Admin → Payments Fallback must show active hours'
);
assertMatch(
  renderAdminPaymentsFallbackSrc,
  /if \(rtOn\) text \+= `OPS REMINDER: каждые ~\$\{escapeHtml\(fmtWait\(Number\(guard\.alertRepeatSec \|\| 0\) \|\| 0\)\)\} пока runtime ON\\n`;/,
  'Admin → Payments Fallback must show ops reminder cadence'
);
assert.ok(renderAdminPaymentsFallbackSrc.includes('Когда включено: при успешном Stars-платеже, если Redis pay_* сессия истекла, бот может применить оплату по invoice payload (строго по правилам безопасности).'), 'Admin → Payments Fallback must keep incident explanation');
assert.ok(renderAdminPaymentsFallbackSrc.includes('Рекомендация: держать <b>OFF</b> и включать <b>временно</b> только при инциденте. Runtime всегда bounded TTL и не должен жить дольше <b>${escapeHtml(fmtWait(Number(guard.maxTtlSec || 0) || 0))}</b>.'), 'Admin → Payments Fallback must keep bounded-TTL recommendation');
assert.ok(renderAdminPaymentsFallbackSrc.includes("const by = rt.byUser ? String(rt.byUser) : (rt.byTgId ? `tg:${rt.byTgId}` : '—');"), 'Admin → Payments Fallback must keep enabled-by summary');
assert.ok(renderAdminPaymentsFallbackSrc.includes("text += `Enabled by: <b>${escapeHtml(by)}</b>\\n`;"), 'Admin → Payments Fallback must keep Enabled by line');
assert.ok(renderAdminPaymentsFallbackSrc.includes("text += `At: <code>${escapeHtml(at)}</code>\\n`;"), 'Admin → Payments Fallback must keep At line');
assert.ok(renderAdminPaymentsFallbackSrc.includes("text += `Until: <code>${escapeHtml(exp)}</code>\\n`;"), 'Admin → Payments Fallback must keep Until line');
assert.ok(renderAdminPaymentsFallbackSrc.includes("text += `Reason: <b>${escapeHtml(reason)}</b>\\n`;"), 'Admin → Payments Fallback must keep Reason line');
assertMatch(
  renderAdminPaymentsFallbackSrc,
  /const kb = new InlineKeyboard\([\s\S]*?kb\.text\('🟢 2h \(incident\)', 'a:admin_pay_fb_set\|ttl:7200\|r:incident'\)\s*\.text\('🟢 12h \(backlog\)', 'a:admin_pay_fb_set\|ttl:43200\|r:backlog'\)\s*\.row\(\)\s*\.text\('🟢 24h \(migration\)', 'a:admin_pay_fb_set\|ttl:86400\|r:migration'\);/s,
  'Admin → Payments Fallback must keep 2h/12h/24h enable presets'
);
assert.ok(renderAdminPaymentsFallbackSrc.includes("if (rtOn) kb.text('🧹 Disable', 'a:admin_pay_fb_off');"), 'Admin → Payments Fallback must keep conditional disable button');
assertMatch(
  renderAdminPaymentsFallbackSrc,
  /kb\.row\(\)\s*\.text\('⬅️ Система', 'a:admin_sys'\)\s*\.row\(\)\s*\.text\('⬅️ Админка', 'a:admin_home'\)\s*\.row\(\)\s*\.text\('📋 Меню', 'a:menu'\)\s*\.text\('🏠 Home', 'a:home'\);/s,
  'Admin → Payments Fallback footer must keep System/Admin/Menu/Home navigation'
);

assert.ok(paymentsFallbackCallbacksSrc.includes("if (p.a === 'a:admin_pay_fb') {"), 'Admin → Payments Fallback open callback must exist');
assert.ok(paymentsFallbackCallbacksSrc.includes("if (p.a === 'a:admin_pay_fb_set') {"), 'Admin → Payments Fallback set callback must exist');
assert.ok(paymentsFallbackCallbacksSrc.includes("if (p.a === 'a:admin_pay_fb_off') {"), 'Admin → Payments Fallback off callback must exist');
assertMatch(
  paymentsFallbackCallbacksSrc,
  /if \(p\.a === 'a:admin_pay_fb'\) \{[\s\S]*?const isAdmin = isSuperAdminTg\(ctx\.from\.id\);[\s\S]*?if \(!isAdmin\) return ctx\.answerCallbackQuery\(\{ text: 'Нет доступа\.' \}\);[\s\S]*?await ctx\.answerCallbackQuery\(\);[\s\S]*?await renderAdminPaymentsFallback\(ctx\);[\s\S]*?return;[\s\S]*?\}/s,
  'Admin → Payments Fallback open callback must keep admin gate and render helper'
);
assertMatch(
  paymentsFallbackCallbacksSrc,
  /if \(p\.a === 'a:admin_pay_fb_set'\) \{[\s\S]*?await ctx\.answerCallbackQuery\(\{ text: '⏳ Ставлю…' \}\);[\s\S]*?const ttl = Number\(p\.ttl \|\| 0\) \|\| 0;[\s\S]*?const reason = String\(p\.r \|\| ''\)\.slice\(0, 40\) \|\| 'incident';[\s\S]*?const byUser = ctx\.from\?\.username \? `@\$\{ctx\.from\.username\}` : null;[\s\S]*?const r = await setPaymentsFallbackRuntime\(\{ enabled: true, ttlSec: ttl, byTgId: Number\(ctx\.from\.id \|\| 0\) \|\| null, byUser, reason \}\);[\s\S]*?if \(!r\.ok\) \{[\s\S]*?await renderAdminPaymentsFallback\(ctx, '⚠️ Redis недоступен — не удалось включить\.'\);[\s\S]*?\}[\s\S]*?await renderAdminPaymentsFallback\(ctx, `✅ Включено на ~\$\{fmtWait\(Number\(r\.ttlSec \|\| ttl\) \|\| ttl\)\}\.`\);[\s\S]*?return;[\s\S]*?\}/s,
  'Admin → Payments Fallback set callback must keep TTL presets, runtime helper call, and success/failure render'
);
assertMatch(
  paymentsFallbackCallbacksSrc,
  /if \(p\.a === 'a:admin_pay_fb_off'\) \{[\s\S]*?await ctx\.answerCallbackQuery\(\{ text: '⏳ Выключаю…' \}\);[\s\S]*?const r = await setPaymentsFallbackRuntime\(\{ enabled: false \}\);[\s\S]*?if \(!r\.ok && r\.error\) \{[\s\S]*?await renderAdminPaymentsFallback\(ctx, '⚠️ Redis недоступен — не удалось выключить\.'\);[\s\S]*?\}[\s\S]*?await renderAdminPaymentsFallback\(ctx, '🧹 Выключено\.'\);[\s\S]*?return;[\s\S]*?\}/s,
  'Admin → Payments Fallback off callback must keep runtime disable helper and success/failure render'
);

expectRegistry('a:admin_pay_fb', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_pay_fb_set', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_pay_fb_off', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_sys', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_home', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:menu', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:home', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });

console.log('✅ smoke admin-payments-fallback contract OK');
