# STEP588X Remediation Roadmap

**Source:** STEP588X independent full-project audit
**Policy:** fix release-blocking correctness before new backoffice features
**Current release state:** HOLD

## Gate 0 — Preserve evidence

Before runtime remediation:

- archive the exact STEP588X baseline and hashes;
- retain current OPS logs and payment/giveaway/broadcast evidence;
- do not mutate production records to “clean up” symptoms before root-cause fixes;
- do not claim live exploitation where only source risk is confirmed.

## STEP588X1 — Payment Fulfillment Atomicity & Missing-Ledger Fail-Closed

**Mode:** CRITICAL
**Risk score:** 18/20
**Priority:** first
**Status:** IMPLEMENTED LOCALLY / PRODUCTION ROLLOUT PENDING

### Scope

- unify direct and fallback fulfillment behind one DB transaction service;
- lock payment row, validate amount/product, fulfill, write result and mark APPLIED atomically;
- fail closed when payment ledger is unavailable;
- persist matching/featured parameters durably before fulfillment;
- bind created paid-service rows to unique payment ID;
- delete Redis payment session only after commit;
- preserve user recovery and exact audit evidence.

### Tests

- crash after claim, before mutation;
- crash after mutation, before APPLIED;
- duplicate provider update;
- stale APPLYING reclaim;
- missing payment table;
- Redis session missing;
- matching/featured DB failure;
- concurrent apply attempts;
- no duplicate credits/days/requests.

### Non-goals

- price changes;
- new products;
- refund implementation;
- provider migration.

### Exit gate

No financial/product side effect can commit without the same transaction committing payment APPLIED and result evidence.

### STEP588X1 implementation evidence

- canonical service: `src/bot/paymentFulfillmentCore.js`;
- production adapter: `src/bot/payments_fallback.js`;
- additive schema: `migrations/048_payment_fulfillment_atomicity.sql`;
- executable regression: `scripts/test-payment-fulfillment-critical.js`;
- direct/admin/cron/QStash paths converge on the service;
- source exit gate is met locally; production exit gate remains open until migration, canary and replay evidence.

## STEP588X2 — Giveaway Draw Correctness & Single Atomic Path

**Mode:** CRITICAL
**Expected risk score:** 16/20

### Scope

- repair undeclared transaction metadata in atomic draw;
- route both cron and manual draw through one atomic service;
- preserve deterministic seed/hash selection;
- implement eligible top-up consistently;
- include actor/source in the same audit transaction;
- make sponsor replacement transactional;
- retire delete-plus-loop winner replacement.

### Tests

- requested winners > eligible winners;
- zero eligible;
- insufficient total participants;
- lock contention;
- repeated draw;
- failure after winner insert;
- failure before status update;
- manual and cron parity;
- reproducible seed/audit metadata.

### Exit gate

One service owns draw, winners, status and audit in one transaction for every caller.

## STEP588X3 — Broadcast Delivery Unknown-State Safety

**Mode:** HEAVY
**Expected risk score:** 14/20

### Scope

- introduce delivery unknown/sent-unconfirmed state;
- do not auto-reclaim a delivery after Telegram send may have succeeded;
- add reconciliation workflow and operator visibility;
- make 429 user-set TTL/count operation atomic;
- preserve QStash signature, queue and rate-limit contracts.

### Tests

- send succeeds, DB mark fails once/all retries;
- function termination after send;
- stale claim of queued/retry versus unknown;
- 429 command interruption;
- manual reconciliation;
- duplicate-send negative assertion.

### Exit gate

The system prefers a visible unknown delivery over an automatic duplicate.

## STEP588X4 — Admin Web Auth Challenge Binding & Throttling

**Mode:** CRITICAL
**Expected risk score:** 17/20

### Scope

- browser-bound challenge verifier;
- actual Telegram callback approval bound to approver identity;
- atomic challenge transitions;
- one-time approved-to-consumed session exchange;
- POST-only decision mutation;
- disable fallback code by default in production;
- cryptographic code, attempt counter, lockout and rate limit if enabled;
- enforce idle timeout;
- invalidate all sessions on rollout.

### Tests

- forwarded approval URL/challenge ID;
- second browser exchange;
- parallel approve/deny;
- replay consumed challenge;
- link scanner GET;
- brute-force attempts;
- idle session expiry;
- founder/operator attribution.

### Exit gate

Possession of a URL or challenge ID alone cannot mint an admin session.

## STEP588X5 — Health, Logging Privacy & Readiness Truth

**Mode:** HEAVY
**Expected risk score:** 13/20

### Scope

- public health becomes coarse and secret/actor-free;
- full health requires existing admin auth or dedicated secret on the same endpoint;
- readiness returns 503 on NO_GO;
- redact webhook identifiers/content by default;
- keep precise diagnostics in protected operator surfaces;
- avoid new Vercel endpoint due 11/12 budget.

### Tests

- anonymous health field allowlist;
- protected full health;
- NO_GO HTTP status;
- log redaction snapshots;
- no operator/user identifiers in public response.

## STEP588X6 — Bounded Safety Hardening

**Mode:** HEAVY
**Expected risk score:** 12/20

### Scope

- explicit dynamic SQL field allowlists;
- JSON body size cap and 413;
- update row-count/RETURNING checks;
- timing-safe fallback HMAC comparison;
- neutral runtime examples instead of real IDs;
- production secret-strength/rate-limit posture checks;
- targeted Telegram update dedup for critical mutations.

### Exit gate

Latent footguns are converted to explicit contracts without broad rewrites.

## STEP588X7 — Executable Critical-Path Test Spine

**Mode:** HEAVY
**Expected risk score:** 13/20

### Scope

Add behavior tests that execute:

- real transaction boundaries against isolated PostgreSQL;
- payment crash/replay points;
- giveaway lock/draw/finalize;
- broadcast send/mark ambiguity;
- admin auth races/replay;
- critical webhook update replay;
- Redis atomic scripts.

Retain source-string tests for drift, but do not treat them as runtime proof.

### Quality target

- every P1 root cause has an executable regression test;
- failure injection proves no duplicate financial/delivery/draw side effect;
- source preflight remains fast enough for normal STEP work;
- critical behavior suite can run separately in CI/staging.

## Final release sequence

```text
STEP588X1 payments
→ STEP588X2 giveaways
→ STEP588X3 broadcasts
→ STEP588X4 admin auth
→ STEP588X5 health/privacy
→ STEP588X6 bounded hardening
→ STEP588X7 behavior test spine
→ STEP586H1 24h observation PASS
→ STEP587 Go/No-Go
→ resume STEP589A
```

## Stop conditions

Stop and issue a new incident STEP when:

- production evidence shows actual duplicate fulfillment/delivery/draw;
- a migration is required but production schema differs from source assumptions;
- a fix broadens into price, entitlement or role changes;
- tests cannot distinguish retry-safe from duplicate side effects;
- production secrets or personal data appear in artifacts.
