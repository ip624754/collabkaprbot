# STEP588X1 — Production Rollout Runbook

**Purpose:** apply the payment atomicity schema before runtime and collect bounded production evidence.
**Policy:** migration first; no broad payment testing; preserve payment records and OPS evidence.

## Preflight

- Confirm the deployment artifact is STEP588X1.
- Confirm `PAYMENTS_PAYLOAD_HMAC_KEY` is present and production-strength.
- Keep `PAYMENTS_FALLBACK_ALLOW_UNSIGNED=0`.
- Record current payment runtime flags; do not infer hidden Vercel values from the UI.
- Preserve current `payments` rows and payment-related OPS evidence.

## 1. Apply schema

Run migration 048 through the normal migration runner or apply the matching reconcile section.

Expected objects:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name='payments'
  and column_name in ('fulfillment_context','fulfillment_result','fulfillment_version')
order by column_name;

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid='payments'::regclass
  and conname='payments_status_check';

select to_regclass('public.payment_fulfillments') as payment_fulfillments_table;
```

Required evidence:

- all three columns exist;
- status constraint includes `APPLYING`;
- `payment_fulfillments` exists;
- no migration error.

## 2. Deploy runtime

Deploy only after schema verification. New runtime without migration fails closed; do not treat that safety behavior as a successful rollout.

## 3. Controlled canary

Use one low-value, reversible operationally understood product. Record:

- Telegram charge ID;
- canonical payment ID;
- product kind;
- expected amount;
- timestamp;
- before/after product state.

After payment:

```sql
select id, user_id, kind, currency, total_amount, status,
       fulfillment_context, fulfillment_result, fulfillment_version,
       telegram_payment_charge_id, applied_at
from payments
where id = <payment_id>;

select payment_id, product_kind, result, fulfillment_version, created_at
from payment_fulfillments
where payment_id = <payment_id>;
```

Pass conditions:

- payment is `APPLIED`;
- exactly one fulfillment receipt exists;
- product effect occurred exactly once;
- result payload matches the product effect;
- no payment-ledger-unavailable or atomic-apply error alert.

## 4. Replay/idempotency check

Use the approved recovery/admin path for the same payment. Do not create a second charge.

Pass conditions:

- response reports already applied or equivalent safe result;
- product balance/duration/request count does not change;
- receipt count remains one;
- payment remains APPLIED.

## 5. Redis context check

For a session-backed canary, verify the session exists before apply and is absent after commit. A Redis delete failure after commit may leave stale context, but replay must remain harmless because PostgreSQL is authoritative.

## Stop conditions

Stop rollout and preserve evidence when:

- schema objects are incomplete;
- product effect exists without APPLIED + receipt;
- APPLIED exists without a receipt;
- replay changes product state;
- payment status regresses from APPLIED;
- OPS reports `commit_unknown`, `schema_not_ready`, ledger unavailable or payload mismatch.

## Rollback / fix-forward

- Preferred policy: fix forward.
- Runtime rollback is safe while leaving the additive migration in place.
- Do not drop `payment_fulfillments` or fulfillment columns while STEP588X1 runtime is active.
- Do not deploy STEP588X1 runtime before the migration.
