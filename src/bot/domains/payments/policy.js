import {
  PAYMENT_ADMIN_ACTIONS,
  PAYMENT_PURCHASE_ACTIONS,
} from './actions.js';

const PURCHASE_SET = new Set(PAYMENT_PURCHASE_ACTIONS);
const ADMIN_SET = new Set(PAYMENT_ADMIN_ACTIONS);

export function isPaymentPurchaseAction(action) {
  return PURCHASE_SET.has(String(action || '').trim());
}

export function isPaymentAdminAction(action) {
  return ADMIN_SET.has(String(action || '').trim());
}

export function isPaymentCallbackAction(action) {
  return isPaymentPurchaseAction(action) || isPaymentAdminAction(action);
}
