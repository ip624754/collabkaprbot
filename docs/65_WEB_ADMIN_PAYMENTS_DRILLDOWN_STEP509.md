# STEP509 — Web Admin payments drilldown polish

## Goal
Turn `/admin/payments` from a summary-only read surface into a usable founder/operator drilldown without introducing any payment writes.

## Scope
- clickable payment rows in `/admin/payments`
- new payment detail route `/admin/payments/[id]`
- one new read contract: `GET /api/admin-web-read?section=payment&id=...`
- payment summary block
- user linkage block
- diagnostics block
- recent payment signals block
- preserved back-to-list flow via `back` query param

## Out of scope
- retries
- overrides
- payout / release
- credits mutation
- raw processor payloads
- queue controls

## Hobby-safe rules
- one read request for list
- one read request for detail
- no polling
- no cron dependency
- no new API file explosion; keep collapsed admin-web API surface

## UI contract
List page keeps existing cards/warnings/groups and adds row drilldown.
Detail page shows:
- header with id / status / amount / source
- linked user context
- payment summary
- diagnostics label + hint
- light event trace
- hints + recent admin audit light

## Risk
Low-to-medium only: mapping current payments table into safe detail view. No write surface added.
