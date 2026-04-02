# STEP514 — Users bulk utility rail

## Goal
Make `/admin/users` useful for real operator work beyond list browsing and CSV export by adding a safe copy-only utility layer.

## What changed
- Added `src/lib/adminWeb/usersBulk.js` to build bounded newline text lists for `tg_id`, `usernames`, and `user_id`.
- Added `section=users_bulk` inside `api/admin-web-read.js`; the collapsed handler now returns copy payloads for either the current filter or an explicit selection basket.
- Added checkbox selection + `корзина` controls in `scripts/admin-web.js` so operators can copy from either the current filter or a hand-picked set of rows.
- Added `getUsersDirectoryByIds()` in `src/db/queries.js` for safe basket lookups.
- Added `scripts/smoke-admin-web-users-bulk-contract.js` and wired it into `package.json` + source preflight.

## Why this shape
- Keeps the surface hobby-safe and narrow.
- Avoids destructive bulk actions while still giving operators useful leverage.
- Reuses the same bounded query logic already introduced for STEP513 exports.
- Makes copy actions auditable instead of invisible.

## Acceptance
- Operator can copy `tg_id`, `usernames`, or `user_id` for the full current filter.
- Operator can build a lightweight basket from visible rows and copy the same fields from that basket.
- Every copy action writes admin-web audit.
- No new user mutations or public-flow regressions.

## Risk
Low risk. Read-only / copy-only addition inside the existing admin-web surface.
