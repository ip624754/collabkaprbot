# STEP520 — Web-admin Users action-ready follow-up rail

Date: 2026-04-02

## Goal
Turn `/admin/users` into a more action-ready operator surface without introducing new mutations or new backend write paths.

## Scope
- add a compact `Users action-ready follow-up rail` above export/bulk so operators can trigger the most common next moves from the current working slice;
- reuse existing safe contracts only:
  - `CSV current slice` via `section=users_export`
  - `copy tg_id` via `section=users_bulk`
  - `copy usernames` via `section=users_bulk`
  - `open top problem users` via `sortBy=problem_desc`
  - `open dormant payers` via `cohortView=dormant_payers` + `sortBy=payments_desc`
- keep the new block purely read/copy/navigate; no destructive bulk actions, no background jobs, no custom persistence.

## Files
- `scripts/admin-web.js`
- `styles/admin-web.css`
- `scripts/smoke-admin-web-users-followup-rail-contract.js`
- `package.json`
- `scripts/preflight.js`
- `docs/00_CURRENT_STATE.md`
- `docs/process/07_WORK_HISTORY_2026_04.md`

## Acceptance
- operator sees a dedicated follow-up block in `/admin/users`;
- the block can export the current slice without manual reconfiguration;
- the block can copy `tg_id` or `usernames` for the current slice through the existing audited bulk-copy path;
- the block can jump into `Top problem users` and `Dormant payers` with one click;
- scope remains read-only / copy-only.

## Risk
Low risk.
The step only reuses existing users export / bulk / sort / cohort contracts and does not expand write surfaces.
