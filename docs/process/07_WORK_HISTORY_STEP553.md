# STEP553 — QStash Broadcast Flow-Control Key Hotfix

## Summary
Fixed a narrow broadcast enqueue failure in `src/lib/qstash.js`.

`getBroadcastFlowControl(broadcastId)` previously emitted `broadcast:${id}` as `flowControl.key`. QStash rejects `:` in `flowControl.key`, which caused real admin broadcast fan-out to fail with:

`flowControlKey must be alphanumeric, hyphen, underscore, or period`

The hotfix changes the emitted key to `broadcast.${id}`.

## Scope
Included:
- one narrow change in `src/lib/qstash.js`
- docs sync in `docs/00_CURRENT_STATE.md`
- this work-history entry

Not included:
- payload changes
- recipient logic changes
- dedup redesign
- QStash schedule/cadence changes
- admin UI changes
- migrations

## Code change
Before:
- `broadcast:${id}`

After:
- `broadcast.${id}`

## Why
QStash enforces a restricted charset for `flowControl.key`. The old readable key format used `:`, which is rejected. The new key preserves the same grouping meaning while staying inside the accepted charset.

## Acceptance
This STEP is considered complete if:
- broadcast flow-control keys are emitted in a QStash-safe format
- no other broadcast contract changes are introduced
- no migration is required
- a real broadcast can be rerun without the invalid `flowControlKey` publish failure

## QA
Source QA:
- inspect `src/lib/qstash.js` and confirm `getBroadcastFlowControl(...)` now emits `broadcast.${id}`
- run syntax check on `src/lib/qstash.js`

Live QA still required:
- rerun a real broadcast from admin
- confirm `qstash_publish_failed` no longer reports invalid `flowControlKey`
- confirm normal broadcast queue progression

## Risk
Low risk.

The hotfix changes one service-key format only. It does not change message body, dedup header behavior, recipient selection, or any money/invite/reward path.
