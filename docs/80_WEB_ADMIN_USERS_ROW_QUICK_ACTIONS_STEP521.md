# STEP521 — Web-admin Users row quick actions

Date: 2026-04-02

## Goal
Make `/admin/users` faster for operator work by adding small row-level quick actions directly inside the user identity cell, without introducing new backend write paths or visual clutter.

## Scope
- add compact row quick actions to each user row:
  - `Карточка`
  - `tg_id`
  - `username`
  - `В корзину` / `В корзине`
- keep the row actions narrow and reuse existing safe contracts:
  - open user card via the existing `/admin/users/[id]` route
  - copy `tg_id` / `username` via the audited `section=users_bulk` read path with `ids=<userId>`
  - basket toggle via the existing client-side selection basket contract
- keep the table scan-friendly; no extra columns, no destructive actions, no write-surface expansion.

## Files
- `scripts/admin-web.js`
- `styles/admin-web.css`
- `scripts/smoke-admin-web-users-row-actions-contract.js`
- `package.json`
- `scripts/preflight.js`
- `docs/00_CURRENT_STATE.md`
- `docs/process/07_WORK_HISTORY_2026_04.md`

## Acceptance
- every user row exposes explicit quick actions without relying only on row click discovery;
- `Карточка` opens the same user detail route as the existing row click;
- `tg_id` and `username` copy from the row through the same audited bulk-copy backend contract;
- `В корзину` toggles the same existing basket state as the row checkbox;
- the patch stays UI/read-only and introduces no new backend write path.

## Risk
Low risk.
The step reuses existing routes and contracts (`users_bulk`, user detail route, selection basket) and only adds a lighter operator entrypoint in the users table.
