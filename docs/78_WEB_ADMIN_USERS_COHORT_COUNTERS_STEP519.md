# STEP519 — Web Admin users cohort counters / mini topline

Goal

Make `/admin/users` feel more like a control plane by adding a compact cohort topline above the existing cohort chips, without introducing any new write surfaces or a new analytics subsystem.

What changed
- Added a small `Users cohort counters / mini topline` block in `scripts/admin-web.js` above the existing cohort chips.
- Added `getUsersDirectoryCohortCounters()` in `src/db/queries.js` so the same built-in cohorts are counted server-side from the existing users-directory contract.
- Reused the same bounded cohort predicates already present in STEP518, but intentionally forced the counter query to run with `cohortView=all` so the topline keeps showing the full working distribution even when one cohort is active below.
- Extended `src/lib/adminWeb/readModels.js` to expose `cohortTopline` and `filterRail.cohortCounters` to the web shell.
- Added dedicated styles in `styles/admin-web.css` and `scripts/smoke-admin-web-users-cohort-counters-contract.js` for source-side regression checks.

Acceptance
- Operators see compact cohort counters above the cohort chips in `/admin/users`.
- The counters are clickable and reuse the same `data-users-cohort` contract as the chips below.
- Counters follow current search / segment / filter rail, but intentionally ignore the active cohort selection so the full cohort distribution remains visible while drilling in.
- Scope stays read-only and hobby-safe: no new writes, no background jobs, no custom saved-view persistence.

Notes
- This step is intentionally not a new analytics layer. It is a bounded server aggregate over the existing users-directory contract.
- The topline is meant to increase operator scan-speed and decision clarity, not to add more complexity to the page.
