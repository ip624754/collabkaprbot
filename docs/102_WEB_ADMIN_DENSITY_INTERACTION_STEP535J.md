# STEP535J — Web Admin density + interaction polish

## Goal
Make the current admin shell feel tighter on desktop and more explicit in click/selection feedback without changing any data or write contracts.

## What changed
- Users selection surfaces (`Когорты`, cohort chips, saved presets, slice action cards) now expose stronger active-state signals with differentiated color treatments and `aria-pressed` semantics.
- Admin shell buttons/cards get lightweight press + confirm feedback so clicks feel acknowledged even before the next render settles.
- Sparse `Payments / Founder / Runtime` side areas consume less vertical space on desktop; helper/action zones no longer stretch awkwardly inside tall columns.

## Non-goals
- No API changes.
- No DB/query changes.
- No auth/payment/runtime logic changes.
- No new write-paths.

## Verification
- Source check: `node --check scripts/admin-web.js`
- Source check: `node --check scripts/preflight.js`
- Smoke: `node scripts/smoke-admin-web-density-interaction-contract.js`
- Smoke: existing shell/users/runtime/payments contracts still pass on source level.
