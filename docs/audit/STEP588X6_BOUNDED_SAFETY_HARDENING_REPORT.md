# STEP588X6 — Bounded Safety Hardening Report

**Date:** 2026-07-20
**Mode:** HEAVY
**Risk Score:** 14/20
**Baseline:** STEP588X5
**Scope:** bounded P2/P3 safety remediation; no database migration and no product-flow redesign.

## Verdict

> SOURCE READY / PRODUCTION ENV PREFLIGHT AND REPLAY CANARY PENDING

STEP588X6 converts the remaining bounded safety footguns into explicit contracts:

- selected high-risk Telegram mutations require a Redis replay receipt before handler execution;
- replayed, concurrent or ambiguous critical updates are not automatically processed again;
- dynamic SQL patch helpers use explicit field allowlists;
- generic mutation helpers require exactly one affected row instead of reporting false success;
- admin JSON bodies are capped and oversized requests return HTTP 413;
- runtime-facing owner-looking Telegram IDs are replaced by a neutral synthetic example;
- production webhook/cron initialization fails closed on disabled rate limiting, weak/reused secrets, unsigned payment fallback or weak automatic-fulfillment HMAC posture, and readiness reports the unsafe posture;
- payment fallback HMAC verification remains timing-safe and is now covered by the X6 executable gate.

## 1. Critical Telegram update replay receipt

Added `src/lib/criticalUpdateReplay.js`.

The bounded critical set includes:

- successful Stars payments;
- admin payment apply/auto-heal;
- admin auth approval callback;
- giveaway draw/end/publish/destructive confirmation;
- broadcast confirm/pause/resume/stop;
- selected privileged gift/ban/redeem/application acceptance mutations.

State contract:

```text
not critical → no replay storage dependency
critical + no update_id → fail closed
critical + Redis unavailable → fail closed before mutation
first update → processing receipt → handler
handler success → done
handler error/ambiguous outcome → outcome_unknown
processing/done/outcome_unknown replay → HTTP 200 duplicate suppression, no handler call
handler error after claim → outcome_unknown + privacy-safe operator error log
```

The receipt TTL defaults to seven days and is bounded to 1–30 days by `CRITICAL_UPDATE_RECEIPT_TTL_SEC`.

Trade-off: for a selected critical update, an ambiguous handler failure prefers visible under-processing over an automatic duplicate mutation. There is no claim that this replaces domain-level idempotency; it is an additional replay boundary.

## 2. Dynamic SQL allowlists and row-count truth

Added `src/db/safePatch.js` and applied it to:

- `setWorkspaceSetting()`;
- `updateGiveaway()`;
- `updateBroadcast()`;
- `atomicTransitionBroadcast()` extra fields.

Unknown field names are rejected before SQL construction. The generic update helpers now use `RETURNING` and throw `MUTATION_ROW_COUNT_MISMATCH` unless exactly one row was changed.

The allowlists cover only fields used by current canonical callers. A new field requires an explicit code change and regression update.

## 3. Admin request body cap

`readJsonBody()` now:

- pre-checks `Content-Length` where available;
- counts streamed bytes before full buffering;
- checks already-parsed request bodies by serialized byte size;
- throws a typed `RequestBodyTooLargeError`.

Admin auth and admin write endpoints map the error to:

```text
HTTP 413
{"ok":false,"error":"request_body_too_large"}
```

Default limit: 65,536 bytes. Configurable through `ADMIN_WEB_JSON_BODY_MAX_BYTES`, bounded to 4–256 KiB.

## 4. Production security posture gate

`assertEnv()` now recognizes both `prod` and `production` and invokes `collectProductionSecurityPostureErrors()`.

Production fail-fast includes:

- `RATE_LIMIT_ENABLED=true`;
- positive configured abuse-control limits/windows;
- 32+ byte non-placeholder webhook and cron secrets;
- 32+ byte payment payload HMAC when automatic fulfillment is enabled;
- `PAYMENTS_FALLBACK_ALLOW_UNSIGNED=false`;
- 32+ byte admin login/session secrets when admin web is enabled;
- distinct webhook, cron, payment-HMAC and enabled admin secrets;
- positive admin auth limits and body cap.

This is intentionally runtime-initialization-blocking for webhook/cron paths. `/api/health` independently reports `NO_GO` with `production_security_posture_not_ok`. Operators must correct ENV rather than bypass the check.

## 5. Neutral runtime examples

Runtime copy no longer contains `611377976`. User ID examples now use the neutral synthetic value `123456789`.

Audit and privacy tests may retain realistic-looking fixtures because they are non-runtime test data and explicitly verify redaction.

## 6. Timing-safe HMAC

The canonical payment fallback verifier already used `crypto.timingSafeEqual` after STEP588X1. X6 preserves this implementation and adds executable positive/tamper assertions so the P3 audit finding cannot silently regress.

## Changed runtime/source files

- `.env.example`
- `api/admin-web-auth.js`
- `api/admin-web-write.js`
- `api/webhook.js`
- `api/health.js`
- `src/lib/criticalUpdateReplay.js`
- `src/lib/adminWeb/common.js`
- `src/lib/config.js`
- `src/db/safePatch.js`
- `src/db/queries.js`
- `src/bot/bot.js`
- `src/bot/routes/gwAccess.js`
- `package.json`
- `package-lock.json`
- `scripts/preflight.js`
- `scripts/test-bounded-safety-hardening.js`
- `scripts/smoke-bounded-safety-hardening-contract.js`

## Verified locally

- 36 executable X6 assertions PASS;
- 132/132 registered source checks PASS in bounded batches;
- X1 payment: 66 assertions PASS;
- X2 giveaway: 55 assertions PASS;
- X3 broadcast: 35 assertions PASS;
- X4 admin auth: 48 assertions PASS;
- X5 health/privacy: 52 assertions PASS;
- clean `npm ci` and dependency/runtime preflight PASS;
- package-lock, action registry, callback registry, generated action docs, migration pack and function-budget gates PASS;
- one completed `npm audit` reported 0 vulnerabilities; a final repeat was blocked by registry HTTP 502;
- 261/261 repository JavaScript files pass `node --check`.

## Not verified

- production Upstash receipt behavior under actual Telegram retries;
- production handler crash after a partial critical mutation;
- live false-positive/false-negative classification of the selected critical action set;
- production ENV values, readiness posture and successful fail-closed webhook/cron initialization;
- HTTP 413 behavior on the deployed Vercel runtime/proxy boundary;
- live row-count mismatch behavior against stale production records;
- production acceptance for STEP588X1–X5;
- STEP586H1 24-hour observation.

## Exit-gate result

The source exit gate is met: bounded safety footguns are explicit and covered without a broad rewrite. Production acceptance remains open until ENV preflight and controlled replay/body-limit canaries are captured.
