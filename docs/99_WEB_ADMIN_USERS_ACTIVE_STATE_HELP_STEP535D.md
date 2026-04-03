# STEP535D — Web admin Users active-state sync + help surface

## Goal
Close the remaining UX lie on `/admin/users`: when an operator clicks a cohort or preset, the working slice must actually stay selected after rerender, all active markers must follow that one source of truth, toast feedback should appear near the top of the content area, and the sidebar should expose a short built-in help surface for operators.

## Scope
- `scripts/admin-web.js`
  - fix URL hydration so missing query params do not overwrite freshly selected Users state with defaults;
  - sync Users working-slice setters back into the URL immediately;
  - add `/admin/help` route + view + sidebar entry;
  - show current active slice inside the follow-up action rail.
- `styles/admin-web.css`
  - move toast host to the upper-right content area;
  - add help-surface layout styles.
- `admin.html`
  - bump admin asset query strings to `step535d`.
- Docs
  - update `docs/00_CURRENT_STATE.md`;
  - update `docs/process/07_WORK_HISTORY_2026_04.md`.
- QA
  - add a dedicated source smoke for active-state/help contract.

## Acceptance
- Clicking a cohort keeps that cohort active after rerender.
- Clicking a saved preset keeps that preset card active after rerender.
- URL, top meta strip, and follow-up active-slice label all reflect the same working slice.
- Toast appears near the top-right content area instead of the lower-right corner.
- Sidebar shows `Помощь`, and the help screen explains the main operator workflows without long docs.

## Risk
Low-to-medium UI risk only. No API, DB, or auth contract changes, but this patch touches client-side state hydration, so source smoke and a real browser click-pass are both required.
