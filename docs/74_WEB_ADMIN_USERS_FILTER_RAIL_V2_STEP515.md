# STEP515 — Users filter rail v2

## Goal
Turn `/admin/users` from a basic directory into a stronger ops/audit analysis surface without adding mutations.

## What changed
- Added a second `Filter rail v2` block in `scripts/admin-web.js` with explicit operator filters for plan, credits, channel, recent activity, and payments.
- Extended `api/admin-web-read.js` so list, CSV export, and bulk-copy all accept the same filter rail query params.
- Added `normalizeUsersDirectoryFilters()` plus shared SQL parts in `src/db/queries.js` to keep all user read paths on one contract.
- Added shared user meta fields `has_channel`, `has_payments`, and `last_known_activity_at` and surfaced them in the users table.
- Extended CSV export with `has_channel`, `has_payments`, and `last_known_activity_msk`.
- Added `scripts/smoke-admin-web-users-filter-rail-contract.js` and wired it into source preflight.

## Why this shape
- Keeps the scope narrow and reversible.
- Gives operators much stronger analysis slices without inventing new routes or background jobs.
- Preserves consistency: one filter contract for table view, CSV export, and safe bulk copy.
- Avoids optional analytics-table dependencies in hot admin reads.

## Acceptance
- Operator can filter `/admin/users` by plan, credits, channel presence, recent activity, and payments.
- The same filter rail affects table render, CSV export, and bulk copy.
- Exports and audit trail preserve the stronger slice semantics.
- No destructive actions and no public-flow regressions.

## Risk
Low-to-medium read-path risk only. The main care point is SQL correctness and keeping the new filter logic aligned across list/export/bulk contracts.
