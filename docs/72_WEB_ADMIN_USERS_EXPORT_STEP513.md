# STEP513 — Users Export & Audit Snapshot

## Goal
Turn `/admin/users` from a read-only list into a usable ops/audit workspace without widening the serverless surface:
- add a disciplined CSV export entrypoint inside the existing collapsed `api/admin-web-read.js` handler;
- let operators export the current filtered view or a predefined segment snapshot;
- append every export into admin-web audit so downloads are no longer invisible;
- keep the step hobby-safe and read-first for normal page loads.

## Scope
Included:
- `section=users_export` inside `api/admin-web-read.js` with attachment response;
- shared helper `src/lib/adminWeb/usersExport.js` for scope normalization + CSV generation;
- users-page export controls in `scripts/admin-web.js` and light toolbar layout in `styles/admin-web.css`;
- export-aware `getUsersList()` metadata (`exportOptions`, `exportMeta.recentExport`);
- source smoke `scripts/smoke-admin-web-users-export-contract.js` plus package/preflight wiring;
- docs/current-state/work-history refresh.

Not included:
- XLSX/PDF exports;
- background job generation;
- column customizer;
- destructive bulk actions or user mutations.

## Export contract
Supported scopes:
1. `current` — current page filter (`segment + q`)
2. `audit_snapshot` — all users snapshot
3. `all`
4. `brands`
5. `creators`
6. `curators`
7. `managers`

CSV stays bounded to the existing `exportUsersDirectory()` cap (10 000 rows).
Each export is logged in admin-web audit with actor, scope, filters, rows count, and truncation flag.

## Risk framing
Low risk:
- no new DB schema;
- no money-path or publish-path changes;
- no new public/user-facing flow;
- export load is operator-triggered only.

Residual caution:
- very large `all` exports can still be truncated at 10 000 rows; the operator must narrow filters for a full slice.
