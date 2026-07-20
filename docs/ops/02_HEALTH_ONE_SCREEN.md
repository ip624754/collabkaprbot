# `/api/health` — operator one-screen guide (STEP588X5)

Health now has three explicit surfaces. Do not treat them as interchangeable.

## 1. Public readiness — default

```text
GET /api/health
```

Response is intentionally coarse:

```json
{
  "ok": true,
  "status": "ready",
  "check": "readiness",
  "system_status": "GO",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "payment_payload_verification": "ok"
  },
  "reason_codes": []
}
```

Contract:

- `GO` → HTTP `200`, `ok=true`;
- `NO_GO` → HTTP `503`, `ok=false`;
- no internal hints, actor IDs, Redis payloads, QStash details, broadcast IDs or OPS event tails.

Use this endpoint for deployment readiness and external monitoring.

## 2. Liveness — process only

```text
GET /api/health?mode=liveness
```

Liveness answers only whether the serverless handler can execute. It does not prove DB/Redis/product readiness.

- healthy process → HTTP `200`, `status=alive`;
- never use liveness alone as a release GO signal.

## 3. Protected diagnostics

```text
GET /api/health?full=1
```

Requirements:

- first authenticate in web-admin;
- the same browser session cookie must be present;
- unauthenticated requests are rejected.

Protected diagnostics contain detailed configuration and operational evidence, but still remove raw QStash payloads/nonces, fallback actor IDs/reasons and recent free-text event tails.

## 4. Safe operator sequence

1. Open public readiness.
2. If HTTP `503`, read `reason_codes`.
3. Sign into web-admin and open protected diagnostics.
4. Resolve the first P0/P1 dependency failure; do not start mass actions while readiness is red.
5. Recheck readiness until it returns HTTP `200` and `GO`.

## 5. Main reason codes

- `database_not_configured`
- `database_url_invalid`
- `database_read_not_ok`
- `redis_read_not_ok`
- `redis_write_not_ok`
- `payments_payload_hmac_key_missing`
- `payments_payload_hmac_minlen_not_ok`
- `payments_fallback_apply_effective`
- `health_compute_failed`

## 6. Logging privacy

Production logs should retain:

- update ID;
- correlation ID;
- update kind and command/callback action;
- pseudonymous actor/chat references;
- sanitized error class/code/message.

They must not retain raw Telegram IDs, usernames, message text, full callback data, payment payloads, auth headers or cookies.
