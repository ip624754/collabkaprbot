# STEP535F — Web admin Overview command cockpit + section contract

## Goal
Turn `/admin` into a real command cockpit instead of a flat summary page, while keeping the current hobby-safe single-shell architecture intact.

## What changed
- Added a single `SECTION_MANIFEST` for label / subtitle / route / group / visibility discipline.
- Rebuilt Overview around:
  - main status
  - next owner step
  - three compact workspaces
  - explicit surface-boundary block
- Stored Overview workspace selection in the URL via `overview_workspace`.

## Workspaces
1. **Командный обзор** — health-first cockpit plus next-step guidance.
2. **Payments snapshot** — short monetization truth layer without replacing the full Payments surface.
3. **Последняя активность** — recent admin audit + runtime notes snapshot.

## Why this is the right shape
This lifts scan-speed and founder/operator clarity without adding route rewrites, API expansion, or new write surfaces.

## Non-goals
- no live polling
- no new backend reads beyond the existing overview contract
- no payment/runtime mutation from Overview
- no sidebar redesign beyond section-manifest discipline
