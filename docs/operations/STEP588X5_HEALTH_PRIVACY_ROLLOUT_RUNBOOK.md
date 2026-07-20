# STEP588X5 — Production rollout runbook

No SQL migration is required.

## Pre-deploy

1. Preserve STEP588X4 auth rollout evidence.
2. Confirm external monitors can accept HTTP 503 as readiness failure.
3. Keep `ADMIN_WEB_ENABLED` and admin-session configuration valid if protected diagnostics are required.
4. Optional: set a dedicated `LOG_PII_HASH_KEY` with at least 32 random bytes. Otherwise the logger derives its pseudonymization key from existing admin/webhook secrets.

## Deploy

Deploy the STEP588X5 runtime as one unit. Do not cherry-pick only `api/health.js` without the policy/auth/privacy modules.

## Acceptance

### Public readiness

- request `/api/health` anonymously;
- confirm only allowlisted fields are returned;
- confirm no `ops`, `qstash`, `broadcast`, `payments`, `redis`, `database`, `env` or `no_go_reasons` object is public;
- in a controlled degraded Preview, confirm `NO_GO`, `ok=false` and HTTP 503.

### Liveness

- request `/api/health?mode=liveness`;
- confirm HTTP 200 and no dependency blocks.

### Protected diagnostics

- request `/api/health?full=1` without a session and confirm rejection;
- sign in to web-admin in Browser A and retry;
- confirm detailed diagnostics are available but no QStash raw payload/nonce, fallback actor/reason or OPS event tail is present.

### Log privacy

Generate controlled test events using test accounts:

- `/start` command;
- ordinary text message;
- callback with parameters;
- rejected pre-checkout payload;
- one expected error.

Inspect Vercel logs and confirm there are no raw Telegram user/chat IDs, usernames, message fragments, full callback data, payment payloads, auth headers or cookies. Pseudonymous `actor_ref` / `chat_ref` are allowed.

## Rollback

Runtime rollback to STEP588X4 is privacy- and readiness-regressive. Prefer fix-forward. If health breaks deployment routing, temporarily use liveness only for process monitoring while fixing readiness; do not declare release GO from liveness.
