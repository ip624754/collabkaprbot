# STEP562 — Broadcast Draft Recap Layer

## Summary
Implemented the first SWB UX import into Collabka comms: a narrow draft recap layer for broadcast flows.

This step adds operator-facing recap truth before send without changing the current delivery/runtime foundation.

## What changed
- added `buildBroadcastDraftRecap(...)` helper in bot layer
- added remembered default audience support for broadcast drafts
- added dry-run sample targets for the selected audience scope
- added recap block to `Конструктор рассылки`
- added recap-before-send block to broadcast preview / confirm screen
- added preview-only warning clarifying sample targets semantics
- added `listBroadcastAudienceSample(...)` in DB queries
- added source smoke for the recap contract

## Scope
Included:
- operator recap UI
- remembered audience default
- sample targets readout
- preview recap
- docs sync

Not included:
- queue/retry/fan-out rewrite
- post-run report
- first-batch safety hints
- quarantine UX
- migrations
- new callback keys

## Acceptance
- composer shows draft recap
- preview shows recap before send
- sample targets are visible
- preview-only warning is explicit
- remembered default audience is reused on new drafts
- existing broadcast send/preview flow remains intact

## QA
- `node --check src/bot/bot.js`
- `node --check src/db/queries.js`
- `node scripts/actions-registry-check.js`
- `node scripts/callback-consistency-check.js`
- `node scripts/smoke-broadcast-draft-recap-contract.js`

## Risk
Low-medium.

Reason: small operator UX/runtime change in the composer layer, but no changes to delivery engine, queue semantics, or storage schema.
