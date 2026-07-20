import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildAllowedPatch, requireExactlyOneAffectedRow } from '../src/db/safePatch.js';

process.env.APP_ENV ||= 'test';
process.env.UPSTASH_REDIS_REST_URL ||= 'https://example.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN ||= 'test-token';

const {
  RequestBodyTooLargeError,
  readJsonBody,
  timingSafeEq,
} = await import('../src/lib/adminWeb/common.js');
const {
  claimCriticalTelegramUpdate,
  classifyCriticalTelegramUpdate,
  finalizeCriticalTelegramUpdate,
} = await import('../src/lib/criticalUpdateReplay.js');
const { collectProductionSecurityPostureErrors } = await import('../src/lib/config.js');
const { __paymentFulfillmentTestables } = await import('../src/bot/paymentFulfillmentCore.js');

let assertions = 0;
function ok(value, message) {
  assertions += 1;
  assert.ok(value, message);
}
function equal(actual, expected, message) {
  assertions += 1;
  assert.equal(actual, expected, message);
}
function throws(fn, matcher, message) {
  assertions += 1;
  assert.throws(fn, matcher, message);
}

class MemoryRedis {
  constructor({ fail = false } = {}) {
    this.store = new Map();
    this.fail = fail;
  }
  async set(key, value, options = {}) {
    if (this.fail) throw new Error('redis_down');
    const has = this.store.has(key);
    if (options.nx && has) return null;
    if (options.xx && !has) return null;
    this.store.set(key, value);
    return 'OK';
  }
  async get(key) {
    if (this.fail) throw new Error('redis_down');
    return this.store.get(key) ?? null;
  }
}

// Dynamic SQL allowlists and affected-row truth.
const built = buildAllowedPatch({ status: 'PAUSED', finished_at: null }, new Set(['status', 'finished_at']), {
  label: 'broadcast_patch',
  parameterOffset: 2,
});
equal(built.sets[0], 'status=$2', 'first allowlisted field gets deterministic parameter index');
equal(built.sets[1], 'finished_at=$3', 'second allowlisted field gets deterministic parameter index');
equal(built.values[0], 'PAUSED', 'patch values preserve key order');
throws(
  () => buildAllowedPatch({ 'status = \'DONE\' --': true }, new Set(['status']), { label: 'broadcast_patch' }),
  /broadcast_patch_field_not_allowed/,
  'dynamic SQL field injection is rejected before query construction',
);
throws(
  () => requireExactlyOneAffectedRow({ rowCount: 0, rows: [] }, 'broadcast_update'),
  /broadcast_update_affected_rows:0/,
  'zero-row mutation cannot report success',
);
const affected = requireExactlyOneAffectedRow({ rowCount: 1, rows: [{ id: 7 }] }, 'broadcast_update');
equal(affected.id, 7, 'single-row mutation returns durable row evidence');

// Admin JSON body cap applies to both parsed and streamed bodies.
await assert.rejects(
  () => readJsonBody({ headers: {}, body: { text: 'x'.repeat(80) } }, { maxBytes: 32 }),
  RequestBodyTooLargeError,
  'parsed oversized admin body is rejected',
);
assertions += 1;
const streamedReq = {
  headers: {},
  async *[Symbol.asyncIterator]() {
    yield Buffer.from('{"text":"');
    yield Buffer.from('x'.repeat(80));
    yield Buffer.from('"}');
  },
};
await assert.rejects(
  () => readJsonBody(streamedReq, { maxBytes: 32 }),
  RequestBodyTooLargeError,
  'streamed oversized admin body is rejected before full buffering',
);
assertions += 1;
const parsedBody = await readJsonBody({ headers: {}, body: { action: 'ok' } }, { maxBytes: 1024 });
equal(parsedBody.action, 'ok', 'bounded parsed JSON remains accepted');
const stringBody = await readJsonBody({ headers: {}, body: '{"action":"ok_string"}' }, { maxBytes: 1024 });
equal(stringBody.action, 'ok_string', 'bounded pre-parsed string JSON remains accepted');
await assert.rejects(
  () => readJsonBody({ headers: {}, body: JSON.stringify({ text: 'x'.repeat(80) }) }, { maxBytes: 32 }),
  RequestBodyTooLargeError,
  'oversized string body is rejected before JSON parsing',
);
assertions += 1;

// Critical Telegram update classification and fail-closed replay receipt.
equal(classifyCriticalTelegramUpdate({ update_id: 1, callback_query: { data: 'a:home' } }).critical, false, 'navigation callback bypasses critical receipt');
equal(classifyCriticalTelegramUpdate({ update_id: 2, callback_query: { data: 'a:gw_draw_do|id:5' } }).critical, true, 'giveaway draw callback is critical');
equal(classifyCriticalTelegramUpdate({ update_id: 3, message: { successful_payment: {} } }).kind, 'successful_payment', 'Stars fulfillment is critical');

const memory = new MemoryRedis();
const update = { update_id: 588006, callback_query: { data: 'a:admin_pay_apply|id:42' } };
const firstClaim = await claimCriticalTelegramUpdate(update, { client: memory, ttlSec: 3600, now: 1000 });
ok(firstClaim.claimed, 'first critical update owns the receipt');
const duplicateProcessing = await claimCriticalTelegramUpdate(update, { client: memory, ttlSec: 3600, now: 1001 });
ok(duplicateProcessing.duplicate, 'parallel/replayed critical update is suppressed');
equal(duplicateProcessing.existingStatus, 'processing', 'duplicate sees processing state');
const done = await finalizeCriticalTelegramUpdate(firstClaim, 'done', { client: memory, ttlSec: 3600, now: 1002 });
ok(done.ok, 'successful critical mutation records done');
const duplicateDone = await claimCriticalTelegramUpdate(update, { client: memory, ttlSec: 3600, now: 1003 });
equal(duplicateDone.existingStatus, 'done', 'completed mutation remains replay-proof');

const errorUpdate = { update_id: 588007, callback_query: { data: 'a:bc_confirm|id:9' } };
const errorClaim = await claimCriticalTelegramUpdate(errorUpdate, { client: memory, ttlSec: 3600, now: 2000 });
const unknown = await finalizeCriticalTelegramUpdate(errorClaim, 'outcome_unknown', {
  client: memory,
  ttlSec: 3600,
  now: 2001,
  errorCode: 'handler_error',
});
ok(unknown.ok, 'ambiguous critical handler outcome becomes terminal unknown');
const duplicateUnknown = await claimCriticalTelegramUpdate(errorUpdate, { client: memory, ttlSec: 3600, now: 2002 });
equal(duplicateUnknown.existingStatus, 'outcome_unknown', 'unknown critical outcome is not automatically replayed');

const unavailable = await claimCriticalTelegramUpdate(update, { client: new MemoryRedis({ fail: true }) });
ok(unavailable.failClosed, 'critical mutation fails closed when replay storage is unavailable');
const noUpdateId = await claimCriticalTelegramUpdate({ callback_query: { data: 'a:gw_draw_do|id:5' } }, { client: memory });
equal(noUpdateId.error, 'critical_update_id_missing', 'critical update without provider update_id fails closed');

// Production posture is explicit and testable.
const secureBase = {
  APP_ENV: 'prod',
  WEBHOOK_SECRET_TOKEN: 'Webhook_A7x9Qp2Lm4Vn8R5s3K6d1T0z'.repeat(2),
  CRON_SECRET: 'Cron_B8y0Wr3Mn5Xp9S6t4L7e2U1a'.repeat(2),
  RATE_LIMIT_ENABLED: true,
  BX_MSG_RATE_LIMIT: 12,
  BX_MSG_RATE_WINDOW_SEC: 60,
  INTRO_RATE_LIMIT: 6,
  INTRO_RATE_WINDOW_SEC: 3600,
  BRAND_LEAD_RATE_LIMIT: 1,
  BRAND_LEAD_RATE_WINDOW_SEC: 600,
  CREATOR_BRAND_APPLY_RATE_LIMIT: 1,
  CREATOR_BRAND_APPLY_RATE_WINDOW_SEC: 600,
  CREATOR_BRAND_APPLY_DAILY_LIMIT: 5,
  CREATOR_BRAND_APPLY_DAILY_WINDOW_SEC: 86400,
  PAYMENTS_AUTO_APPLY_DEFAULT: true,
  PAYMENTS_FALLBACK_APPLY_ENABLED: false,
  MATCH_FEAT_AUTO_APPLY_ENABLED: false,
  PAYMENTS_PAYLOAD_HMAC_KEY: 'Payment_C9z1Xs4Np6Yq0T7u5M8f3V2b'.repeat(2),
  PAYMENTS_FALLBACK_ALLOW_UNSIGNED: false,
  ADMIN_WEB_ENABLED: true,
  ADMIN_WEB_SECRET: 'Admin_D0a2Yt5Qr7Zp1U8v6N9g4W3c'.repeat(2),
  ADMIN_WEB_SESSION_SECRET: 'Session_E1b3Zu6Rs8Aq2V9w7P0h5X4d'.repeat(2),
  ADMIN_WEB_START_RATE_LIMIT: 8,
  ADMIN_WEB_START_RATE_WINDOW_SEC: 300,
  ADMIN_WEB_CODE_RATE_LIMIT: 10,
  ADMIN_WEB_CODE_RATE_WINDOW_SEC: 300,
  ADMIN_WEB_JSON_BODY_MAX_BYTES: 65536,
};
equal(collectProductionSecurityPostureErrors(secureBase).length, 0, 'strong production posture passes');
ok(
  collectProductionSecurityPostureErrors({ ...secureBase, RATE_LIMIT_ENABLED: false }).some((item) => item.includes('RATE_LIMIT_ENABLED')),
  'production rate limiting cannot be silently disabled',
);
ok(
  collectProductionSecurityPostureErrors({ ...secureBase, WEBHOOK_SECRET_TOKEN: '' }).some((item) => item.includes('WEBHOOK_SECRET_TOKEN')),
  'missing production webhook secret remains a readiness/security posture failure',
);
ok(
  collectProductionSecurityPostureErrors({ ...secureBase, PAYMENTS_PAYLOAD_HMAC_KEY: 'short' }).some((item) => item.includes('PAYMENTS_PAYLOAD_HMAC_KEY')),
  'automatic fulfillment requires a strong HMAC key',
);
ok(
  collectProductionSecurityPostureErrors({ ...secureBase, ADMIN_WEB_SESSION_SECRET: secureBase.ADMIN_WEB_SECRET }).some((item) => item.includes('distinct')),
  'privileged secrets cannot be reused across admin boundaries',
);
ok(
  collectProductionSecurityPostureErrors({ ...secureBase, ADMIN_WEB_ENABLED: false, CRON_SECRET: secureBase.WEBHOOK_SECRET_TOKEN }).some((item) => item.includes('distinct')),
  'webhook and cron secrets must remain distinct even when admin web is disabled',
);
ok(
  collectProductionSecurityPostureErrors({ ...secureBase, PAYMENTS_PAYLOAD_HMAC_KEY: secureBase.CRON_SECRET }).some((item) => item.includes('distinct')),
  'payment HMAC key cannot reuse another privileged operational secret',
);
equal(collectProductionSecurityPostureErrors({ APP_ENV: 'dev' }).length, 0, 'development remains outside production fail-fast gate');
equal(collectProductionSecurityPostureErrors({ ...secureBase, APP_ENV: 'production' }).length, 0, 'production alias receives the same posture gate');

// Timing-safe comparison remains canonical for secrets and fallback payment signatures.
ok(timingSafeEq('same-secret', 'same-secret'), 'shared secret timing-safe comparison accepts equal values');
equal(timingSafeEq('same-secret', 'different-secret'), false, 'shared secret timing-safe comparison rejects unequal values');
const payloadNoSig = 'pro_10_20_abcdef';
const hmacKey = crypto.randomBytes(32).toString('hex');
const sigLen = 10;
const sig = crypto.createHmac('sha256', hmacKey).update(payloadNoSig).digest('hex').slice(0, sigLen);
const signedPayload = `${payloadNoSig}${sig}`;
const verified = __paymentFulfillmentTestables.verifyPayloadHmac(signedPayload, {
  PAYMENTS_PAYLOAD_HMAC_KEY: hmacKey,
  PAYMENTS_PAYLOAD_HMAC_LEN: sigLen,
  PAYMENTS_FALLBACK_ALLOW_UNSIGNED: false,
});
ok(verified.ok && verified.signed, 'payment fallback signature verifies through timing-safe core');
const tamperedLastChar = sig.at(-1) === '0' ? '1' : '0';
const tampered = __paymentFulfillmentTestables.verifyPayloadHmac(`${payloadNoSig}${sig.slice(0, -1)}${tamperedLastChar}`, {
  PAYMENTS_PAYLOAD_HMAC_KEY: hmacKey,
  PAYMENTS_PAYLOAD_HMAC_LEN: sigLen,
  PAYMENTS_FALLBACK_ALLOW_UNSIGNED: false,
});
equal(tampered.ok, false, 'tampered fallback signature is rejected');

console.log(`✅ bounded safety hardening tests PASS (${assertions} assertions)`);
