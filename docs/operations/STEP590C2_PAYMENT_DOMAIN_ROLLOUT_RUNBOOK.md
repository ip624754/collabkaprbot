# STEP590C2 — Payment Callback Domain Rollout Runbook

## Preconditions

- deploy only from the exact STEP590C1 baseline or use the STEP590C2 FULL package;
- migrations 048 and 049 must already be in the known production state;
- do not change ENV for this STEP;
- do not use a real commercial purchase merely to test callback routing.

## Local gate

```powershell
npm.cmd ci
npm.cmd run test:payment-domain-extraction
npm.cmd run smoke:payment-domain-extraction-contract
npm.cmd run callbacks:ownership
npm.cmd run callbacks:check
npm.cmd run actions:check
npm.cmd run test:payment-fulfillment-critical
npm.cmd run test:critical-spine
npm.cmd run preflight:source
```

Expected ownership:

```text
Extracted executable owners: 22
Legacy owners: 538
Unresolved callbacks: 0
```

## Deployment

1. Deploy the exact STEP590C2 commit/artifact.
2. Confirm `/api/health?mode=liveness` returns HTTP 200.
3. Confirm public `/api/health` is honest `GO/200` or `NO_GO/503`.
4. Preserve deployment ID and UTC timestamp.

## Bounded user callback canary

Use only your own account and cancel the invoice instead of paying:

1. open Creator PRO and press the buy action;
2. confirm the Telegram Stars invoice appears with the expected product and amount;
3. close/cancel the invoice without payment;
4. repeat for Brand Credits, Brand Plan, Matching and Featured where those products are available;
5. use Founder Sale only if the campaign is active; cancel the invoice.

Verify that no credits, entitlement, request or featured placement is created from invoice rendering alone.

## Bounded admin canary

Safe production checks:

- open Admin → Payments;
- open one existing payment row;
- navigate back to the ledger.

Do not toggle payment acceptance, auto-apply, fallback or matching/featured auto-apply merely for routing evidence. Control toggles belong in Preview/Staging or require an explicit operator change window.

## Log acceptance

The canary must not contain:

```text
unknown_callback
callback_dispatch.missing_handler
callback_dispatch.phase_not_reached
callback_dispatch.extracted_handler_contract
payment_domain.missing_dependency
payment_domain.unreachable_purchase_action
payment_domain.unreachable_admin_action
```

Expected callback actions should complete with `update.ok` and webhook HTTP 200.

## Rollback

No schema or ENV rollback is required. Exact STEP590C1 rollback is possible, but preserve payment and webhook evidence first. If a signed invoice was already paid, do not replay or manually reapply it as part of rollback testing.
