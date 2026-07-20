# STEP588X7 — Executable Critical-Path Test Spine Report

**Date:** 2026-07-20
**Mode:** HEAVY / CRITICAL QA
**Risk Score:** 16/20
**Baseline:** STEP588X6
**Scope:** test infrastructure, failure injection and CI/staging contracts only; no runtime product behavior, database migration or API surface change.

## Verdict

> SOURCE READY / PORTABLE EXECUTABLE SPINE PASS / REAL POSTGRESQL AND REDIS RUN PENDING

STEP588X7 introduces one explicit critical-path test gate instead of treating source-string checks as runtime proof.

The spine has two layers:

1. **Portable runtime layer** — always executable from a normal checkout and maps all eight P1 audit roots to the existing X1–X6 behavioral suites.
2. **External integration layer** — runs production payment/giveaway/broadcast services against an isolated PostgreSQL schema and production replay/admin-auth functions against isolated Redis. Missing infrastructure is reported as `NOT_RUN` or `BLOCKED`, never `PASS`.

## 1. Canonical runner

Added:

```text
scripts/critical-spine/run.js
scripts/critical-spine/manifest.js
```

Commands:

```bash
npm run test:critical-spine
npm run test:critical-spine:auto
npm run test:critical-spine:integration
npm run test:critical-spine:ci
```

Profiles:

- `portable` — runs the six X1–X6 executable suites; no external infrastructure required;
- `auto` — runs portable suites and any configured external capability; absent capabilities are `NOT_RUN`;
- `integration` — runs portable plus PostgreSQL and Redis; absent or unsafe capability is `BLOCKED` with exit code 2;
- `ci` — strict integration plus a machine-readable JSON report.

Truth contract:

```text
executed and passed → PASS
configured but failed → FAIL
not configured in auto profile → NOT_RUN
required but unavailable/unsafe → BLOCKED
```

## 2. P1 root-cause coverage

Portable executable mapping:

| Audit root | Executable suite |
|---|---|
| P1-1 giveaway atomic draw binding defect | `test-giveaway-draw-critical.js` |
| P1-2 non-atomic direct Stars fulfillment | `test-payment-fulfillment-critical.js` |
| P1-3 missing ledger fail-open | `test-payment-fulfillment-critical.js` |
| P1-4 lost Matching/Featured recovery context | `test-payment-fulfillment-critical.js` |
| P1-5 broadcast send/receipt ambiguity | `test-broadcast-delivery-unknown-critical.js` |
| P1-6 split/non-atomic manual draw | `test-giveaway-draw-critical.js` |
| P1-7 transferable admin challenge | `test-admin-web-auth-critical.js` |
| P1-8 weak fallback code/throttling | `test-admin-web-auth-critical.js` |

The manifest makes missing P1 mapping a runner failure instead of a documentation-only concern.

## 3. Real PostgreSQL spine

Added:

```text
scripts/critical-spine/postgres.js
```

The suite creates a random isolated schema, executes production services, then drops the schema in `finally`.

Executed scenarios when `CRITICAL_TEST_DATABASE_URL` is provided:

### Payments

- four concurrent calls to the canonical `applyPaymentFulfillmentAtomic()` service;
- exactly one committed credit side effect and one fulfillment receipt;
- trigger-injected failure after product mutation but before receipt, proving transaction rollback;
- missing payment ledger table, proving product mutation remains blocked.

### Giveaways

- concurrent manual/cron calls to `drawAndFinalizeGiveawayWinnersAtomicCore()`;
- one committed winner set with eligible-first top-up;
- one `gw.winners_drawn` receipt;
- trigger-injected final-audit failure, proving winners and final status roll back together.

### Broadcasts

- DB acknowledgement loss after a committed `sent` receipt, reconciled by durable readback;
- repeated receipt failure after external success, ending in terminal `delivery_unknown` with message evidence and no send function inside the persistence helper.

The integration suite does not send Telegram messages and does not call Stars.

## 4. Real Redis spine

Added:

```text
scripts/critical-spine/redis.js
```

When isolated Upstash credentials are supplied, it executes:

- real concurrent `SET NX` exactly-once admission;
- production `claimCriticalTelegramUpdate()` and `finalizeCriticalTelegramUpdate()` against Redis;
- terminal `outcome_unknown` replay suppression;
- production `consumeAdminAuthRateLimit()` Lua behavior;
- production `approveChallengeFromTelegram()` concurrent approval;
- production `issueSession()` concurrent one-time challenge consume and single session reuse.

All test keys use a unique non-production namespace and are deleted in `finally`.

## 5. Isolation guard

Strict integration is blocked unless:

```text
CRITICAL_TEST_CONFIRM_ISOLATED=1
```

If the test URL equals the application URL, a second explicit acknowledgement is required:

```text
CRITICAL_TEST_ALLOW_SHARED_INFRA=1
```

This prevents an accidental test run against production resources from being treated as routine CI.

## 6. Preflight integration

Added source contract:

```text
scripts/smoke-critical-path-spine-contract.js
```

It verifies:

- all runner commands exist;
- strict modes require PostgreSQL and Redis;
- missing external capabilities cannot become PASS;
- isolation acknowledgements exist;
- production services/functions are executed by integration suites;
- rollback/failure injection exists;
- every P1 root maps to a portable executable suite.

The contract is registered in normal source preflight. The full spine remains a separate gate to avoid doubling normal STEP latency.

## Changed source/tooling files

- `package.json`
- `scripts/preflight.js`
- `scripts/smoke-critical-path-spine-contract.js`
- `scripts/critical-spine/manifest.js`
- `scripts/critical-spine/run.js`
- `scripts/critical-spine/postgres.js`
- `scripts/critical-spine/redis.js`

## Verified locally

- portable critical spine: **6/6 suites PASS**;
- P1 portable executable mapping: **8/8 roots covered**;
- portable assertions executed: payment 66, giveaway 55, broadcast 35, admin auth 48, health/privacy 52, bounded safety 36;
- critical-spine source contract: **28 assertions PASS**;
- `auto` profile without external credentials: PostgreSQL/Redis correctly reported `NOT_RUN`, exit 0;
- strict integration without external credentials: PostgreSQL/Redis correctly reported `BLOCKED`, exit 2;
- clean `npm ci`: PASS;
- dependency/runtime preflight: PASS;
- registered source checks: **133/133 PASS** across the completed preflight segment plus bounded continuation after the long monolithic process exceeded the execution window;
- JavaScript syntax: **266/266 PASS**;
- callback registry: **554 refs / 560 keys / 0 unresolved**;
- generated action registry and migration pack: PASS / no drift;
- supplementary admin render, broadcast overload and Instagram contact-leak invariants: PASS;
- package-lock consistency: PASS;
- `npm audit --audit-level=high`: **0 vulnerabilities**;
- `git diff --check`: PASS.

## Not verified

- real PostgreSQL integration scenarios, because no disposable `CRITICAL_TEST_DATABASE_URL` was available in the implementation environment;
- real Redis/Upstash integration scenarios, because no disposable test credentials were available;
- production Neon/Upstash behavior;
- production rollout acceptance for STEP588X1–X6;
- STEP586H1 24-hour observation.

The existence and syntax of integration tests are verified. Their behavior is not represented as PASS until a strict run produces evidence.

## Exit-gate result

The X7 source exit gate is met: a deterministic, separately runnable critical test spine exists, all eight P1 roots have portable executable regressions, and real infrastructure capability is fail-closed and evidence-bearing.

Release-clean status remains blocked until strict isolated integration, X1–X6 production canaries and STEP586H1 observation are completed.
