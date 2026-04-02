# STEP516 — Users table hierarchy polish

## Goal
Make `/admin/users` faster to scan for operator work by improving hierarchy inside each row, without adding new data sources or new write paths.

## What changed
- Rebuilt the users table row layout in `scripts/admin-web.js` so the row now has a stronger hierarchy: user identity first, compact stats second, signals third, and explicit `Last activity` as its own scan layer.
- Added compact stat chips for plan, credits, note presence, signal roles, and activity freshness.
- Split `Last activity` out of the old mixed `Signals` small-text line and made it a dedicated column with relative freshness + exact timestamp detail.
- Tightened the `Created` column into date/time micro-hierarchy instead of one long timestamp string.
- Added dedicated CSS in `styles/admin-web.css` for `aw-users-table`, `aw-user-cell`, `aw-inline-chips`, and `aw-stat-chip` so the table reads as an operator control surface rather than a raw directory.
- Added `scripts/smoke-admin-web-users-hierarchy-contract.js` and wired it into `package.json` + `scripts/preflight.js`.

## Why this shape
- Keeps the step UI-only and reversible.
- Improves scan speed without touching auth, routes, SQL, or write logic.
- Preserves the filter/export/bulk contract from STEP513–515 while making the core list feel more disciplined and easier to operate.

## Acceptance
- `/admin/users` shows a dedicated `Last activity` column.
- Role/payment/channel signals render as compact chips instead of one noisy text line.
- Plan and credits are readable at a glance.
- Row density improves without hiding the underlying identifiers.
- No new mutations, no API shape expansion, no public-flow regressions.

## Risk
Low risk, UI-only. Main care point is keeping the denser row readable across realistic viewport widths.
