# STEP517 — Web Admin users sort / priority rail

Date: 2026-04-02

Scope:
- added a dedicated `Users sort / priority rail` to `/admin/users` with one-click presets for `Новые`, `Свежие`, `Платящие`, `Тихие`, and `Проблемные`;
- extended the normalized users-directory contract with `sortBy`, shared across list, CSV export, and bulk-copy reads so the operator sees and exports the same ordering;
- upgraded the users SQL meta projection with `payments_count`, `last_payment_at`, and bounded `problem_score`, then reused the same order contract in `listUsersDirectory()` and `exportUsersDirectory()`;
- surfaced stronger row hints (`pay xN`, `banned`, `risk / attention`) so the new priority modes remain explainable instead of feeling magical;
- added `scripts/smoke-admin-web-users-priority-rail-contract.js`, wired into `package.json` and `scripts/preflight.js`.

Acceptance / notes:
- scope stays read-only and bounded: no new write surfaces, no user mutations, no background jobs, no public bot flow changes;
- `problem_desc` is intentionally conservative and transparent: it prioritizes `banned`, `paid-no-channel`, `plan-no-channel`, and stale credit-bearing users, without inventing a broader risk engine.
