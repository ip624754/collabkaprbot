# STEP526 — Users compare drill actions polish

Goal: turn the existing pinned compare rail in `/admin/users` into a more action-ready operator surface without leaving the current read-only control plane.

Scope:
- add a compact compare drill-actions block for the current pinned set;
- reuse the existing audited `users_bulk` contract for pinned-copy actions;
- extend the existing audited `users_export` contract with explicit-id (`ids_snapshot`) CSV export for pinned snapshots;
- expose transparent `problemScore`, `problemDesc`, and `isDormantPayer` signals inside compare-card read models so `open top problem` / `open dormant payer` stay explainable.

Acceptance:
- compare rail stays bounded to max 5 pinned users;
- no destructive bulk actions are introduced;
- pinned export/copy/open actions reuse existing safe contracts;
- no DB persistence, no background jobs, no new route family, no public-bot flow changes.
