# STEP522 — Users sticky table controls / pagination polish

Date: 2026-04-02

## Goal
Make `/admin/users` steadier for longer manual operator work by keeping the control rails visually present, adding real bounded pagination, and reducing page-drift while scanning larger filtered slices.

## Scope
- sticky control stack for the users page
- real pagination metadata from server to client
- page-size switcher (20 / 35 / 50)
- top/bottom pagination controls
- sticky table headers inside a bounded users-table scroll surface
- docs + source smoke update

## Non-goals
- no new write paths
- no destructive bulk actions
- no background jobs
- no persistence for saved layouts/views
- no user-facing bot flow changes

## Files touched
- `src/db/queries.js`
- `src/lib/adminWeb/readModels.js`
- `scripts/admin-web.js`
- `styles/admin-web.css`
- `scripts/smoke-admin-web-users-sticky-pagination-contract.js`
- `package.json`
- `scripts/preflight.js`
- `docs/00_CURRENT_STATE.md`
- `docs/process/07_WORK_HISTORY_2026_04.md`

## Acceptance
- `/admin/users` keeps its main control rails visible while scanning long tables
- filtered totals are reflected in pagination metadata
- next/prev/first/last navigation works through the same users contract
- page-size switching stays bounded and resets to page 1
- basket state stays available while paging inside the same session
- table header remains readable inside the scrollable users surface

## Risk notes
Low-risk UI/read-model step. No auth, payment, publish, or Telegram callback semantics were changed.
