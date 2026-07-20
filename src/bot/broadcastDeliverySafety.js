const DEFINITE_BLOCKED_CODES = new Set([400, 403]);

function normalizeText(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function getTelegramErrorCode(err) {
  const raw = err?.error_code ?? err?.statusCode ?? err?.response?.error_code ?? err?.response?.status;
  const code = Number(raw || 0);
  return Number.isFinite(code) ? code : 0;
}

export function getTelegramErrorDescription(err) {
  return normalizeText(
    err?.description ??
      err?.response?.description ??
      err?.response?.body?.description ??
      err?.message ??
      err,
    500
  );
}

export function isDefiniteBlockedTelegramError(code, description = '') {
  if (DEFINITE_BLOCKED_CODES.has(Number(code))) return true;
  const d = String(description || '').toLowerCase();
  return (
    d.includes('bot was blocked') ||
    d.includes('chat not found') ||
    d.includes('user is deactivated') ||
    d.includes('forbidden: bot was kicked')
  );
}

/**
 * Classify the observable Telegram outcome without pretending that a network
 * timeout or a 5xx proves the message was not delivered.
 *
 * - blocked: Telegram explicitly rejected the request; automatic resend is useless.
 * - retryable: Telegram explicitly returned 429; the message was not accepted.
 * - failed: another explicit 4xx response; the request was rejected.
 * - unknown: no trustworthy negative acknowledgement (timeout, transport error, 5xx).
 */
export function classifyBroadcastSendError(err) {
  const code = getTelegramErrorCode(err);
  const description = getTelegramErrorDescription(err);
  const messageIds = extractTelegramMessageIds(err);

  // A multi-message broadcast may fail after one or more Telegram calls already
  // succeeded. Even an explicit 429/4xx for the later call does not make the
  // whole delivery retryable: replaying the plan would duplicate the prefix.
  if (messageIds.length > 0) {
    return {
      kind: 'unknown',
      code,
      description,
      messageIds,
      reason: 'telegram_partial_delivery_outcome_unknown',
    };
  }

  if (Number(code) === 429) {
    return { kind: 'retryable', code, description, reason: 'telegram_429' };
  }

  if (isDefiniteBlockedTelegramError(code, description)) {
    return { kind: 'blocked', code, description, reason: `telegram_${code || 'blocked'}` };
  }

  if (code >= 400 && code < 500) {
    return { kind: 'failed', code, description, reason: `telegram_${code}` };
  }

  return {
    kind: 'unknown',
    code,
    description,
    reason: code ? `telegram_${code}_outcome_unknown` : 'telegram_transport_outcome_unknown',
  };
}

export function extractTelegramMessageIds(sendResult) {
  const values = [];
  const push = (value) => {
    const n = Number(value);
    if (Number.isSafeInteger(n) && n > 0 && !values.includes(n)) values.push(n);
  };

  if (Array.isArray(sendResult?.message_ids)) {
    for (const value of sendResult.message_ids) push(value);
  }
  if (Array.isArray(sendResult?.messages)) {
    for (const message of sendResult.messages) push(message?.message_id);
  }
  push(sendResult?.message_id);
  push(sendResult?.messageId);

  return values.slice(0, 20);
}

export function attachBroadcastPartialDeliveryEvidence(err, sendResult) {
  const messageIds = extractTelegramMessageIds(sendResult);
  if (messageIds.length === 0) return err;
  const wrapped = err && typeof err === 'object'
    ? err
    : new Error(String(err || 'telegram_send_failed'));
  try { wrapped.message_ids = messageIds; } catch {}
  try { wrapped.broadcast_partial_delivery = true; } catch {}
  return wrapped;
}

export function buildBroadcastUnknownReason(stage, err = null) {
  const prefix = normalizeText(stage || 'delivery_outcome_unknown', 120) || 'delivery_outcome_unknown';
  const code = getTelegramErrorCode(err);
  const description = getTelegramErrorDescription(err);
  return [prefix, code ? `code=${code}` : '', description ? `detail=${description}` : '']
    .filter(Boolean)
    .join(' | ')
    .slice(0, 500);
}
