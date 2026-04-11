# STEP560 — Compact Callback Canon / Helper Port for Comms Admin

## Summary
This STEP ports a compact callback canon/helper into the Collabka comms admin layer.

It is the first runtime upstream import from the newer hardening layer and is intentionally narrow:
it standardizes callback construction for broadcast / notice / outbox surfaces without rewriting the broader bot runtime.

## Why
Collabka already had strong operator UX, but callback construction in comms admin remained scattered and partially ad hoc.

That increases long-term drift risk and weakens callback-size discipline under Telegram's callback payload limits.

This STEP introduces one source of truth for comms callbacks while preserving current runtime semantics.

## Scope
Included in this STEP:
- add `src/bot/commsCallbacks.js`
- centralize callback builders for broadcast / notice / outbox admin surfaces
- compact selected option payloads:
  - broadcast audience
  - simple button preset key
  - broadcast blocked tab
- extend `parseCb(...)` for backward-compatible compact-option decoding
- move main comms render surfaces onto the helper/canon
- add a narrow source smoke for the helper contract

## Out of scope
Not included:
- registry action renames
- queue/retry/fan-out redesign
- notice/broadcast lifecycle redesign
- outbox storage changes
- broad callback rewrite across the whole bot
- invite/rewards changes

## What changed
### New helper module
Added:
- `src/bot/commsCallbacks.js`

This module now acts as the canonical builder for:
- broadcast composer/open/list/view/blocked callbacks
- notice admin callbacks
- outbox list/view utility callbacks

### Compact option codes
Applied compact codes for:
- audience selection
- simple button preset selection
- broadcast blocked-tab switching

### Shared parser compatibility
`parseCb(...)` now decodes compact comms option codes back into the same canonical runtime values already used by handlers.

This keeps old payloads valid while allowing newer keyboards to emit shorter payloads.

## Acceptance
This STEP is considered complete if:
- comms admin render surfaces use the callback helper/canon
- compact codes decode back into canonical runtime values
- old callbacks remain accepted
- no action names are removed from the registry
- no migration is required
- no queue/retry runtime behavior changes are introduced

## QA
Source QA performed:
- `node --check src/bot/commsCallbacks.js`
- `node --check src/bot/helpers.js`
- `node --check src/bot/bot.js`
- `node scripts/actions-registry-check.js`
- `node scripts/callback-consistency-check.js`
- `node scripts/smoke-comms-compact-callbacks-contract.js`

## Risk
Low-medium.

The main risk is callback wiring drift inside the comms admin layer.
That risk is reduced by keeping:
- existing action names
- backward parser compatibility
- no queue/runtime rewrite

## Result
Comms admin callback construction is now more compact and more canonical.
This hardens the operator layer without broad rewrite.
