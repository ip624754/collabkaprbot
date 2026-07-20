import assert from 'node:assert/strict';

process.env.LOG_PII_HASH_KEY = process.env.LOG_PII_HASH_KEY || 'test-privacy-key-'.repeat(4);

const health = await import('../src/lib/healthPolicy.js');
const privacy = await import('../src/lib/logPrivacy.js');

let assertions = 0;
const ok = (condition, message) => { assertions += 1; assert.ok(condition, message); };
const eq = (actual, expected, message) => { assertions += 1; assert.equal(actual, expected, message); };

// Health view routing.
eq(health.resolveHealthView({ url: '/api/health' }), 'readiness', 'default must be readiness');
eq(health.resolveHealthView({ url: '/api/health?mode=liveness' }), 'liveness', 'liveness mode');
eq(health.resolveHealthView({ url: '/api/health?live=1' }), 'liveness', 'live alias');
eq(health.resolveHealthView({ url: '/api/health?full=1' }), 'diagnostics', 'full requires diagnostics');
eq(health.resolveHealthView({ query: { view: 'diagnostics' } }), 'diagnostics', 'diagnostics query');

const live = health.buildLivenessPayload(new Date('2026-07-20T00:00:00.000Z'));
eq(live.ok, true, 'liveness ok');
eq(live.status, 'alive', 'liveness status');
eq(live.check, 'liveness', 'liveness check');
ok(!Object.prototype.hasOwnProperty.call(live, 'database'), 'liveness must not expose dependencies');

const noGoInternal = {
  ts: '2026-07-20T00:00:00.000Z',
  system_status: 'NO_GO',
  database: { configured: true, read_ok: false, pooled_url: true },
  redis: { configured: true, read_ok: false, write_ok: false, last_error: 'user 611377976 failed' },
  payments: { payload_hmac_minlen_ok: true, payload_hmac_key_len: 48 },
  no_go_reasons: [
    { code: 'database_read_not_ok', severity: 'P0', value: false, hint: 'internal database hint' },
    { code: 'redis_read_not_ok', severity: 'P0', value: false, hint: 'internal redis hint' },
  ],
  qstash: { token: 'secret' },
  ops: { digest_preview: { last: [{ title: '@secret_user 611377976' }] } },
};

const publicNoGo = health.buildPublicReadinessPayload(noGoInternal);
eq(publicNoGo.ok, false, 'NO_GO must mean ok=false');
eq(publicNoGo.status, 'not_ready', 'NO_GO readiness status');
eq(publicNoGo.system_status, 'NO_GO', 'NO_GO system status');
eq(health.healthStatusCode('NO_GO'), 503, 'NO_GO HTTP status');
eq(publicNoGo.checks.database, 'unavailable', 'database check');
eq(publicNoGo.checks.redis, 'unavailable', 'redis check');
ok(publicNoGo.reason_codes.includes('database_read_not_ok'), 'public reason code included');
ok(!Object.prototype.hasOwnProperty.call(publicNoGo, 'no_go_reasons'), 'public readiness must not expose hints/values');
ok(!Object.prototype.hasOwnProperty.call(publicNoGo, 'qstash'), 'public readiness must not expose qstash');
ok(!Object.prototype.hasOwnProperty.call(publicNoGo, 'ops'), 'public readiness must not expose ops');
ok(!JSON.stringify(publicNoGo).includes('611377976'), 'public readiness must not leak IDs');

const goPublic = health.buildPublicReadinessPayload({
  ts: noGoInternal.ts,
  system_status: 'GO',
  database: { configured: true, read_ok: true },
  redis: { configured: true, read_ok: true, write_ok: true },
  payments: { payload_hmac_minlen_ok: true },
  no_go_reasons: [],
});
eq(goPublic.ok, true, 'GO means ok=true');
eq(goPublic.status, 'ready', 'GO readiness status');
eq(health.healthStatusCode('GO'), 200, 'GO HTTP status');

const diagnostics = health.sanitizeHealthDiagnostics({
  ...noGoInternal,
  qstash: {
    ping: { last_at: 'now', last_nonce: 'nonce-secret' },
    reschedule_failed: { last_payload: 'tgId=611377976 @secret_user', last_error: 'tg 611377976 failed' },
    official_publish_stuck: { last_offer_id: 12345 },
  },
  payments: {
    ...noGoInternal.payments,
    fallback_apply_runtime: { byTgId: 611377976, byUser: 42, reason: '@secret_user emergency', at: 'now' },
  },
  mon: {
    accept: { last_app_id: 99, last_error: 'user 611377976' },
    unlock: { last_ws_id: 88 },
    official: { last_offer_id: 77 },
    intro: { last_offer_id: 66 },
  },
});
eq(diagnostics.health_view, 'diagnostics', 'diagnostics marker');
eq(diagnostics.diagnostics_access, 'admin_session', 'diagnostics access marker');
eq(diagnostics.qstash.ping.last_nonce_present, true, 'nonce presence retained');
ok(!Object.prototype.hasOwnProperty.call(diagnostics.qstash.ping, 'last_nonce'), 'nonce removed');
ok(!Object.prototype.hasOwnProperty.call(diagnostics.qstash.reschedule_failed, 'last_payload'), 'payload removed');
ok(!Object.prototype.hasOwnProperty.call(diagnostics.qstash.official_publish_stuck, 'last_offer_id'), 'offer id removed');
ok(!Object.prototype.hasOwnProperty.call(diagnostics.mon.accept, 'last_app_id'), 'app id removed');
ok(!Object.prototype.hasOwnProperty.call(diagnostics.ops.digest_preview, 'last'), 'ops event tail removed');
ok(!Object.prototype.hasOwnProperty.call(diagnostics.payments.fallback_apply_runtime, 'byTgId'), 'fallback actor tg id removed');
ok(!Object.prototype.hasOwnProperty.call(diagnostics.payments.fallback_apply_runtime, 'byUser'), 'fallback user id removed');
ok(!Object.prototype.hasOwnProperty.call(diagnostics.payments.fallback_apply_runtime, 'reason'), 'fallback free-text reason removed');
ok(!JSON.stringify(diagnostics).includes('611377976'), 'diagnostics error text must redact numeric IDs');
ok(!JSON.stringify(diagnostics).includes('@secret_user'), 'diagnostics must redact usernames');

const update = {
  update_id: 555,
  callback_query: {
    from: { id: 611377976, username: 'secret_user' },
    data: 'a:pay_apply|payment:123456|secret:abc',
    message: { chat: { id: -1001234567890 } },
  },
};
const summary = privacy.telegramUpdateLogSummary(update);
eq(summary.update_id, 555, 'update id retained');
eq(summary.kind, 'callback_query', 'kind retained');
eq(summary.action, 'a:pay_apply', 'only callback action retained');
ok(summary.actor_ref && summary.actor_ref !== '611377976', 'actor pseudonymized');
ok(summary.chat_ref && summary.chat_ref !== '-1001234567890', 'chat pseudonymized');
ok(!JSON.stringify(summary).includes('secret_user'), 'username not logged');
ok(!JSON.stringify(summary).includes('payment:123456'), 'callback parameters not logged');

const meta = privacy.sanitizeLogMeta({
  tgId: 611377976,
  chat_id: -1001234567890,
  username: 'secret_user',
  payload: 'private-payment-token',
  nested: { userId: 99887766, text: 'hello private text' },
});
ok(!JSON.stringify(meta).includes('611377976'), 'meta tg id redacted');
ok(!JSON.stringify(meta).includes('1234567890'), 'meta chat id redacted');
ok(!JSON.stringify(meta).includes('secret_user'), 'meta username redacted');
ok(!JSON.stringify(meta).includes('private-payment-token'), 'meta payload redacted');
ok(!JSON.stringify(meta).includes('hello private text'), 'meta text redacted');

const error = privacy.safeLogError(new Error('Bearer abcdef user 611377976 email person@example.com @secret_user'));
ok(!error.message.includes('abcdef'), 'bearer redacted');
ok(!error.message.includes('611377976'), 'error id redacted');
ok(!error.message.includes('person@example.com'), 'email redacted');
ok(!error.message.includes('@secret_user'), 'username redacted');

console.log(`✅ health/privacy/readiness critical tests PASS (${assertions} assertions)`);
