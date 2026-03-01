import { CFG } from '../lib/config.js';
import * as db from '../db/queries.js';

function safeUpper(s) {
  return String(s || '').trim().toUpperCase();
}

function safeLower(s) {
  return String(s || '').trim().toLowerCase();
}

function parseProPayload(payload) {
  // New format: pro_<wsId>_<userId>_<token>
  // Old format: pro_<wsId>_<token>
  const parts = String(payload || '').split('_');
  const wsId = Number(parts[1] || 0);
  let payUserId = 0;
  if (parts.length >= 4 && /^\d+$/.test(String(parts[2] || ''))) {
    payUserId = Number(parts[2] || 0);
  }
  return { wsId, payUserId };
}

function parseBrandTopupPayload(payload) {
  // brand_<userId>_<S|M|L>_<token>
  const parts = String(payload || '').split('_');
  const userId = Number(parts[1] || 0);
  const packIdRaw = String(parts[2] || '').trim();
  const packId = safeUpper(packIdRaw);
  return { userId, packId, packIdRaw };
}

function parseBrandPlanPayload(payload) {
  // bplan_<userId>_<start|pro>_<token>
  const parts = String(payload || '').split('_');
  const userId = Number(parts[1] || 0);
  const planRaw = String(parts[2] || 'start');
  const plan = safeLower(planRaw);
  return { userId, plan };
}

function parseFounderPayload(payload) {
  // founder_brand_3m_<userId>_<token>
  const parts = String(payload || '').split('_');
  const productId = parts.slice(0, 3).join('_');
  const userId = Number(parts[3] || 0);
  return { productId, userId };
}

function brandPackCredits(packId, packIdRaw = '') {
  const id = safeUpper(packId);
  if (id === 'S') return Number(CFG.BRAND_TOPUP_S_CREDITS || 0);
  if (id === 'M') return Number(CFG.BRAND_TOPUP_M_CREDITS || 0);
  if (id === 'L') return Number(CFG.BRAND_TOPUP_L_CREDITS || 0);

  // Legacy: numeric credits in payload — only accept known catalog values
  if (/^\d+$/.test(String(packIdRaw || ''))) {
    const n = Number(packIdRaw);
    if (Number(CFG.BRAND_TOPUP_S_CREDITS || 0) === n) return n;
    if (Number(CFG.BRAND_TOPUP_M_CREDITS || 0) === n) return n;
    if (Number(CFG.BRAND_TOPUP_L_CREDITS || 0) === n) return n;
    // Unknown numeric pack → reject (strict catalog-only).
    return 0;
  }

  return 0;
}

function brandPackStars(packId, packIdRaw = '') {
  const id = safeUpper(packId);
  if (id === 'S') return Number(CFG.BRAND_TOPUP_S_PRICE || 0);
  if (id === 'M') return Number(CFG.BRAND_TOPUP_M_PRICE || 0);
  if (id === 'L') return Number(CFG.BRAND_TOPUP_L_PRICE || 0);

  // Legacy numeric credits: map back to known pack price when possible.
  if (/^\d+$/.test(String(packIdRaw || ''))) {
    const credits = Number(packIdRaw);
    if (Number(CFG.BRAND_TOPUP_S_CREDITS || 0) === credits) return Number(CFG.BRAND_TOPUP_S_PRICE || 0);
    if (Number(CFG.BRAND_TOPUP_M_CREDITS || 0) === credits) return Number(CFG.BRAND_TOPUP_M_PRICE || 0);
    if (Number(CFG.BRAND_TOPUP_L_CREDITS || 0) === credits) return Number(CFG.BRAND_TOPUP_L_PRICE || 0);
  }

  return 0;
}

function brandPlanStars(plan) {
  const p = safeLower(plan);
  if (p === 'start' || p === 'basic') return Number(CFG.BRAND_PLAN_START_PRICE || 0);
  if (p === 'pro' || p === 'max') return Number(CFG.BRAND_PLAN_PRO_PRICE || 0);
  return 0;
}

function founderStars(productId) {
  const pid = String(productId || '');
  if (pid === 'founder_brand_3m') return Number(CFG.FOUNDER_BRAND_3M_PRICE || 0);
  if (pid === 'founder_brand_12m') return Number(CFG.FOUNDER_BRAND_12M_PRICE || 0);
  return 0;
}

function isStarsPaymentAmountValid(expected, totalAmount, currency = 'XTR') {
  const cur = safeUpper(currency || 'XTR');
  if (cur !== 'XTR') return false;
  const paid = Number(totalAmount || 0);
  const exp = Number(expected || 0);
  if (!exp || exp <= 0) return false;
  if (!paid || paid <= 0) return false;
  return Number(paid) === Number(exp);
}

function brandPlanCredits(plan) {
  const p = safeLower(plan);
  if (p === 'start' || p === 'basic') return Number(CFG.BRAND_PLAN_START_CREDITS || 0);
  if (p === 'pro' || p === 'max') return Number(CFG.BRAND_PLAN_PRO_CREDITS || 0);
  return 0;
}

function normalizeBrandPlanId(plan) {
  const p = safeLower(plan);
  if (p === 'basic') return 'start';
  if (p === 'max') return 'pro';
  if (p === 'start' || p === 'pro') return p;
  return 'start';
}

function founderBrandCredits(productId) {
  const pid = String(productId || '');
  if (pid === 'founder_brand_3m') return Number(CFG.FOUNDER_BRAND_3M_CREDITS || 0);
  if (pid === 'founder_brand_12m') return Number(CFG.FOUNDER_BRAND_12M_CREDITS || 0);
  return 0;
}

function founderBrandDurationDays(productId) {
  const pid = String(productId || '');
  if (pid === 'founder_brand_3m') return 90;
  if (pid === 'founder_brand_12m') return 365;
  return 0;
}

/**
 * Best-effort fallback apply when Redis pay_* session is missing/expired.
 * Safe rules:
 * - apply only when payload contains explicit payer userId, and it matches payment.user_id
 * - verify workspace ownership for PRO
 * - never auto-apply offpub (manual by design)
 */
export async function applyPaymentFallbackNoSession({
  paymentId,
  paymentUserId,
  invoicePayload,
  appliedByUserId,
  totalAmount = 0,
  currency = 'XTR',
  telegramPaymentChargeId = '',
}) {
  const payload = String(invoicePayload || '');
  if (!paymentId || !paymentUserId || !payload) return { applied: false, reason: 'bad_input' };

  // PRO
  if (payload.startsWith('pro_')) {
    const { wsId, payUserId } = parseProPayload(payload);
    if (!wsId || !payUserId) return { applied: false, reason: 'missing_userid_or_wsid' };
    if (Number(payUserId) !== Number(paymentUserId)) return { applied: false, reason: 'user_mismatch' };

    if (!isStarsPaymentAmountValid(Number(CFG.PRO_STARS_PRICE || 0), totalAmount, currency)) {
      return { applied: false, reason: 'amount_mismatch' };
    }

    const ws = await db.getWorkspace(paymentUserId, wsId);
    if (!ws) return { applied: false, reason: 'no_ws_access' };

    await db.activateWorkspacePro(wsId, CFG.PRO_DURATION_DAYS);
    try {
      await db.auditWorkspace(wsId, appliedByUserId || paymentUserId, 'pro.activated.fallback', {
        payment_id: paymentId,
        total_amount: Number(totalAmount || 0),
        currency: String(currency || 'XTR'),
        telegram_payment_charge_id: telegramPaymentChargeId,
      });
    } catch {}

    await db.markPaymentApplied(paymentId, appliedByUserId || paymentUserId, 'fallback_apply_pro_no_session');
    return { applied: true, kind: 'pro', wsId };
  }

  // Brand credits top-up
  if (payload.startsWith('brand_')) {
    const { userId, packId, packIdRaw } = parseBrandTopupPayload(payload);
    if (!userId) return { applied: false, reason: 'missing_userid' };
    if (Number(userId) !== Number(paymentUserId)) return { applied: false, reason: 'user_mismatch' };

    const expectedStars = brandPackStars(packId, packIdRaw);
    if (!isStarsPaymentAmountValid(expectedStars, totalAmount, currency)) {
      return { applied: false, reason: 'amount_mismatch' };
    }

    const credits = brandPackCredits(packId, packIdRaw);
    if (!credits || credits <= 0) return { applied: false, reason: 'bad_pack' };

    await db.addBrandCredits(paymentUserId, credits);
    await db.markPaymentApplied(paymentId, appliedByUserId || paymentUserId, `fallback_apply_brand_pass_no_session:+${credits}`);
    return { applied: true, kind: 'brand_pass', credits };
  }

  // Brand Plan subscription
  if (payload.startsWith('bplan_')) {
    const { userId, plan } = parseBrandPlanPayload(payload);
    if (!userId) return { applied: false, reason: 'missing_userid' };
    if (Number(userId) !== Number(paymentUserId)) return { applied: false, reason: 'user_mismatch' };

    const planId = normalizeBrandPlanId(plan);
    const expectedStars = brandPlanStars(planId);
    if (!isStarsPaymentAmountValid(expectedStars, totalAmount, currency)) {
      return { applied: false, reason: 'amount_mismatch' };
    }

    await db.activateBrandPlan(paymentUserId, planId, CFG.BRAND_PLAN_DURATION_DAYS);

    const credits = brandPlanCredits(planId);
    if (credits > 0) await db.addBrandCredits(paymentUserId, credits);

    await db.markPaymentApplied(paymentId, appliedByUserId || paymentUserId, `fallback_apply_brand_plan_no_session:${planId}${credits ? `:+${credits}cr` : ''}`);
    return { applied: true, kind: 'brand_plan', plan: planId, credits };
  }

  // Founder Sale (brand only — creator requires wsId stored in session)
  if (payload.startsWith('founder_')) {
    const { productId, userId } = parseFounderPayload(payload);
    if (!userId) return { applied: false, reason: 'missing_userid' };
    if (Number(userId) !== Number(paymentUserId)) return { applied: false, reason: 'user_mismatch' };

    const expectedStars = founderStars(productId);
    if (!isStarsPaymentAmountValid(expectedStars, totalAmount, currency)) {
      return { applied: false, reason: 'amount_mismatch' };
    }

    if (productId !== 'founder_brand_3m' && productId !== 'founder_brand_12m') {
      return { applied: false, reason: 'unsupported_founder_product' };
    }

    const days = founderBrandDurationDays(productId);
    if (!days) return { applied: false, reason: 'bad_duration' };

    await db.activateBrandPlan(paymentUserId, 'pro', days);
    const credits = founderBrandCredits(productId);
    if (credits > 0) await db.addBrandCredits(paymentUserId, credits);

    await db.markPaymentApplied(paymentId, appliedByUserId || paymentUserId, `fallback_apply_founder_brand_no_session:${productId}${credits ? `:+${credits}cr` : ''}`);
    return { applied: true, kind: 'founder_brand', productId, days, credits };
  }

  return { applied: false, reason: 'unsupported_payload' };
}
