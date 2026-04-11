# STEP565 — First-batch safety + next-action hints

## Summary
This STEP adds a narrow operator-safety envelope around the existing Collabka broadcast flow.

It does not change queue / retry / fan-out runtime, storage semantics, or QStash delivery behavior.
It strengthens pre-send and post-send operator guidance only.

## Why
After STEP562 and STEP564, the operator already has:
- recap before send
- compact post-run report

The next missing layer was explicit guidance for what to do:
- before the first batch lands
- right after creating a broadcast
- while reading the broadcast card in running / pending / done states

This STEP closes that gap without broad rewrite.

## Scope
Included in this STEP:
- `First-batch safety` block in broadcast preview screen
- stronger success-screen guidance after `bc_confirm`
- `Next action hints` block in broadcast detail view
- state-aware hints derived from current post-run counters
- smoke script for the new operator-safety contract

## Out of scope
Not included:
- queue / retry redesign
- QStash changes
- blocked subsystem redesign
- quarantine UX
- first-batch throttling or send limits
- migrations
- schema changes

## What changed
### Preview / pre-send
Operators now see a dedicated `First-batch safety` block before pressing `Send`.

The guidance is intentionally short:
- wait for the first batch
- verify sent / retry / skipped / failed
- do not rerun blindly before reading the report

### Success screen
The success screen after broadcast creation now includes:
- first-batch safety reminder
- explicit next action hints

### Broadcast detail card
The broadcast detail card now includes a dedicated `Next action hints` block built from actual delivery state:
- first batch not visible yet
- first wave clean
- retry backlog present
- skipped / failed require cleanup review

## Acceptance
This STEP is considered complete if:
- preview includes `First-batch safety`
- success screen includes stronger next-step guidance
- broadcast card includes `Next action hints`
- hints are state-aware
- queue / retry / fan-out remain unchanged
- no migration is introduced

## QA
- `node --check src/bot/bot.js`
- `node scripts/smoke-broadcast-first-batch-safety-contract.js`
- live-smoke: preview → send → open card → verify hints change with state

## Risk
Low-medium.

The step touches operator copy and card rendering around send/report flow, but leaves delivery runtime unchanged.

## Result
Broadcast flow now has:
- recap before send
- first-batch safety before send
- compact post-run report after send
- next-action hints in the card

This completes the narrow operator-safety contour without broad rewrite.
