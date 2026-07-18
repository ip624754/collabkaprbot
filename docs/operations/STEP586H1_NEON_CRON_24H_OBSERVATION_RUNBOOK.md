# STEP586H1 — Neon Cron 24-Hour Observation Runbook

**Purpose:** prove whether the bounded acquisition retry and alert deduplication work in production before opening the next release-candidate STEP.

## Preconditions

Confirm without sharing secret values:

- deployed baseline contains STEP586H1;
- `DATABASE_URL` is the Neon pooled URL;
- `PG_POOL_MAX=1`;
- `PG_CONN_TIMEOUT_MS=1000`;
- support OPS target is configured;
- no migration is pending.

## Deployment check

After deployment, open:

```text
/api/health?tier=fast
```

Expected database block:

```text
configured: true
provider: neon
pooled_url: true
pool_max: 1
connect_timeout_ms: 1000
connect_retry.enabled: true
connect_retry.max_retries: 1
tls_verify_full: true
channel_binding_verify_full: true
```

Expected warning with the current timeout:

```text
database_connect_timeout_aggressive
```

This warning is expected until the observation closes.

## Schedule staggering

The repository contains cron routes, not the external schedule source. In Vercel/QStash scheduler settings, avoid launching the two DB-heavy jobs in the same second.

Recommended:

```text
giveaways-tick: minute 00
broadcast-tick: minute 03
```

Do not create a new API endpoint. Keep both jobs routed through `api/cron_router.js`.

## Observation window

Observe 24 continuous hours after the first successful deployment.

At least once per observation block, inspect:

1. Vercel logs for `[pg.connect.retry]`.
2. Support OPS digest.
3. Full `/api/health` cron section.
4. `giveaways_tick.last_run` and `broadcast_tick.last_run` timestamps/status.

## Expected alert truth

For one job-owned failure, expect one event:

```text
reason: cron_failed
title: <job> не выполнен · <error_class>
```

Do not expect a second `cron_router_failed` for the same exception.

If both jobs fail independently, expect two job-owned events. They may appear in one digest, but neither may suppress the other.

`cron_router_failed` remains valid only for a router/control-plane failure that was not already owned by a job.

## PASS gate

PASS requires all of the following for 24 hours:

- no unexplained `cron_router_failed` duplicate after a job failure;
- both cron `last_run` records continue updating;
- no missed giveaway remains overdue after a subsequent successful tick;
- no active broadcast remains stuck solely because a tick was missed;
- no repeated final `pg_connect_timeout` after the bounded retry, or a clearly bounded count accepted by the operator;
- no duplicate side effect, winner set, payment application or broadcast cursor movement.

## NO-GO conditions

Stop release promotion if any occurs:

- same exception still produces both `cron_failed` and `cron_router_failed`;
- final `pg_connect_timeout` repeats hourly;
- a query is executed twice because of retry;
- a dead client returns to the pool;
- giveaway/broadcast state becomes inconsistent;
- health exposes DB host or credentials;
- cron `last_run` stops advancing without an alert.

## Escalation

If final connect timeouts persist with pooled URL and one retry:

1. increase `PG_CONN_TIMEOUT_MS` from `1000` to `3000` or `5000` as an operator-only ENV change;
2. redeploy;
3. restart the 24-hour window;
4. inspect Neon compute wake-up and connection metrics;
5. keep `PG_POOL_MAX=1`.

Do not add more retries. Do not replay whole cron jobs automatically.

## Evidence template

Record:

```text
Deployment URL / commit:
Observation start UTC:
Observation end UTC:
Health database snapshot:
Cron schedule:
[pg.connect.retry] count by job:
Final cron_failed count by job/error class:
cron_router_failed duplicates:
Latest giveaways_tick last_run:
Latest broadcast_tick last_run:
Giveaway overdue check:
Broadcast stuck check:
Decision: PASS / FAIL / BLOCKED
Notes:
```
