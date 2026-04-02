# STEP524 — Users URL-persisted working views

## Goal
Make the current `/admin/users` working slice survive refresh / reopen and be reusable as a shareable admin link by persisting the full users state-contract into the page URL instead of relying only on in-memory SPA state.

## Scope
- mirror the existing users state-contract into `location.search`;
- read and normalize users state from URL on page load / reopen;
- keep the URL synced when filters, sort, cohort, page, page-size, and presets change;
- add a small operator affordance to copy the current users slice link;
- preserve the current users slice when drilling into `/admin/users/[id]` and returning back.

## Files
- `scripts/admin-web.js`
- `styles/admin-web.css`
- `scripts/smoke-admin-web-users-url-persisted-views-contract.js`
- `package.json`
- `scripts/preflight.js`
- `docs/00_CURRENT_STATE.md`
- `docs/process/07_WORK_HISTORY_2026_04.md`
- `docs/83_WEB_ADMIN_USERS_URL_PERSISTED_VIEWS_STEP524.md`

## Contract
This step does not add backend persistence or a new route family. The existing users state-contract is simply serialized into the users page URL:
- `q`
- `segment`
- `plan_state`
- `credits_state`
- `channel_state`
- `activity_window`
- `payments_state`
- `sort_by`
- `cohort_view`
- `page`
- `limit`

User-card drilldowns append `back=<encoded users href>` so returning to the list lands on the same working slice.

## Acceptance
- `/admin/users` survives refresh and reopen with the same working slice;
- operators can copy the current slice link and reopen it directly;
- user detail back-link returns to the same filtered/paginated users view;
- scope stays read-only and reversible;
- source smoke guards the new URL-persisted views contract.
