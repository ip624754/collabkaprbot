# STEP529 — Web-admin users table density polish

Date: 2026-04-03

## Goal
Tighten the vertical rhythm of `/admin/users` so more useful rows fit on the working operator viewport without reducing clarity or changing the existing read-only contracts.

## Scope
- compress row height, chip sizes, and quick actions inside the users table;
- remove redundant plan/credits chips from the identity cell;
- keep the same columns and the same export / bulk / compare / preset / URL-backed slice behavior;
- add source smoke coverage for the density-specific UI contract.

## Files
- `scripts/admin-web.js`
- `styles/admin-web.css`
- `scripts/smoke-admin-web-users-table-density-contract.js`
- `scripts/preflight.js`
- `package.json`
- `docs/00_CURRENT_STATE.md`
- `docs/process/07_WORK_HISTORY_2026_04.md`

## Acceptance
- `/admin/users` shows a denser table with more rows visible on the same viewport;
- row quick actions remain explicit but visually lighter;
- no overlap regressions in sticky shell / rails flow;
- list/export/bulk/compare contracts remain unchanged.

## QA
- `node --check scripts/admin-web.js`
- `node --check scripts/smoke-admin-web-users-table-density-contract.js`
- `npm run smoke:admin-web-users-table-density-contract`
- `npm run smoke:admin-web-users-row-actions-contract`
- `npm run smoke:admin-web-users-sticky-pagination-contract`
- `npm run smoke:admin-web-users-compare-density-contract`
- `npm run smoke:admin-web-shell-contract`
