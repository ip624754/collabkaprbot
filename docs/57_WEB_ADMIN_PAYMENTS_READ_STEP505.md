# STEP505 — Web Admin payments read surface v1

## Goal
Add a read-only payments surface to web admin so founder/operator can quickly inspect payment activity, fallback signals, and recent payment rows without introducing any dangerous write action.

## Scope
- New `/admin/payments` page
- Read-only payments snapshot
- Recent payments table
- Compact warning groups and hints
- Overview entry-point into payments surface

## Non-goals
- Retries
- Overrides
- Manual settlement
- Credits mutation
- Payout/release controls

## Hobby-safe contract
- One main read request on page load: `GET /api/admin-web-read?section=payments`
- No polling
- No cron dependency
- No fan-out read pattern

## Acceptance
- Payments page loads from one aggregated read model
- Read-only only
- Summary cards, warnings, groups, and recent rows render cleanly
- Overview links to payments surface
