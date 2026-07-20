# STEP588X6 — Production Rollout Runbook

## Status boundary

Source implementation is complete. This runbook does not claim production acceptance.

## 1. No migration

STEP588X6 has no PostgreSQL migration and no Redis data migration.

## 2. Required production ENV preflight

Before deployment, verify without sharing secret values:

```text
APP_ENV=prod or production
RATE_LIMIT_ENABLED=1
PAYMENTS_FALLBACK_ALLOW_UNSIGNED=0
CRITICAL_UPDATE_RECEIPT_TTL_SEC=604800   # optional; 1–30 days accepted
ADMIN_WEB_JSON_BODY_MAX_BYTES=65536      # optional; 4–256 KiB accepted
```

Confirm these secrets are each at least 32 random bytes and are not reused:

```text
WEBHOOK_SECRET_TOKEN
CRON_SECRET
PAYMENTS_PAYLOAD_HMAC_KEY   # required while automatic fulfillment is enabled
ADMIN_WEB_SECRET            # only when ADMIN_WEB_ENABLED=1
ADMIN_WEB_SESSION_SECRET    # only when ADMIN_WEB_ENABLED=1
```

Confirm configured rate limits and windows are positive.

If webhook/cron initialization logs `Unsafe production env:` or readiness returns `production_security_posture_not_ok`, fix ENV. Do not weaken or bypass `assertEnv()`.

## 3. Deploy

Apply the HOTFIX only over exact STEP588X5, or deploy the STEP588X6 FULL tree.

No SQL command is required.

## 4. Basic health

After deployment:

```text
GET /api/health?mode=liveness → 200
GET /api/health              → 200 GO or honest 503 NO_GO
```

Confirm readiness does not include `production_security_posture_not_ok` and Vercel webhook/cron logs do not contain `Unsafe production env`.

## 5. Critical update replay canary

Use a non-commercial test object and one approved operator account.

Recommended bounded canary:

1. trigger a safe admin broadcast pause/resume or a disposable giveaway draw confirmation;
2. capture the Telegram `update_id` from privacy-safe logs or controlled test instrumentation;
3. replay the identical webhook payload once through an authorized staging/preview route;
4. verify the first call executes the handler;
5. verify the second call returns `200` with `duplicate=true` and does not repeat the mutation;
6. inspect the Redis receipt status as `done` without exposing its raw contents in artifacts;
7. confirm no `webhook.critical_outcome_unknown` log was emitted for the successful canary.

Do not use a real Stars payment as the first replay canary.

## 6. Fail-closed receipt-store canary

Preview/staging only:

1. simulate Redis unavailability;
2. send a selected critical callback;
3. expect HTTP 503 and no domain mutation;
4. send a non-critical navigation callback;
5. confirm it remains outside the replay gate and follows the normal degraded-mode contract.

Do not simulate Redis failure in production.

## 7. Admin body-size canary

With an authenticated preview/staging admin session:

1. send a valid small JSON body to `/api/admin-web-write`;
2. confirm normal response;
3. send a body larger than `ADMIN_WEB_JSON_BODY_MAX_BYTES`;
4. expect HTTP 413 and `request_body_too_large`;
5. confirm no note/draft/write was created.

## 8. Mutation row-count canary

Use a non-existent disposable ID in preview/staging for one generic update path. Confirm the operation fails and does not produce a success receipt/audit claiming a row was changed.

## 9. Rollback policy

Code rollback to STEP588X5 removes the replay receipt and production posture gates. It is security-regressive but does not require data rollback.

Preferred response:

```text
fix-forward
```

Emergency containment:

- disable the affected privileged surface;
- keep payment/giveaway/broadcast release gates on HOLD;
- preserve Redis/log evidence;
- do not replay an `outcome_unknown` critical update automatically.

## Acceptance evidence

Capture:

- deployment identifier and commit/tree;
- ENV presence/length validation without values;
- one successful duplicate-suppression canary;
- one preview fail-closed receipt-store canary;
- one HTTP 413 canary;
- evidence that the domain mutation occurred exactly once;
- absence of new production errors for an observation window.
