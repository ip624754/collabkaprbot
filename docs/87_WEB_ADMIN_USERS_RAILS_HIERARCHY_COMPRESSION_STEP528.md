# STEP528 — Web Admin Users rails hierarchy compression

## Goal
Compress the upper `/admin/users` control plane into two clearer priority levels so the page breathes better on the real operator window while preserving all existing read-only contracts.

## Scope
- keep the current server contract unchanged;
- group the upper rails into `Level 1 · рабочий срез` and `Level 2 · operator helpers`;
- keep `sort / priority`, `cohort`, and `filter rail` as the primary slice-building layer;
- flatten saved presets into compact pills instead of tall cards;
- keep URL-copy + pagination in the helper layer;
- tighten follow-up action cards so the page consumes less vertical space.

## Files
- `scripts/admin-web.js`
- `styles/admin-web.css`
- `scripts/smoke-admin-web-users-rails-hierarchy-contract.js`
- `package.json`
- `scripts/preflight.js`
- `docs/00_CURRENT_STATE.md`
- `docs/process/07_WORK_HISTORY_2026_04.md`

## Acceptance
- no new data sources or write paths;
- upper rails are visually grouped into two levels;
- presets are still one-click and still share the same users state-contract;
- pagination, URL-backed view copy, compare, export, bulk, and follow-up continue to work unchanged.

## QA
Source-level only in this step:
- `node --check scripts/admin-web.js`
- `node --check scripts/smoke-admin-web-users-rails-hierarchy-contract.js`
- `npm run smoke:admin-web-users-rails-hierarchy-contract`
- existing neighboring users smoke contracts

Live verification still required:
- real visual scan of `/admin/users` on the operator window size;
- real long-scroll behavior with the compressed rail hierarchy;
- confirm that the page now feels cleaner without hiding useful controls.
