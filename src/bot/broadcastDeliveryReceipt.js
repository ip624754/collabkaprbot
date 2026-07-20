import { buildBroadcastUnknownReason } from './broadcastDeliverySafety.js';

async function defaultSleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readDurableReceipt(db, broadcastId, userId, attemptId) {
  if (typeof db?.getBroadcastDeliveryReceipt !== 'function') return null;
  try {
    return await db.getBroadcastDeliveryReceipt(broadcastId, userId, attemptId);
  } catch {
    return null;
  }
}

function durableState(row) {
  const state = String(row?.status || '').trim().toLowerCase();
  return ['sent', 'blocked', 'failed', 'delivery_unknown'].includes(state) ? state : '';
}

export async function persistBroadcastUnknown({
  db,
  broadcastId,
  userId,
  attemptId,
  reason,
  messageIds = [],
}) {
  try {
    const row = await db.markBroadcastDeliveryUnknown(
      broadcastId,
      userId,
      attemptId,
      reason,
      messageIds
    );
    if (row) return { state: 'delivery_unknown', persisted: true, row };
  } catch {
    // The write may have committed even if the acknowledgement was lost.
  }

  const durable = await readDurableReceipt(db, broadcastId, userId, attemptId);
  const state = durableState(durable);
  if (state) return { state, persisted: true, row: durable };
  return { state: 'sending_unconfirmed', persisted: false, row: null };
}

export async function persistBroadcastSentOrUnknown({
  db,
  broadcastId,
  userId,
  attemptId,
  messageIds = [],
  retries = 3,
  sleepFn = defaultSleep,
}) {
  const max = Math.max(1, Math.min(5, Number(retries || 0) || 1));
  for (let i = 0; i < max; i++) {
    try {
      const row = await db.markBroadcastDeliverySent(
        broadcastId,
        userId,
        attemptId,
        messageIds
      );
      if (row) return { state: 'sent', persisted: true, row };
    } catch {
      // Retry only the DB receipt. Telegram must never be called by this helper.
    }

    const durable = await readDurableReceipt(db, broadcastId, userId, attemptId);
    const state = durableState(durable);
    if (state === 'sent') return { state: 'sent', persisted: true, row: durable };
    if (state === 'blocked' || state === 'failed') {
      return { state, persisted: true, row: durable };
    }
    // A same-attempt unknown row may be promoted to sent on the next bounded
    // receipt retry because Telegram success is already proven by the caller.
    if (i < max - 1) await sleepFn(50 + i * 100);
  }

  return persistBroadcastUnknown({
    db,
    broadcastId,
    userId,
    attemptId,
    reason: buildBroadcastUnknownReason('telegram_send_succeeded_db_receipt_failed'),
    messageIds,
  });
}

export async function persistBroadcastRejectedOrUnknown({
  db,
  broadcastId,
  userId,
  attemptId,
  kind,
  errorText,
  error = null,
}) {
  let row = null;
  try {
    if (kind === 'blocked') {
      row = await db.markBroadcastDeliveryBlocked(
        broadcastId,
        userId,
        errorText,
        attemptId
      );
    } else if (kind === 'failed') {
      row = await db.markBroadcastDeliveryFailedNonRetryable(
        broadcastId,
        userId,
        errorText,
        attemptId
      );
    }
  } catch {
    row = null;
  }

  if (row) return { state: kind, persisted: true, row };

  const durable = await readDurableReceipt(db, broadcastId, userId, attemptId);
  const state = durableState(durable);
  if (state) return { state, persisted: true, row: durable };

  return persistBroadcastUnknown({
    db,
    broadcastId,
    userId,
    attemptId,
    reason: buildBroadcastUnknownReason(`telegram_${kind}_db_receipt_failed`, error),
  });
}
