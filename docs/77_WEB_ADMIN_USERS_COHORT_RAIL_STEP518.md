# STEP518 — Web Admin users operator cohort chips / saved views

Goal

Make `/admin/users` faster for real operator follow-up by adding a narrow cohort-view layer next to the priority rail, without introducing any new write surfaces or a new analytics subsystem.

What changed
- Added a dedicated `Users operator cohort chips / saved views` rail in `scripts/admin-web.js` with one-click built-in cohorts: `Dormant payers`, `Paid no channel`, `Plan no channel`, `Fresh brands`, and `Quiet creators`.
- Extended the normalized users-directory contract in `src/db/queries.js` with `cohortView` so the same cohort slice is reused by list render, CSV export, and bulk-copy payloads.
- Kept cohort predicates intentionally bounded to baseline signals already present in prod: payments count, channel presence, brand plan / brand profile / credits, creator ownership, and `last_known_activity_at`.
- Updated `api/admin-web-read.js` audit reasons so exports and bulk copies record the active cohort alongside other users filters.
- Updated `src/lib/adminWeb/usersExport.js` to include `cohort_view` metadata in CSV and cohort-aware filenames.
- Added `styles/admin-web.css` support for the new rail and `scripts/smoke-admin-web-users-cohort-rail-contract.js` for source-side regression checks.

Acceptance
- Operators can click a cohort chip or choose the same cohort from the saved-view select.
- The same active cohort flows through `/admin/users`, CSV export, bulk copy, and audit trail.
- Scope stays read-only and hobby-safe: no new mutations, no background jobs, no custom-view persistence.

Notes
- `Dormant payers` = users with payments but no fresh known signal for 30+ days.
- `Paid no channel` = users with payments and no connected channel.
- `Plan no channel` = users with an active plan and no connected channel.
- `Fresh brands` = brand-like users with a recent known signal in the last 30 days.
- `Quiet creators` = creators without a fresh known signal for 30+ days.
