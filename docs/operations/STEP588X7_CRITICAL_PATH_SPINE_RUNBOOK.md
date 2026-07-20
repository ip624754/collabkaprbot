# STEP588X7 — Critical-Path Test Spine Runbook

## Status boundary

The runner and integration suites are implemented. This runbook does not claim that PostgreSQL or Redis integration has run.

## 1. Fast local gate

```bash
npm ci
npm run test:critical-spine
```

Expected:

```text
portable:payments       PASS
portable:giveaways      PASS
portable:broadcast      PASS
portable:admin_auth     PASS
portable:health_privacy PASS
portable:bounded_safety PASS
allP1PortableCovered    true
```

## 2. Auto capability discovery

```bash
npm run test:critical-spine:auto
```

Without external test credentials, PostgreSQL and Redis must be shown as `NOT_RUN`. This is a successful portable run, not integration evidence.

## 3. Prepare disposable PostgreSQL

Use a disposable database or an approved staging database where the test role may create and drop schemas.

Set locally/CI without publishing values:

```text
CRITICAL_TEST_DATABASE_URL=<disposable PostgreSQL URL>
CRITICAL_TEST_CONFIRM_ISOLATED=1
```

The suite creates a random `critical_spine_*` schema and drops it in `finally`.

Do not point the variable at production Neon. If the URL equals `DATABASE_URL`, the runner blocks unless the operator also sets:

```text
CRITICAL_TEST_ALLOW_SHARED_INFRA=1
```

That acknowledgement does not make production use acceptable; it only prevents accidental execution.

## 4. Prepare disposable Redis

Use a dedicated test Upstash database or an approved staging namespace.

```text
CRITICAL_TEST_REDIS_REST_URL=<test URL>
CRITICAL_TEST_REDIS_REST_TOKEN=<test token>
CRITICAL_TEST_CONFIRM_ISOLATED=1
```

The suite uses unique `critical_spine_*`/application test namespaces and deletes known keys in `finally`.

Do not expose Redis tokens in logs or artifacts.

## 5. Strict integration run

```bash
npm run test:critical-spine:integration
```

Expected status:

```text
6 portable suites PASS
integration:postgres PASS
integration:redis PASS
exit code 0
```

Missing capability or missing isolation confirmation must return `BLOCKED` and exit code 2.

## 6. CI report

```bash
npm run test:critical-spine:ci
```

Machine-readable report:

```text
artifacts/critical-path-spine-report.json
```

Do not accept a release gate from console screenshots alone. Preserve the JSON report, commit/tree, test database identity class (`disposable` or `staging`, never credentials), and run timestamp.

## 7. Required evidence review

Review these invariants in the JSON result:

### PostgreSQL

- `committedEffects = 1` for concurrent payment apply;
- payment rollback injection PASS;
- missing ledger fail-closed PASS;
- giveaway single winner set PASS;
- giveaway audit failure rollback PASS;
- broadcast acknowledgement-loss reconciliation PASS;
- broadcast failed receipt quarantined PASS.

### Redis

- production critical receipt claim exactly once;
- `outcome_unknown` suppresses replay;
- production admin throttle bounded;
- one Telegram approval wins;
- concurrent browser exchange returns one session ID.

## 8. Failure handling

If PostgreSQL cleanup fails:

- stop the gate;
- record the schema name from the report/error;
- remove the isolated schema manually;
- do not rerun until cleanup is confirmed.

If Redis cleanup fails:

- retain the unique test prefix from logs;
- delete only that prefix's keys;
- rotate test credentials if exposure is suspected.

If a runtime invariant fails, open a new incident/remediation STEP. Do not weaken assertions to restore green status.

## 9. Release sequence after PASS

```text
strict isolated X7 integration PASS
→ complete X1–X6 production evidence
→ STEP586H1 24-hour observation PASS
→ STEP587 Go/No-Go
→ resume STEP589
```
