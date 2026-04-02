# STEP527 — Users compare density polish + sticky overlap fix

Goal: remove the visible overlay behavior in `/admin/users` during long scroll sessions and tighten the compare surface so pinned cards stay readable on the real operator window size.

Scope:
- collapse the oversized sticky stack into a compact sticky shell with only the controls that truly benefit from staying pinned;
- keep the larger rails (`priority`, `cohort`, `presets`, `compare`, `follow-up`, `bulk`) in normal document flow so they do not visually sit on top of each other during page scroll;
- compress the compare rail from STEP525–526 with denser drill-action cards, tighter card spacing, and a more compact compare meta layout;
- add source-smoke coverage for the new layout contract.

Acceptance:
- no overlap appears while scrolling the long `/admin/users` page;
- compare cards remain bounded to the existing 2–5 pin workflow;
- no new write paths, no new route family, no DB changes, no public-flow changes.
