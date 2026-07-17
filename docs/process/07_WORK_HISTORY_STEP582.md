# STEP582 — Preflight Truth Restoration

**Date:** 2026-07-17  
**Mode:** STANDARD stabilization  
**Status:** IMPLEMENTED / LOCAL SOURCE+DEPENDENCY PROOF

## Objective

Restore the release-gate truth identified by STEP581 without product expansion or broad refactoring.

## Implemented

- Repaired dependency detection in `scripts/preflight.js`: dependencies are resolved through their public package entrypoints rather than blocked `package.json` export paths.
- Added `scripts/smoke-preflight-dependency-resolution-contract.js` and its npm script.
- Restored exact callback handlers for unresolved admin user, Outbox, DM-template and broadcast-composer actions.
- Repaired the corrupted `a:admin_outbox_repeat` / broadcast preset callback seam.
- Updated stale source contracts to the current canonical callback-builder API (`commsCb.*`) and current admin communication surface.
- Regenerated the action-key registry and migration pack.

## Verified

- `npm run callbacks:check` — PASS: 553 refs, 559 registry keys, 546 exact handlers, 7 explicit aliases, 0 unresolved.
- `npm run smoke:preflight-dependency-resolution-contract` — PASS.
- `npm run preflight:deps` — PASS, including health shape, fast-tier, Redis-down fault injection and degraded rate-limit smokes.
- Parallel `node --check` over `api/`, `migrations/`, `scripts/`, and `src/` — PASS.
- Source contract chain reached and passed all scripted checks before the serial syntax phase; the remaining syntax and optional invariants were executed separately and passed.
- `npm audit --audit-level=high` — 0 vulnerabilities.

## Not verified

- The single canonical `npm run preflight:source` process did not finish inside the execution environment's command time limit because it serially launches `node --check` for the large JS surface. No assertion failure remained before timeout; equivalent remaining checks were executed separately.
- Full `npm run preflight` as one process was not completed.
- Production deploy, Telegram runtime, Vercel, Neon, Redis and QStash live behavior were not tested.

## Scope boundary

No migrations, reward economics, payment behavior, webhook contract, giveaway settlement, public product UX or admin-web redesign were intentionally changed.

## Next recommended STEP

**STEP583 — Runtime Proof Spine:** bounded live/staging proof for webhook, Redis degradation, QStash retry/convergence and one representative callback path.
