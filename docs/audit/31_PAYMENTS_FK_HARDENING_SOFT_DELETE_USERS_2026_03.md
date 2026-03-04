# Audit note — Payments FK hardening + users soft-delete (STEP302)

Source signal: NotebookLM audit "Уязвимости платежей, навигации и миграций".

## Problem

Two financial ledgers were created with `ON DELETE CASCADE` from `user_id` → `users(id)`:

- `stars_payments.user_id`
- `payments.user_id`

If a `users` row is ever physically deleted (even by mistake), **financial history disappears**, which is unacceptable for:

- audit / reconciliation
- idempotency and webhook safety (charge id uniqueness relies on persisted history)

## Fix (STEP302)

1) Added `migrations/042_payments_fk_hardening.sql`:
   - replaces `user_id` foreign keys to `ON DELETE RESTRICT` (or adds them if missing)
   - leaves operator refs (`applying_by_user_id`, `applied_by_user_id`) as `ON DELETE SET NULL`

2) Added `migrations/043_users_soft_delete.sql`:
   - introduces `users.is_deleted`, `users.deleted_at`
   - introduces optional `users.deactivated_at`, `users.deactivated_reason`

## Operational rule

Never hard-delete users in production. Use soft-delete flags instead.

## QA

- `npm run preflight` passes
- Applying migrations is idempotent
- Existing payment tables keep all rows; hard-delete attempts on a referenced user are restricted
