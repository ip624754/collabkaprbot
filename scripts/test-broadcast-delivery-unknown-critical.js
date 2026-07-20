import assert from 'node:assert/strict';
import {
  attachBroadcastPartialDeliveryEvidence,
  buildBroadcastUnknownReason,
  classifyBroadcastSendError,
  extractTelegramMessageIds,
} from '../src/bot/broadcastDeliverySafety.js';
import {
  persistBroadcastRejectedOrUnknown,
  persistBroadcastSentOrUnknown,
  persistBroadcastUnknown,
} from '../src/bot/broadcastDeliveryReceipt.js';

let assertions = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  assertions += 1;
};
const equal = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
};

function makeDb({ sent = 'ok', unknown = 'ok', blocked = 'ok', failed = 'ok', receipt = null } = {}) {
  const calls = [];
  const resolve = (mode, value) => {
    calls.push(value);
    if (mode === 'throw') throw new Error(`${value} failed`);
    if (mode === 'null') return null;
    return { status: value };
  };
  return {
    calls,
    async markBroadcastDeliverySent(...args) {
      calls.push(['sent_args', ...args]);
      return resolve(sent, 'sent');
    },
    async markBroadcastDeliveryUnknown(...args) {
      calls.push(['unknown_args', ...args]);
      return resolve(unknown, 'delivery_unknown');
    },
    async markBroadcastDeliveryBlocked(...args) {
      calls.push(['blocked_args', ...args]);
      return resolve(blocked, 'blocked');
    },
    async markBroadcastDeliveryFailedNonRetryable(...args) {
      calls.push(['failed_args', ...args]);
      return resolve(failed, 'failed');
    },
    async getBroadcastDeliveryReceipt(...args) {
      calls.push(['receipt_args', ...args]);
      if (receipt === 'throw') throw new Error('receipt read failed');
      if (!receipt) return null;
      return { status: receipt };
    },
  };
}

// Telegram outcome classification: only explicit negative acknowledgements are retryable/failed.
{
  equal(classifyBroadcastSendError({ error_code: 429 }).kind, 'retryable', '429 must be retryable');
  equal(classifyBroadcastSendError({ error_code: 403 }).kind, 'blocked', '403 must be blocked');
  equal(classifyBroadcastSendError({ error_code: 400 }).kind, 'blocked', '400 must be blocked/non-retryable');
  equal(classifyBroadcastSendError({ error_code: 422 }).kind, 'failed', 'explicit 4xx must be failed');
  equal(classifyBroadcastSendError({ error_code: 500 }).kind, 'unknown', '5xx must be outcome unknown');
  equal(classifyBroadcastSendError(new Error('ETIMEDOUT')).kind, 'unknown', 'transport timeout must be unknown');
  equal(classifyBroadcastSendError({ statusCode: 0, message: 'socket hang up' }).kind, 'unknown', 'socket error must be unknown');
  const partial429 = classifyBroadcastSendError({ error_code: 429, message_ids: [91] });
  equal(partial429.kind, 'unknown', '429 after a partial multi-message send must be unknown');
  equal(partial429.messageIds, [91], 'partial send evidence must retain accepted message ids');
  equal(
    classifyBroadcastSendError({ error_code: 400, message_ids: [92] }).kind,
    'unknown',
    '4xx after a partial multi-message send must not replay the accepted prefix'
  );
}

// Partial multi-message evidence is attached to the thrown error so later
// classification cannot replay the already accepted prefix.
{
  const err = attachBroadcastPartialDeliveryEvidence(
    { error_code: 429, description: 'Too Many Requests' },
    { messages: [{ message_id: 201 }, { message_id: 202 }] }
  );
  equal(err.message_ids, [201, 202], 'partial delivery helper must retain accepted prefix ids');
  check(err.broadcast_partial_delivery === true, 'partial delivery helper must mark the error');
  equal(classifyBroadcastSendError(err).kind, 'unknown', 'annotated partial error must be terminal unknown');
}

// Telegram message receipt extraction is bounded and deduplicated.
{
  equal(
    extractTelegramMessageIds({ messages: [{ message_id: 10 }, { message_id: 10 }, { message_id: 11 }] }),
    [10, 11],
    'message ids must be unique'
  );
  equal(extractTelegramMessageIds({ message_id: 12 }), [12], 'single message id must be captured');
  equal(extractTelegramMessageIds({ message_id: -1 }), [], 'invalid message id must be rejected');
}

// Successful sent receipt.
{
  const db = makeDb();
  const out = await persistBroadcastSentOrUnknown({
    db,
    broadcastId: 1,
    userId: 2,
    attemptId: 'attempt-1',
    messageIds: [77],
    sleepFn: async () => {},
  });
  equal(out.state, 'sent', 'durable sent receipt must be final sent');
  check(!db.calls.some((x) => x === 'delivery_unknown'), 'unknown state must not be written after sent receipt');
}


// A lost DB acknowledgement after COMMIT is reconciled from durable state and
// must not be downgraded to unknown.
{
  const db = makeDb({ sent: 'throw', receipt: 'sent' });
  const out = await persistBroadcastSentOrUnknown({
    db,
    broadcastId: 1,
    userId: 2,
    attemptId: 'attempt-commit-ambiguous',
    retries: 1,
    sleepFn: async () => {},
  });
  equal(out.state, 'sent', 'durable sent row must resolve a lost write acknowledgement');
  check(out.persisted, 'durable sent row must be reported as persisted');
  check(!db.calls.some((x) => x === 'delivery_unknown'), 'durable sent row must not be overwritten as unknown');
}

// The same ambiguity rule applies to explicit rejection receipts.
{
  const db = makeDb({ blocked: 'throw', receipt: 'blocked' });
  const out = await persistBroadcastRejectedOrUnknown({
    db,
    broadcastId: 3,
    userId: 4,
    attemptId: 'attempt-blocked-ambiguous',
    kind: 'blocked',
    errorText: 'bot was blocked',
  });
  equal(out.state, 'blocked', 'durable blocked row must resolve a lost acknowledgement');
  check(out.persisted, 'durable blocked row must be reported as persisted');
}

// DB sent receipt failure falls back to terminal unknown; it never retries Telegram.
{
  const db = makeDb({ sent: 'throw', unknown: 'ok' });
  let sleeps = 0;
  const out = await persistBroadcastSentOrUnknown({
    db,
    broadcastId: 1,
    userId: 2,
    attemptId: 'attempt-2',
    messageIds: [88],
    retries: 3,
    sleepFn: async () => { sleeps += 1; },
  });
  equal(out.state, 'delivery_unknown', 'sent receipt failure must become delivery_unknown');
  equal(sleeps, 2, 'receipt retries must be bounded');
  check(db.calls.filter((x) => x === 'sent').length === 3, 'sent receipt must be retried exactly three times');
  check(db.calls.some((x) => x === 'delivery_unknown'), 'unknown receipt must be attempted');
}

// Total DB outage leaves sending_unconfirmed; stale sending must be quarantined by DB worker, never reclaimed.
{
  const db = makeDb({ sent: 'throw', unknown: 'throw' });
  const out = await persistBroadcastSentOrUnknown({
    db,
    broadcastId: 1,
    userId: 2,
    attemptId: 'attempt-3',
    retries: 1,
    sleepFn: async () => {},
  });
  equal(out.state, 'sending_unconfirmed', 'total DB outage must expose unconfirmed state');
  equal(out.persisted, false, 'unconfirmed state must not pretend DB persistence');
}

// Explicit blocked response persists terminal blocked, with unknown fallback on receipt failure.
{
  const db = makeDb();
  const out = await persistBroadcastRejectedOrUnknown({
    db,
    broadcastId: 3,
    userId: 4,
    attemptId: 'attempt-4',
    kind: 'blocked',
    errorText: 'bot was blocked',
  });
  equal(out.state, 'blocked', 'blocked receipt must persist blocked');
}
{
  const db = makeDb({ blocked: 'null', unknown: 'ok' });
  const out = await persistBroadcastRejectedOrUnknown({
    db,
    broadcastId: 3,
    userId: 4,
    attemptId: 'attempt-5',
    kind: 'blocked',
    errorText: 'bot was blocked',
  });
  equal(out.state, 'delivery_unknown', 'blocked receipt failure must become unknown');
}

// Explicit failed response behaves the same way.
{
  const db = makeDb({ failed: 'ok' });
  const out = await persistBroadcastRejectedOrUnknown({
    db,
    broadcastId: 5,
    userId: 6,
    attemptId: 'attempt-6',
    kind: 'failed',
    errorText: 'unprocessable request',
  });
  equal(out.state, 'failed', 'explicit failed receipt must persist failed');
}

// Unknown outcome carries bounded evidence.
{
  const db = makeDb({ unknown: 'ok' });
  const reason = buildBroadcastUnknownReason('telegram_transport_outcome_unknown', new Error('socket closed'));
  const out = await persistBroadcastUnknown({
    db,
    broadcastId: 7,
    userId: 8,
    attemptId: 'attempt-7',
    reason,
  });
  equal(out.state, 'delivery_unknown', 'unknown outcome must persist terminal unknown');
  check(reason.includes('telegram_transport_outcome_unknown'), 'unknown reason must preserve stage');
  check(reason.length <= 500, 'unknown reason must be bounded');
}

console.log(`✅ broadcast delivery unknown-state critical tests PASS (${assertions} assertions)`);
