# STEP533 — Users interaction clarity / duplicate-state compression

Date: 2026-04-03

## Goal
Remove the last visible ambiguity on `/admin/users`: make sort/cohort rails feel obviously interactive, compress repeated active-state badges, and reduce explanatory noise without touching the server contract.

## What changed
- `Сортировка и приоритет` is now one-click and visually singular: chips are the control, active state is explicit, and the old duplicate order badge/dropdown layer is gone.
- `Когорты и готовые срезы` is now role-separated: counters are read-only indicators, chips below are the actual control.
- Repeated local state badges were removed from section bodies so the sticky state strip remains the primary current-state summary.
- Preset / compare / follow-up copy was shortened and russified.
- The table meta strip now reads `Пользователи · рабочий список` instead of showing internal step noise.

## Files touched
- `scripts/admin-web.js`
- `styles/admin-web.css`
- `scripts/smoke-admin-web-users-priority-rail-contract.js`
- `scripts/smoke-admin-web-users-interaction-clarity-contract.js`
- `package.json`
- `docs/00_CURRENT_STATE.md`
- `docs/process/07_WORK_HISTORY_2026_04.md`

## Acceptance
- sort chips apply immediately and stay visibly active;
- cohort counters no longer look or behave like the main control;
- local duplicate badges for preset/cohort/slice/pins no longer clutter section bodies;
- `/admin/users` reads like one control plane instead of stacked mini-pages.
