# STEP590C2 — Critical Payment Callback Bounded Domain

**Mode:** HEAVY / payments architecture
**Risk Score:** 17/20
**Baseline:** STEP590C1
**Runtime posture:** behavior-preserving callback extraction; no schema or ENV change

## Objective

Move the critical payment callback transport layer out of `src/bot/bot.js` into one bounded domain while preserving the existing payment state machines and product semantics.

This STEP does **not** create a new money core. Durable fulfillment remains owned by:

```text
src/bot/paymentFulfillmentCore.js
src/bot/payments/starsHandlers.js
src/bot/payments_fallback.js
```

The new domain owns callback parsing, policy, session creation, invoice dispatch and Telegram-admin payment controls only.

## Domain structure

```text
src/bot/domains/payments/
├── actions.js
├── callbacks.js
├── index.js
├── policy.js
└── route.js
```

## Extracted actions

### Purchase routes — owner `payment_purchase`

```text
a:founder_buy
a:ws_pro_buy
a:brand_buy
a:brand_plan_buy
a:match_buy
a:feat_buy
```

### Administrative routes — owner `payment_admin`

```text
a:admin_pay_accept_toggle
a:admin_pay_auto_toggle
a:admin_pay_fb
a:admin_pay_fb_set
a:admin_pay_fb_off
a:admin_matchfeat_auto_toggle
a:admin_payments
a:admin_pay_view
a:admin_pay_apply
a:admin_pay_autoheal
```

All 16 actions are `post_user` routes because they depend on the canonical application-user context and/or Telegram-admin identity.

## Preserved invariants

```text
one payment action → one executable owner
payment acceptance pause → invoice creation fails closed
invoice payloads remain signed
Redis payment-session TTL remains canonical
ledger missing → fulfillment remains fail-closed
admin apply/auto-heal delegate to the existing atomic fulfillment core
critical Telegram update replay protection remains outside the domain adapter
extracted handlers may not silently fall back to legacy
```

## Dependency boundary

The composition root injects the existing runtime services into the domain. The domain does not import:

- `src/db/queries.js` directly;
- `paymentFulfillmentCore.js` directly;
- Telegram bot construction;
- webhook or cron entrypoints.

This keeps the transport adapter executable in isolation and prevents a second financial implementation.

## Ownership delta

```text
STEP590C1 extracted owners: 6
STEP590C2 extracted owners: 22
STEP590C1 legacy owners: 554
STEP590C2 legacy owners: 538
```

The legacy owner count decreases monotonically by 16.

## Rollback

No persistent contract changes are introduced. Exact rollback to STEP590C1 is technically possible. If a production callback regression is found, prefer a bounded fix-forward and preserve payment ledger/replay evidence before rollback.

## Explicit non-goals

- no Stars price change;
- no callback-key rename;
- no user-copy redesign;
- no payment schema change;
- no change to `APPLYING/APPLIED` semantics;
- no new provider, webhook or serverless function;
- no migration to ORM or TypeScript.
