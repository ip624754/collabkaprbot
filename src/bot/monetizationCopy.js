const LABELS = Object.freeze({
  BRAND_PLAN: 'Brand Plan',
  BRAND_CREDITS: 'Кредиты',
  CREATOR_PRO: 'PRO канала',
  MATCHING: 'Умный подбор',
  FEATURED: 'Продвижение',
  FOUNDER_SALE: 'Founder Sale',
  OFFICIAL_PLACEMENT: 'Размещение в официальном канале',
});

export const MONETIZATION_LABELS = LABELS;

function pluralRu(value, one, few, many) {
  const n = Math.abs(Number(value) || 0);
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

export function brandPlanTierLabel(plan) {
  const id = String(plan || '').trim().toLowerCase();
  if (id === 'start' || id === 'basic') return 'Старт';
  if (id === 'pro' || id === 'max') return 'Про';
  return id || 'Старт';
}

export function starsAmountLabel(amount) {
  const value = Math.max(0, Number(amount) || 0);
  return `${value} Stars`;
}

export const STARS_INVOICE_TITLE_MAX = 32;
export const STARS_INVOICE_DESCRIPTION_MAX = 255;

export function paymentRecoveryBoundaryText() {
  return 'Платёж не применился: /paysupport. Автоматического возврата нет.';
}

export function buildStarsInvoiceTitle(title) {
  const chars = Array.from(String(title || '').trim());
  if (chars.length <= STARS_INVOICE_TITLE_MAX) return chars.join('');
  return `${chars.slice(0, STARS_INVOICE_TITLE_MAX - 1).join('')}…`;
}

export function buildStarsInvoiceDescription(description) {
  const tail = `\n\nОтмена: «📋 Меню».\n${paymentRecoveryBoundaryText()}`;
  const tailChars = Array.from(tail);
  const maxBaseChars = Math.max(0, STARS_INVOICE_DESCRIPTION_MAX - tailChars.length);
  const baseChars = Array.from(String(description || '').trim());
  const clippedBase = baseChars.length > maxBaseChars
    ? `${baseChars.slice(0, Math.max(0, maxBaseChars - 1)).join('')}…`
    : baseChars.join('');
  return `${clippedBase}${tail}`;
}

export function buildRecoveredPaymentMessage({ result, amount = 0 } = {}) {
  const r = result && typeof result === 'object' ? result : {};
  const lines = ['✅ Платёж применён после задержки.'];
  if (Number(amount) > 0) lines.push(`Списано: ${starsAmountLabel(amount)}.`);

  if (r.kind === 'brand_pass') {
    lines.push(`Начислено: ${Number(r.credits || 0)} ${pluralRu(r.credits, 'кредит', 'кредита', 'кредитов')}.`);
  } else if (r.kind === 'brand_plan') {
    lines.push(`${LABELS.BRAND_PLAN} «${brandPlanTierLabel(r.plan)}» активирован на ${Number(r.days || 0)} ${pluralRu(r.days, 'день', 'дня', 'дней')}.`);
    if (Number(r.credits || 0) > 0) lines.push(`Начислено: ${Number(r.credits)} ${pluralRu(r.credits, 'кредит', 'кредита', 'кредитов')}.`);
  } else if (r.kind === 'pro') {
    lines.push(`${LABELS.CREATOR_PRO} активирован на ${Number(r.days || 0)} ${pluralRu(r.days, 'день', 'дня', 'дней')}.`);
  } else if (r.kind === 'founder_brand') {
    lines.push(`${LABELS.FOUNDER_SALE}: ${LABELS.BRAND_PLAN} «Про» активирован на ${Number(r.days || 0)} ${pluralRu(r.days, 'день', 'дня', 'дней')}.`);
    if (Number(r.credits || 0) > 0) lines.push(`Начислено: ${Number(r.credits)} ${pluralRu(r.credits, 'кредит', 'кредита', 'кредитов')}.`);
  }

  return lines.join('\n');
}
