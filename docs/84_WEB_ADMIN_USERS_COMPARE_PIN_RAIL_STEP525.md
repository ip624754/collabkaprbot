# STEP525 — Users compare / pin rail

## Goal
Add a narrow read-only compare surface to `/admin/users` so operators can temporarily pin 2–5 user cards and review them side-by-side without losing the current working slice.

## Scope
- extend the users URL state-contract with `pins=...`;
- add a compact `Users compare / pin rail` surface above the table;
- add `Pin / Pinned` quick action in user rows and `Очистить pins` in the compare rail;
- reuse existing user-card, note, workspace, and payments summary data only;
- no new write paths, no background jobs, no destructive actions.

## Notes
- pin state is intentionally temporary and URL-backed, not DB-persisted;
- compare cards stay compact: identity, segment/status, plan/credits/channel/payments, recent activity, note preview, open/remove actions;
- scope stays read-only and reversible.
