# STEP588X Remediation Roadmap

**Source:** STEP588X independent full-project audit
**Policy:** fix release-blocking correctness before new backoffice features
**Current release state:** HOLD

## STEP588X7H1 — Mandatory Admin Auth Routing Hotfix

**Status:** IMPLEMENTED LOCALLY / PRODUCTION DEPLOY PENDING

Production acceptance after STEP588X7 exposed a routing regression: the registered `a:aw_auth_dec` action was not handled by the real callback router. STEP588X7H1 restores the callback path without changing the STEP588X4 security mechanism. This hotfix must be deployed before admin-web acceptance continues.

---

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
**Actual risk score:** 17/20
**Status:** IMPLEMENTED LOCALLY / PRODUCTION CANARY PENDING

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

### STEP588X2 implementation evidence

- canonical service: `src/db/giveawayAtomicCore.js`;
- manual and cron callers converge on `drawAndFinalizeGiveawayWinnersAtomic()`;
- actor/source, timed lazy-end, winner set, final status and audit share one transaction;
- deterministic eligible-first top-up is common to every caller;
- sponsor replacement is transactional;
- executable regression: `scripts/test-giveaway-draw-critical.js` with 55 assertions;
- source contract: `scripts/smoke-giveaway-single-atomic-path-contract.js`;
- source exit gate is met locally; production manual/replay/cron evidence remains open.

## STEP588X3 — Broadcast Delivery Unknown-State Safety

**Mode:** HEAVY / CRITICAL
**Expected risk score:** 14/20
**Actual risk score:** 16/20
**Status:** IMPLEMENTED LOCALLY / MIGRATION AND PRODUCTION CANARY PENDING

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

### STEP588X3 implementation evidence

- per-attempt claim and compare-and-set receipts in `src/db/queries.js`;
- shared classification in `src/bot/broadcastDeliverySafety.js`;
- shared receipt safety in `src/bot/broadcastDeliveryReceipt.js`;
- QStash and legacy cron convergence;
- stale `sending` quarantine with no automatic reclaim;
- founder-only no-resend reconciliation and Communications visibility;
- atomic Redis Lua for 429 distinct-user window;
- additive migration `049_broadcast_delivery_unknown_state.sql`;
- executable regression: `scripts/test-broadcast-delivery-unknown-critical.js`;
- source contract: `scripts/smoke-broadcast-delivery-unknown-state-contract.js`;
- source exit gate is met locally; production migration/replay/unknown-state evidence remains open.

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

### STEP588X4 implementation evidence

- browser verifier stored only as challenge-bound HMAC and required by status, fallback verification and session exchange;
- Telegram approval/denial uses `a:aw_auth_dec` callback data and the actual allowlisted `ctx.from.id`;
- legacy signed decision GET is non-mutating and returns `410 Gone`;
- Redis Lua performs atomic pending decision, fallback attempt/lockout and approved-to-consumed session creation;
- repeated exchange reuses the same pinned versioned session and cannot mint another;
- `authVersion=2` rejects all pre-X4 sessions automatically;
- configured idle timeout is enforced on session read;
- fallback code defaults off, uses cryptographic RNG, requires one explicit approver actor and is disclosed only to that actor;
- dedicated start/code Redis throttles fail closed when storage is unavailable;
- no PostgreSQL migration is required;
- source implementation is complete; live Telegram/Upstash/browser evidence remains open.

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

### STEP588X5 implementation evidence

- public default is minimal readiness, while explicit liveness is process-only;
- `NO_GO` maps to `503` and `ok=false`;
- full diagnostics require the existing admin-web session and are additionally sanitized;
- DB readiness now uses a real bounded query and Redis retains read/write proof;
- webhook and update middleware logs use action-only summaries plus pseudonymous actor/chat refs;
- shared privacy helpers redact secrets, usernames, emails, IDs and URL query material;
- no new Vercel endpoint and no PostgreSQL migration;
- source implementation is complete; production health/log evidence remains open.

## STEP588X6 — Bounded Safety Hardening

**Mode:** HEAVY
**Expected risk score:** 12/20
**Actual risk score:** 14/20
**Status:** IMPLEMENTED LOCALLY / PRODUCTION ENV PREFLIGHT AND REPLAY CANARY PENDING

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

### STEP588X6 implementation evidence

- selected high-risk Telegram mutations claim a Redis `update_id` receipt before handler execution;
- `processing`, `done` and `outcome_unknown` receipts suppress automatic replay;
- Redis unavailability or a missing critical `update_id` fails closed before mutation;
- `src/db/safePatch.js` enforces explicit field allowlists and exact affected-row truth;
- admin auth/write JSON bodies are capped and return HTTP 413 when oversized;
- production webhook/cron initialization fails closed on disabled rate limiting, weak/reused secrets, unsigned fallback and weak automatic-fulfillment HMAC posture; readiness becomes NO_GO;
- runtime copy uses a neutral synthetic user ID;
- executable regression: `scripts/test-bounded-safety-hardening.js`;
- source contract: `scripts/smoke-bounded-safety-hardening-contract.js`;
- no migration and no new Vercel function are required;
- source exit gate is met locally; production ENV/replay/body-limit evidence remains open.

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


### STEP588X7 implementation evidence

- canonical runner: `scripts/critical-spine/run.js`;
- portable P1 manifest: `scripts/critical-spine/manifest.js`;
- real PostgreSQL suite: `scripts/critical-spine/postgres.js`;
- real Redis/production-function suite: `scripts/critical-spine/redis.js`;
- explicit `PASS / FAIL / NOT_RUN / BLOCKED` semantics;
- strict isolation confirmation and shared-infrastructure acknowledgement;
- portable local result: 6/6 suites PASS, 8/8 P1 roots covered;
- external PostgreSQL/Redis run remains pending because disposable credentials were unavailable.

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
