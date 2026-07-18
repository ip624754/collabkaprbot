# STEP586H1 — Neon Cron Connection Resilience & Alert Truth

**Date:** 2026-07-18
**Mode:** HEAVY / production-runtime reliability
**Parent baseline:** STEP586H
**Status:** IMPLEMENTED / LOCAL QA PASS / PRODUCTION OBSERVATION PENDING

## Incident evidence

Production logs supplied by the operator showed both `broadcast-tick` and `giveaways-tick` failing at the database acquisition boundary:

```text
pool.connect()
→ Connection terminated due to connection timeout
→ cause: Connection terminated unexpectedly
```

The failing calls were read entrypoints (`getActiveBroadcast`, `listGiveawaysToEnd`). The SQL statements had not started when the acquisition timed out. No source evidence of partial mutation or data corruption was found.

Operator-confirmed configuration:

- Neon pooled connection string is in use;
- TLS uses `sslmode=verify-full` and `channel_binding=verify-full`;
- `PG_POOL_MAX=1`;
- `PG_CONN_TIMEOUT_MS=1000` remains unchanged.

## Confirmed defects

### 1. No bounded retry before SQL

`src/db/pool.js` attempted one `pool.connect()` and immediately failed the cron job on a transient Neon/Vercel connection timeout.

### 2. Broken session-init client could be returned

If both statement-timeout initialization attempts failed because the connection died, the old code logged the failure but could still return that client to the caller.

### 3. One exception generated two alert families

The job emitted `cron_failed`, rethrew, and `api/cron_router.js` emitted `cron_router_failed` for the same exception.

### 4. Concurrent cron jobs could deduplicate each other

`queueOpsAlert()` deduplicated non-payment events by `reason + kind + user`. Two different cron jobs failing with `cron_failed / cron` inside one window could collapse into one event. That explains why two stack traces could produce only one job-level digest entry.

### 5. Health did not expose safe DB runtime configuration

Operators could not confirm pooler recognition, pool size, connect timeout, retry policy or configuration warnings from `/api/health` without opening Vercel settings.

## Implementation

### Bounded acquisition retry

The pool now performs at most one retry around only:

```text
physical connection acquisition
→ session initialization
```

Policy:

```text
max retries: 1
base delay: 150 ms
jitter: up to 100 ms
```

User SQL is outside this wrapper. Query failures are classified and rethrown, never replayed automatically.

### Dead-client destruction

A client that loses the connection during session initialization is removed with:

```js
client.release(true)
```

A query-time connection termination also destroys that client before release.

### Error classification

Runtime errors carry explicit metadata:

- `pg_connect_timeout`;
- `pg_connection_terminated`;
- `pg_statement_timeout`;
- `pg_query_failed`;
- `cron_job_failed` for non-database job failures.

Metadata includes phase, retry attempted, retry count and bounded error code/message.

### One authoritative cron alert

The job-level catch owns the alert and marks the thrown exception. The router preserves HTTP 500 and logging but suppresses its second digest event for marked job failures.

Alert identity is now:

```text
cron_failed:<job>:<error_class>
```

This means:

- repeated failures of the same job/class are deduplicated;
- `broadcast-tick` and `giveaways-tick` no longer suppress each other;
- true router failures still emit `cron_router_failed`.

### Failure breadcrumbs

A failed cron tick now writes a bounded Redis `last_run` snapshot with:

- `status=error`;
- `error_class`;
- `phase`;
- `retry_attempted`;
- `retry_count`.

### Safe health block

`/api/health` and `?tier=fast` now expose a secret-free `database` block:

- provider classification;
- pooled URL recognition;
- TLS verification flags;
- pool max;
- connection, idle and statement timeouts;
- retry policy;
- warnings.

No hostname, username, password or full connection string is returned.

With the current operator-confirmed `PG_CONN_TIMEOUT_MS=1000`, health intentionally reports:

```text
database_connect_timeout_aggressive
```

This is a warning, not an automatic NO-GO. The 24-hour observation decides whether 1000 ms remains viable after bounded retry.

## Files changed in runtime surface

- `api/cron_router.js`
- `api/health.js`
- `src/bot/cron.js`
- `src/bot/opsAlerts.js`
- `src/db/pool.js`
- `src/db/connectionResilience.js`
- `src/db/errorClassification.js`
- `src/db/poolConfig.js`
- `src/lib/cronFailure.js`

## Preserved invariants

Unchanged:

- `PG_POOL_MAX=1` operator setting;
- `PG_CONN_TIMEOUT_MS=1000` operator setting;
- cron job bodies and order of business operations;
- SQL text and transaction boundaries;
- giveaway locks and deterministic draw logic;
- broadcast cursor, cooldown, QStash and idempotency logic;
- callback IDs;
- schema and migrations;
- payment mechanics;
- Vercel API function count.

## Local verification

Verified:

- first connect timeout followed by successful retry;
- no more than one retry;
- transient session-init failure destroys the first client;
- non-transient setup error is not retried;
- query failure executes once and is not replayed;
- DB error classes and retry metadata;
- one job exception queues one job-owned alert;
- router duplicate suppression marker;
- different cron jobs use different dedup identities;
- pooler recognition for the operator-reported Neon hostname shape;
- health contains no DB hostname;
- dependency/runtime preflight;
- health full/fast contracts;
- runtime proof spine;
- callback registry;
- package-lock consistency;
- npm audit: zero high-severity vulnerabilities.

## Truth boundary

Not verified:

- production Neon wake-up behavior after deploy;
- whether one retry fully removes the observed failures;
- real Vercel cron overlap;
- 24-hour `last_run` continuity;
- actual operator digest formatting in the support chat;
- live database latency distribution;
- live giveaway/broadcast catch-up after a missed tick.

A pre-existing optional `smoke-broadcast-429-atomicity-contract.js` fails on the STEP586H baseline because its expected `saddCardWithExpire` helper is not present and runtime still performs separate `SADD / EXPIRE / SCARD` calls. STEP586H1 does not hide or fix that unrelated broadcast-429 atomicity finding. It remains a separate P1 candidate.
