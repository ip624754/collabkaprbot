# STEP523 — Users saved operator presets

## Goal
Add a compact built-in preset rail to `/admin/users` so operators can jump back to the most useful working slices in one click instead of manually rebuilding the same search / segment / filter / sort / cohort combinations.

## Scope
- add `Users saved operator presets` rail in the web-admin users page;
- keep presets strictly read-only and built on top of the existing users state-contract;
- ship built-in presets for:
  - `Все · новые`
  - `Dormant payers`
  - `Paid no channel`
  - `Plan no channel`
  - `Fresh brands`
  - `Quiet creators`
- detect when the current state still matches a built-in preset and when it has drifted into `Custom slice`;
- add source smoke + docs canon update.

## Files
- `scripts/admin-web.js`
- `styles/admin-web.css`
- `scripts/smoke-admin-web-users-saved-presets-contract.js`
- `package.json`
- `scripts/preflight.js`
- `docs/00_CURRENT_STATE.md`
- `docs/process/07_WORK_HISTORY_2026_04.md`
- `docs/82_WEB_ADMIN_USERS_SAVED_PRESETS_STEP523.md`

## Contract
Presets do not introduce any new backend mutation or persistence surface. They only apply the already existing users state-contract:
- `q`
- `segment`
- `planState`
- `creditsState`
- `channelState`
- `activityWindow`
- `paymentsState`
- `sortBy`
- `cohortView`

Preset application also resets `page` to `0` and keeps the current `pageSize`.

## Acceptance
- operators can return to the built-in working slices in one click;
- active preset is visibly recognized when the current state matches it;
- manual changes after that fall back to `Custom slice` without breaking the page;
- scope stays read-only and reversible;
- source smoke covers the new preset rail contract.
