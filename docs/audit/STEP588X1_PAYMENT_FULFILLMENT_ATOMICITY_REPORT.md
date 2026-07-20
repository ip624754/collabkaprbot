# STEP588X1 — Payment Fulfillment Atomicity & Missing-Ledger Fail-Closed

**Mode:** HEAVY / CRITICAL
**Risk score:** 18/20
**Parent baseline:** STEP588X
**Repository status:** IMPLEMENTED LOCALLY / PRODUCTION ROLLOUT PENDING

## Objective

Make every automatic Telegram Stars product effect commit in the same PostgreSQL transaction as a durable fulfillment receipt and `payments.status = APPLIED`. A missing or unusable canonical payment ledger must block fulfillment.

## Implemented contract

1. `src/bot/paymentFulfillmentCore.js` is the dependency-injected canonical fulfillment service.
2. Direct Stars, admin apply, admin auto-heal, cron auto-heal and QStash retry use the same service through `src/bot/payments_fallback.js`.
3. The service requires a successful strict payment-validation snapshot before any product mutation.
4. It locks the canonical payment row with `FOR UPDATE NOWAIT` and binds user, product kind, amount, currency, invoice payload and Telegram charge ID to the effect.
5. Product mutation, one `payment_fulfillments` receipt and `payment = APPLIED` commit in one transaction.
6. A unique `payment_fulfillments.payment_id` is the durable exactly-once receipt.
7. `fulfillment_context` persists sanitized recovery parameters before fulfillment. Existing durable keys cannot be overwritten by a later attempt; later calls may only fill missing keys.
8. Redis payment sessions are read before apply and deleted only after a confirmed commit or confirmed prior `APPLIED` state.
9. Missing payment row/table/schema/DB adapter fails closed and emits the existing OPS/recovery path.
10. A lost commit acknowledgement is reconciled from the durable `APPLIED + payment_fulfillments` pair. Without durable evidence the result is `commit_unknown`, not a false rollback claim.
11. Post-failure status writes use `setPaymentStatusIfNotApplied()` and cannot regress a concurrently committed `APPLIED` payment.
12. Matching and Featured invoice payloads now use the existing HMAC token signer. Legacy unsigned direct callbacks are accepted only while a matching bound Redis session proves the originating user/product context.
13. Moderated official-channel placement remains manual and outside automatic fulfillment.

## Schema

Migration `048_payment_fulfillment_atomicity.sql` adds:

- `payments.fulfillment_context jsonb`;
- `payments.fulfillment_result jsonb`;
- `payments.fulfillment_version text`;
- `APPLYING` to the payment status constraint;
- `payment_fulfillments` with one row per canonical payment.

The migration is additive. New runtime deliberately fails closed when the migration is absent.

## Product paths owned by the canonical service

- Creator PRO;
- Brand Pass credits;
- Brand Plan and included credits;
- Matching request creation;
- Featured placement creation;
- Founder Creator PRO;
- Founder Brand Plan/credits.

## Behavioral verification

`npm run test:payment-fulfillment-critical` executes an isolated transactional adapter and verifies:

- validation-required fail-closed;
- missing-schema fail-closed;
- exact-once credits and replay;
- rollback after product mutation and before `APPLIED`;
- concurrent apply lock behavior;
- Matching and Featured atomic receipts;
- PRO and Brand Plan atomic paths;
- Founder durable-context requirement;
- ledger amount and charge binding;
- commit acknowledgement reconciliation;
- unresolved commit ambiguity;
- first durable recovery context wins;
- missing DB adapter fail-closed.

This is executable behavior coverage, but it is not a substitute for a disposable real PostgreSQL failure-injection suite planned in STEP588X7.

## Rollout order

1. Apply migration 048/reconcile SQL.
2. Verify columns, constraint and `payment_fulfillments` table.
3. Deploy runtime.
4. Run one controlled low-value Stars canary.
5. Verify one product mutation, one receipt and one APPLIED payment.
6. Replay the same payment/recovery action and verify no second effect.
7. Verify Redis session cleanup occurred only after commit.
8. Review OPS/payment payload issue counters.

## Truth boundary

### Verified locally

- canonical service convergence in source;
- fail-closed ledger behavior in source and executable tests;
- transaction rollback/replay/concurrency behavior in the isolated adapter;
- source preflight checks across the complete registered suite, completed in two consecutive segments because one uninterrupted run exceeded the execution window;
- dependency preflight;
- migration-pack regeneration without drift;
- package install and npm audit in the local environment.

### Not verified

- migration 048 on production Neon;
- live Telegram Stars fulfillment;
- real PostgreSQL concurrent sessions or serverless hard-kill behavior;
- production Redis/QStash/Telegram behavior;
- production canary and replay evidence.

## Release decision

STEP588X1 source implementation is ready for controlled migration-first rollout. The global release remains HOLD until production evidence for this step and the remaining STEP588X2–X7 gates are complete.
