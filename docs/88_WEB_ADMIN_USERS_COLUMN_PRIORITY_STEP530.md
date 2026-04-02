# STEP530 — Web Admin Users column priority compression

Date: 2026-04-03

## Goal

Tighten the `/admin/users` table on medium-width operator windows without changing the server contract or adding new behavior. The target is cleaner column priority in the existing table: `Segment / Plan / Signals / Last activity` should read faster and occupy less horizontal/vertical noise.

## Scope

- keep the same table contract and the same data surfaces;
- compress `Segment` into compact badges instead of a heavier title + verbose fallback line;
- compress `Plan / credits` into a single tighter cell with one short meta line;
- compress `Signals` into priority chips with bounded overflow instead of letting the column sprawl;
- compress `Last activity` into a single inline chip + date/time rhythm;
- keep export / bulk / compare / presets / URL-backed views unchanged.

## What changed

- Added UI-only helpers in `scripts/admin-web.js`:
  - `usersSignalsPriorityChips()`
  - `usersSegmentBadges()`
  - `usersPlanMicroMeta()`
  - `usersActivityInlineLabel()`
  - `usersSignalsCompactDetail()`
- Switched the users table to `aw-users-table-priority` for narrower column sizing on medium-width layouts.
- Changed table headers from the noisier mixed form to a cleaner priority set:
  - `Пользователь`
  - `Сегмент`
  - `План`
  - `Сигналы`
  - `Активность`
  - `Создан`
- Added compact CSS helpers:
  - `.aw-users-table-priority`
  - `.aw-cell-meta-inline`
  - `.aw-activity-inline`
  - overflow chip styling for compressed signal sets.
- Added source smoke guard: `scripts/smoke-admin-web-users-column-priority-contract.js`.

## Acceptance

- `/admin/users` fits more cleanly on medium-width windows;
- `Segment / Plan / Signals / Активность` read in one faster scan line per row;
- no new write-paths;
- no SQL / route / API contract changes;
- no regression in export / bulk / compare / URL-backed working views.

## QA

Source-level:
- `node --check scripts/admin-web.js`
- `node --check scripts/preflight.js`
- `node --check scripts/smoke-admin-web-users-column-priority-contract.js`
- `npm run smoke:admin-web-users-column-priority-contract`
- `npm run smoke:admin-web-users-table-density-contract`
- `npm run smoke:admin-web-users-row-actions-contract`
- `npm run smoke:admin-web-users-sticky-pagination-contract`
- `npm run smoke:admin-web-users-compare-density-contract`
- `npm run smoke:admin-web-shell-contract`

Live verification still needed:
- medium-width browser check on `/admin/users`;
- scan-speed comparison against STEP529;
- no new overlap/regression during long scroll.
