import assert from 'node:assert/strict';
import fs from 'node:fs';

const queries = fs.readFileSync('src/db/queries.js', 'utf8');
const safePatch = fs.readFileSync('src/db/safePatch.js', 'utf8');
const common = fs.readFileSync('src/lib/adminWeb/common.js', 'utf8');
const authApi = fs.readFileSync('api/admin-web-auth.js', 'utf8');
const writeApi = fs.readFileSync('api/admin-web-write.js', 'utf8');
const webhook = fs.readFileSync('api/webhook.js', 'utf8');
const replay = fs.readFileSync('src/lib/criticalUpdateReplay.js', 'utf8');
const config = fs.readFileSync('src/lib/config.js', 'utf8');
const health = fs.readFileSync('api/health.js', 'utf8');
const bot = fs.readFileSync('src/bot/bot.js', 'utf8');
const gwAccess = fs.readFileSync('src/bot/domains/giveaways/callbacks.js', 'utf8');

assert.ok(safePatch.includes('field_not_allowed'), 'dynamic SQL allowlist rejects unknown fields');
assert.ok(safePatch.includes('MUTATION_ROW_COUNT_MISMATCH'), 'row-count mismatch is explicit');
for (const marker of [
  'WORKSPACE_SETTING_PATCH_FIELDS',
  'GIVEAWAY_PATCH_FIELDS',
  'BROADCAST_PATCH_FIELDS',
  'BROADCAST_TRANSITION_PATCH_FIELDS',
]) {
  assert.ok(queries.includes(marker), `${marker} must remain explicit`);
}
assert.ok(queries.includes('returning workspace_id'), 'workspace update keeps affected-row evidence');
assert.ok(queries.includes('returning id'), 'generic mutations keep affected-row evidence');

assert.ok(common.includes('RequestBodyTooLargeError'), 'admin body cap has typed error');
assert.ok(common.includes("statusCode = 413"), 'oversized admin body maps to 413');
assert.ok(authApi.includes("request_body_too_large"), 'auth API handles oversized body');
assert.ok(writeApi.includes("request_body_too_large"), 'write API handles oversized body');

assert.ok(replay.includes('CRITICAL_CALLBACK_ACTIONS'), 'critical callback set is explicit');
assert.ok(replay.includes("status: 'processing'"), 'critical receipt is claimed before mutation');
assert.ok(replay.includes("'outcome_unknown'"), 'ambiguous outcome is terminal');
assert.ok(webhook.includes('critical_duplicate_suppressed'), 'webhook suppresses replay');
assert.ok(webhook.includes('critical_receipt_fail_closed'), 'webhook fails closed without receipt storage');
assert.ok(webhook.includes('critical_outcome_unknown'), 'ambiguous critical handler outcomes remain operator-visible');

assert.ok(config.includes('collectProductionSecurityPostureErrors'), 'production posture is testable');
assert.ok(config.includes('RATE_LIMIT_ENABLED must be enabled in production'), 'prod rate limit fail-fast remains active');
assert.ok(config.includes('PAYMENTS_PAYLOAD_HMAC_KEY must be 32+ bytes'), 'payment HMAC strength gate remains active');
assert.ok(config.includes('must be distinct from'), 'privileged secret boundary reuse is rejected');
assert.ok(health.includes('production_security_posture_not_ok'), 'unsafe production posture must make readiness NO_GO');

assert.equal(bot.includes('611377976'), false, 'runtime bot copy must not expose owner-looking ID');
assert.equal(gwAccess.includes('611377976'), false, 'giveaway access copy must not expose owner-looking ID');
assert.ok(bot.includes('123456789') && gwAccess.includes('123456789'), 'runtime examples use neutral synthetic ID');

console.log('✅ bounded safety hardening source contract PASS');
