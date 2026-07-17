# STEP584 — Staging Runtime Acceptance Runbook

## Purpose

A bounded, repeatable acceptance gate for a deployed **staging/preview** target before promotion. It verifies remote HTTP boundaries and records machine-readable evidence without exercising payments, broadcasts, database mutations, or end-user Telegram flows.

## Safety model

The command refuses to run unless the operator explicitly acknowledges the exact target origin.

Required:

```bash
export STAGING_BASE_URL="https://<preview-host>"
export ACCEPTANCE_TARGET_ACK="$STAGING_BASE_URL"
```

The acknowledgement must equal the normalized origin exactly. HTTP is rejected except for localhost contract testing.

## Mode A — Observe-only staging acceptance

```bash
npm run acceptance:staging
```

Checks:

1. `GET /api/health` returns HTTP 200.
2. Health reports `ok=true`, `system_status=GO`, no active no-go reasons, Redis read/write OK, payments HMAC minimum OK, and fallback apply OFF.
3. `GET /api/webhook` returns 405.
4. Unauthorized `POST /api/webhook` returns 401.
5. Unsigned `POST /api/qstash/ping` returns 401.

This mode is non-mutating apart from normal platform logs.

## Mode B — Signed QStash delivery convergence

Only after Mode A passes:

```bash
export QSTASH_TOKEN="<local operator secret; never commit>"
export ACCEPTANCE_QSTASH_PUBLISH=1
npm run acceptance:staging
```

The script publishes one signed QStash ping with a unique nonce and polls `/api/health` until:

```text
qstash.ping.last_nonce == generated nonce
```

This proves publish → signed delivery → endpoint verification → Redis breadcrumb → health readback convergence for the staging target.

## Evidence

Generated locally under:

```text
artifacts/runtime_acceptance/STEP584_<timestamp>.json
artifacts/runtime_acceptance/STEP584_<timestamp>.md
```

Do not commit evidence containing private preview hostnames unless intended. The script does not serialize secrets.

## PASS / FAIL rule

- **PASS:** every exercised check passed.
- **FAIL / NO-GO:** any HTTP boundary, health invariant, or requested QStash convergence check failed.
- A Mode A pass does **not** prove QStash delivery.
- A Mode B pass does **not** prove Telegram UX, Neon mutations, Stars payments, broadcasts, or production behavior.

## Manual acceptance still required

After machine checks, an operator should perform one bounded creator/brand navigation smoke in Telegram and record it separately. Do not use real payments or mass messaging as part of this STEP.
