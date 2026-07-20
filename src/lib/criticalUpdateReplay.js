import crypto from 'node:crypto';
import { CFG } from './config.js';
import { k, redis } from './redis.js';

const CRITICAL_CALLBACK_ACTIONS = new Set([
  'a:aw_auth_dec',
  'a:admin_pay_apply',
  'a:admin_pay_autoheal',
  'a:adm_gift_do',
  'a:adm_gift_revoke_do',
  'a:adm_ugift_do',
  'a:adm_urevoke_do',
  'a:adm_uban_do',
  'a:brand_app_accept',
  'a:bc_confirm',
  'a:bc_pause',
  'a:bc_resume',
  'a:bc_stop',
  'a:gw_del_do',
  'a:gw_draw_do',
  'a:gw_draw_now',
  'a:gw_end_do',
  'a:gw_end_now',
  'a:gw_publish',
  'a:gw_publish_results',
  'a:share_redeem_do',
]);

function normalizeStoredReceipt(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return { status: 'unknown', raw: String(raw).slice(0, 80) };
  }
}

export function callbackActionFromUpdate(update) {
  const data = String(update?.callback_query?.data || '');
  if (!data) return '';
  return data.split('|', 1)[0].trim();
}

export function classifyCriticalTelegramUpdate(update) {
  const updateId = Number(update?.update_id);
  if (update?.message?.successful_payment) {
    return { critical: true, kind: 'successful_payment', action: '', updateId };
  }

  const action = callbackActionFromUpdate(update);
  if (action && CRITICAL_CALLBACK_ACTIONS.has(action)) {
    return { critical: true, kind: 'callback_query', action, updateId };
  }

  return { critical: false, kind: '', action, updateId };
}

function receiptKey(updateId) {
  return k(['telegram', 'critical_update_receipt', Number(updateId)]);
}

function newReceiptToken() {
  return crypto.randomBytes(16).toString('hex');
}

export async function claimCriticalTelegramUpdate(update, {
  client = redis,
  ttlSec = CFG.CRITICAL_UPDATE_RECEIPT_TTL_SEC,
  now = Date.now(),
} = {}) {
  const classification = classifyCriticalTelegramUpdate(update);
  if (!classification.critical) {
    return { ...classification, claimed: true, bypassed: true };
  }
  if (!Number.isSafeInteger(classification.updateId) || classification.updateId <= 0) {
    return { ...classification, claimed: false, failClosed: true, error: 'critical_update_id_missing' };
  }

  const key = receiptKey(classification.updateId);
  const receiptToken = newReceiptToken();
  const receipt = {
    v: 1,
    status: 'processing',
    receiptToken,
    updateId: classification.updateId,
    kind: classification.kind,
    action: classification.action || '',
    startedAt: Number(now),
    updatedAt: Number(now),
  };

  try {
    const inserted = await client.set(key, JSON.stringify(receipt), {
      nx: true,
      ex: Math.max(60, Number(ttlSec || 0) || 7 * 24 * 60 * 60),
    });
    if (inserted) {
      return { ...classification, claimed: true, key, receiptToken, receipt };
    }
    const existing = normalizeStoredReceipt(await client.get(key));
    return {
      ...classification,
      claimed: false,
      duplicate: true,
      key,
      existingStatus: String(existing?.status || 'unknown'),
      existing,
    };
  } catch (error) {
    return {
      ...classification,
      claimed: false,
      failClosed: true,
      error: 'critical_update_receipt_unavailable',
      cause: error,
    };
  }
}

export async function finalizeCriticalTelegramUpdate(claim, status, {
  client = redis,
  ttlSec = CFG.CRITICAL_UPDATE_RECEIPT_TTL_SEC,
  now = Date.now(),
  errorCode = '',
} = {}) {
  if (!claim?.critical || claim?.bypassed) return { ok: true, bypassed: true };
  if (!claim?.claimed || !claim?.key || !claim?.receiptToken) {
    return { ok: false, error: 'critical_update_claim_missing' };
  }

  const finalStatus = status === 'done' ? 'done' : 'outcome_unknown';
  const next = {
    ...claim.receipt,
    status: finalStatus,
    updatedAt: Number(now),
    ...(finalStatus === 'done' ? { completedAt: Number(now) } : { unknownAt: Number(now) }),
    ...(errorCode ? { errorCode: String(errorCode).slice(0, 80) } : {}),
  };

  try {
    const stored = await client.set(claim.key, JSON.stringify(next), {
      xx: true,
      ex: Math.max(60, Number(ttlSec || 0) || 7 * 24 * 60 * 60),
    });
    if (!stored) return { ok: false, error: 'critical_update_receipt_lost' };
    return { ok: true, status: finalStatus };
  } catch (error) {
    return { ok: false, error: 'critical_update_receipt_finalize_failed', cause: error };
  }
}

export const __criticalUpdateReplayTestables = Object.freeze({
  CRITICAL_CALLBACK_ACTIONS,
  normalizeStoredReceipt,
});
