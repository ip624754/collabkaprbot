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

const paymentsCallbacksSrc = extractBetween(
  botSource,
  "    if (p.a === 'a:admin_payments') {",
  "\n\n    if (p.a === 'a:mod_home') {"
);

const renderAdminPaymentsSrc = extractBetween(
  botSource,
  'async function renderAdminPayments(ctx, statusRaw = \'ORPHANED\', page = 0) {',
  '\n\nasync function renderAdminPaymentView(ctx, paymentId, backStatus = \'ORPHANED\', page = 0) {'
);

const renderAdminPaymentViewSrc = extractBetween(
  botSource,
  'async function renderAdminPaymentView(ctx, paymentId, backStatus = \'ORPHANED\', page = 0) {',
  '\n\nasync function adminApplyPayment(ctx, adminUserRow, paymentId, backStatus = \'ORPHANED\', page = 0) {'
);

const adminApplyPaymentSrc = extractBetween(
  botSource,
  'async function adminApplyPayment(ctx, adminUserRow, paymentId, backStatus = \'ORPHANED\', page = 0) {',
  '\n\n\nasync function adminAutoHealPayments(ctx, adminUserRow, backStatus = \'ORPHANED\', page = 0) {'
);

const adminAutoHealPaymentsSrc = extractBetween(
  botSource,
  'async function adminAutoHealPayments(ctx, adminUserRow, backStatus = \'ORPHANED\', page = 0) {',
  '\n\n// -----------------------------\n// Moderation render helpers (v1.0.0)'
);

assert.ok(renderAdminPaymentsSrc.includes("const status = String(statusRaw || 'ORPHANED').toUpperCase();"), 'Admin → Payments list must normalize status to uppercase');
assert.ok(renderAdminPaymentsSrc.includes('const fbOn = await isPaymentsFallbackApplyEnabled();'), 'Admin → Payments list must read fallback apply state');
assert.ok(renderAdminPaymentsSrc.includes(".join('\\n') || 'Платежей нет.';"), 'Admin → Payments list must keep empty-state text');
assertMatch(
  renderAdminPaymentsSrc,
  /if \(status === 'ORPHANED' && CFG\.PAYMENTS_ORPHANED_AUTOHEAL_ENABLED && fbOn\) \{[\s\S]*?kb\.text\('🔁 Auto-heal missing_session', `a:admin_pay_autoheal\|st:\$\{status\}\|p:\$\{Math\.max\(0, Number\(page\) \|\| 0\)\}`\)\.row\(\);[\s\S]*?\}/s,
  'Admin → Payments list must keep ORPHANED auto-heal action behind fallback/config gate'
);
assertMatch(
  renderAdminPaymentsSrc,
  /for \(const r of rows\) \{[\s\S]*?kb\.text\(`#\$\{r\.id\} • \$\{r\.kind\}`, `a:admin_pay_view\|id:\$\{r\.id\}\|st:\$\{status\}\|p:\$\{Math\.max\(0, Number\(page\) \|\| 0\)\}`\)\.row\(\);[\s\S]*?\}/s,
  'Admin → Payments list must keep per-payment view buttons'
);
assert.ok(renderAdminPaymentsSrc.includes("if ((Number(page) || 0) > 0) kb.text('⬅️ Назад', `a:admin_payments|st:${status}|p:${Number(page) - 1}`);"), 'Admin → Payments list must keep previous-page button');
assert.ok(renderAdminPaymentsSrc.includes("if (rows.length === limit) kb.text('➡️ Далее', `a:admin_payments|st:${status}|p:${Number(page) + 1}`);"), 'Admin → Payments list must keep next-page button');
assert.ok(renderAdminPaymentsSrc.includes("kb.row().text('⬅️ Операции', 'a:admin_ops');"), 'Admin → Payments list must keep back-to-Ops button');
assert.ok(renderAdminPaymentsSrc.includes('`💳 <b>Payments</b> • <b>${escapeHtml(status)}</b>'), 'Admin → Payments list must keep stable title');

assert.ok(renderAdminPaymentViewSrc.includes("await safeEditOrReply(ctx, '⚠️ Платеж не найден.'"), 'Admin → Payment view must keep missing-payment fallback');
assert.ok(renderAdminPaymentViewSrc.includes("const canApply = (p.status === 'ORPHANED' || p.status === 'ERROR' || p.status === 'RECEIVED') &&"), 'Admin → Payment view must keep manual-apply status gate');
assert.ok(renderAdminPaymentViewSrc.includes("payload.startsWith('pro_') || payload.startsWith('brand_') || payload.startsWith('bplan_') || payload.startsWith('offpub_')"), 'Admin → Payment view must keep payload-prefix allowlist for manual apply');
assert.ok(renderAdminPaymentViewSrc.includes("if (canApply) kb.text('✅ Apply (manual)', `a:admin_pay_apply|id:${p.id}|st:${backStatus}|p:${page}`).row();"), 'Admin → Payment view must keep manual apply button');
assert.ok(renderAdminPaymentViewSrc.includes("kb.text('⬅️ К списку', `a:admin_payments|st:${backStatus}|p:${page}`).row();"), 'Admin → Payment view must keep back-to-list button');
assert.ok(renderAdminPaymentViewSrc.includes("kb.text('⬅️ Операции', 'a:admin_ops');"), 'Admin → Payment view must keep back-to-Ops button');
assert.ok(renderAdminPaymentViewSrc.includes('`💳 <b>Payment #${p.id}</b>'), 'Admin → Payment view must keep title');
assert.ok(renderAdminPaymentViewSrc.includes('Status: <b>${escapeHtml(p.status)}</b>'), 'Admin → Payment view must keep status line');
assert.ok(renderAdminPaymentViewSrc.includes('Kind: <b>${escapeHtml(p.kind)}</b>'), 'Admin → Payment view must keep kind line');
assert.ok(renderAdminPaymentViewSrc.includes('User: <b>${escapeHtml(who)}</b>'), 'Admin → Payment view must keep user line');
assert.ok(renderAdminPaymentViewSrc.includes('Amount: <b>${p.total_amount} ${escapeHtml(p.currency)}</b>'), 'Admin → Payment view must keep amount line');
assert.ok(renderAdminPaymentViewSrc.includes('Created: <b>${escapeHtml(when)}</b>'), 'Admin → Payment view must keep created-at line');
assert.ok(renderAdminPaymentViewSrc.includes('Charge:'), 'Admin → Payment view must keep charge block');
assert.ok(renderAdminPaymentViewSrc.includes('Payload:'), 'Admin → Payment view must keep payload block');
assert.ok(renderAdminPaymentViewSrc.includes('Note:'), 'Admin → Payment view must keep note block');

assert.ok(adminApplyPaymentSrc.includes("await ctx.answerCallbackQuery({ text: 'Платеж не найден.', show_alert: true });"), 'Admin → Payments apply must keep missing-payment alert');
assert.ok(adminApplyPaymentSrc.includes("await ctx.answerCallbackQuery({ text: 'Уже применён ✅', show_alert: true });"), 'Admin → Payments apply must keep already-applied alert');
assert.ok(adminApplyPaymentSrc.includes('const v = await _validateStarsPaymentStrict({'), 'Admin → Payments apply must keep strict validation');
assert.ok(adminApplyPaymentSrc.includes("manual_apply_blocked:"), 'Admin → Payments apply must keep blocked-note prefix');
assert.ok(adminApplyPaymentSrc.includes("'⛔️ Apply заблокирован: счёт невалидный/не совпадает сумма.'"), 'Admin → Payments apply must keep invalid-invoice alert');
assert.ok(adminApplyPaymentSrc.includes("'⛔️ Apply заблокирован: ошибка валидации.'"), 'Admin → Payments apply must keep validation-exception alert');
assert.ok(adminApplyPaymentSrc.includes('const claimed = await db.claimPaymentApplying(row.id, adminUserRow.id);'), 'Admin → Payments apply must still claim DB fulfillment before apply');
assert.ok(adminApplyPaymentSrc.includes("'⏳ Платёж уже обрабатывается или применён.'"), 'Admin → Payments apply must keep already-processing alert');
assert.ok(adminApplyPaymentSrc.includes("'Эта услуга не поддерживает apply.'"), 'Admin → Payments apply must keep unsupported-payload alert');
assert.ok(adminApplyPaymentSrc.includes('manual_apply_error:'), 'Admin → Payments apply must keep error note prefix');
assert.ok(adminApplyPaymentSrc.includes('Ошибка apply:'), 'Admin → Payments apply must keep error alert text');

assert.ok(adminAutoHealPaymentsSrc.includes('const fbOn = await isPaymentsFallbackApplyEnabled();'), 'Admin → Payments auto-heal must keep fallback toggle check');
assert.ok(adminAutoHealPaymentsSrc.includes("'Auto-heal отключён (fallback apply OFF).'"), 'Admin → Payments auto-heal must keep disabled alert');
assert.ok(adminAutoHealPaymentsSrc.includes("const batch = Math.max(0, Number(CFG.PAYMENTS_ORPHANED_AUTOHEAL_BATCH || 20) || 0);"), 'Admin → Payments auto-heal must keep batch limit');
assert.ok(adminAutoHealPaymentsSrc.includes("'Auto-heal batch=0.'"), 'Admin → Payments auto-heal must keep batch=0 alert');
assert.ok(adminAutoHealPaymentsSrc.includes("const rows = await db.listPaymentsByStatus('ORPHANED', 50, 0);"), 'Admin → Payments auto-heal must only list ORPHANED payments');
assert.ok(adminAutoHealPaymentsSrc.includes("const miss = (rows || []).filter(r => String(r.note || '').includes('missing_session'));"), 'Admin → Payments auto-heal must keep missing_session filter');
assert.ok(adminAutoHealPaymentsSrc.includes('const claimed = await db.claimPaymentApplying(Number(r.id), adminUserRow?.id || Number(r.user_id));'), 'Admin → Payments auto-heal must claim DB fulfillment before fallback apply');
assert.ok(adminAutoHealPaymentsSrc.includes('const fb = await applyPaymentFallbackNoSession({'), 'Admin → Payments auto-heal must use fallback apply helper');
assert.ok(adminAutoHealPaymentsSrc.includes("msg = '✅ Оплата найдена и применена автоматически.';"), 'Admin → Payments auto-heal must keep user-notification text');
assert.ok(adminAutoHealPaymentsSrc.includes('autoheal_manual_required:'), 'Admin → Payments auto-heal must keep manual-required note prefix');
assert.ok(adminAutoHealPaymentsSrc.includes('Auto-heal: applied ${applied}, failed ${failed}, skipped ${skipped}, validation ${validationFailed}, manual ${manualRequired}'), 'Admin → Payments auto-heal must keep summary alert text');
assert.ok(adminAutoHealPaymentsSrc.includes('await renderAdminPayments(ctx, backStatus, page);'), 'Admin → Payments auto-heal must return to list render');

assert.ok(paymentsCallbacksSrc.includes("if (p.a === 'a:admin_payments') {"), 'Admin → Payments list callback must exist');
assert.ok(paymentsCallbacksSrc.includes("if (p.a === 'a:admin_pay_view') {"), 'Admin → Payments view callback must exist');
assert.ok(paymentsCallbacksSrc.includes("if (p.a === 'a:admin_pay_apply') {"), 'Admin → Payments apply callback must exist');
assert.ok(paymentsCallbacksSrc.includes("if (p.a === 'a:admin_pay_autoheal') {"), 'Admin → Payments auto-heal callback must exist');
assertMatch(
  paymentsCallbacksSrc,
  /if \(p\.a === 'a:admin_payments'\) \{[\s\S]*?try \{ await clearExpectText\(ctx\.from\.id\); \} catch \{\}[\s\S]*?await renderAdminPayments\(ctx, String\(p\.st \|\| 'ORPHANED'\), Number\(p\.p \|\| 0\)\);[\s\S]*?\}/s,
  'Admin → Payments list callback must clear expectText and rerender list'
);
assertMatch(
  paymentsCallbacksSrc,
  /if \(p\.a === 'a:admin_pay_view'\) \{[\s\S]*?try \{ await clearExpectText\(ctx\.from\.id\); \} catch \{\}[\s\S]*?await renderAdminPaymentView\(ctx, Number\(p\.id\), String\(p\.st \|\| 'ORPHANED'\), Number\(p\.p \|\| 0\)\);[\s\S]*?\}/s,
  'Admin → Payments view callback must clear expectText and rerender view'
);
assertMatch(
  paymentsCallbacksSrc,
  /if \(p\.a === 'a:admin_pay_apply'\) \{[\s\S]*?try \{ await clearExpectText\(ctx\.from\.id\); \} catch \{\}[\s\S]*?await adminApplyPayment\(ctx, u, Number\(p\.id\), String\(p\.st \|\| 'ORPHANED'\), Number\(p\.p \|\| 0\)\);[\s\S]*?\}/s,
  'Admin → Payments apply callback must clear expectText and call apply helper'
);
assertMatch(
  paymentsCallbacksSrc,
  /if \(p\.a === 'a:admin_pay_autoheal'\) \{[\s\S]*?try \{ await clearExpectText\(ctx\.from\.id\); \} catch \{\}[\s\S]*?await adminAutoHealPayments\(ctx, u, String\(p\.st \|\| 'ORPHANED'\), Number\(p\.p \|\| 0\)\);[\s\S]*?\}/s,
  'Admin → Payments auto-heal callback must clear expectText and call auto-heal helper'
);

expectRegistry('a:admin_payments', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS, breakGlass: true });
expectRegistry('a:admin_pay_view', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:admin_pay_apply', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.DB_TRUTH });
expectRegistry('a:admin_pay_autoheal', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.DB_TRUTH });
expectRegistry('a:admin_ops', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });

console.log('✅ smoke admin-payments contract OK');
