# STEP554 — Broadcast Simple Composer + Honest Preview

## Summary
This step adds a clean, operator-first broadcast composer on top of the existing Collabka broadcast infrastructure.

The existing power layer stays in place:
- delivery / queue / retry / QStash fan-out
- outbox truth
- current advanced broadcast path

On top of that, the default `📣 Новая рассылка` path now opens a simpler everyday composer with explicit preview and shared smart routing.

## Why
The underlying broadcast layer was already operationally strong, but the everyday operator path felt heavier than necessary for routine manual sends.

The goal of this step is not to rewrite the engine, but to make the default compose/send path cleaner while preserving the current advanced layer.

## Scope
Included:
- default Simple mode for new broadcasts
- explicit `👁 Preview` self-preview path
- shared smart delivery routing for preview + real send
- simple mode support for text / image / image+text / optional 1 URL button
- button presets / shortcuts
- advanced mode preserved as secondary path
- advanced mode capped to 3 URL buttons in the shared delivery plan
- outbox truth polish (`media yes/no`, `button yes/no`, timestamps, counters)
- docs sync

Not included:
- migrations
- queue/retry rewrite
- QStash redesign
- album support
- unlimited buttons
- broad admin redesign
- scheduling / campaign builder

## Runtime contract
### Composer modes
- Simple mode = default path
- Advanced mode = secondary power path

### Simple mode
Supports:
- text only
- image only
- image + text
- optional 1 URL button
- explicit audience picker
- explicit preview
- send
- clear draft

### Advanced mode
Preserved as the existing broader path, but the shared delivery plan limits URL buttons to 3.

### Smart routing
Shared helper rules:
- text only → `sendMessage`
- image only → `sendPhoto`
- image + short text → `sendPhoto` with caption
- image + long text → `sendPhoto` + text message split
- button attaches to the correct delivery leg depending on the route

### Preview
`👁 Preview` sends a real self-preview into the operator chat.
It does not enqueue recipients and does not create a real broadcast row.

## Acceptance
This step is complete if:
- `📣 Новая рассылка` opens Simple mode by default
- simple mode supports text / image / image+text / optional 1 button
- preview sends an honest self-preview to operator chat
- preview and runtime send use the same routing helper
- advanced mode remains available
- advanced mode still works as the power path
- outbox view shows media/button truth clearly
- no migration is required
- existing delivery/queue/retry layer is preserved

## QA
Source QA:
- `node --check src/lib/broadcast.js`
- `node --check src/bot/bot.js`
- `node --check src/bot/cron.js`
- `node scripts/actions-registry-check.js`
- `node scripts/callback-consistency-check.js`

Live QA still required:
- text-only broadcast
- image-only broadcast
- image + short caption
- image + long text split
- simple mode with 1 button
- advanced mode still sends correctly
- outbox truth matches real sent shape

## Risk
Medium.

Why not low:
- touches real operator broadcast compose/send path
- changes default UX flow for new broadcasts
- introduces shared routing logic between preview and delivery

Why not high:
- no queue/retry rewrite
- no migration
- no engine replacement
- advanced path preserved

## Result
Collabka keeps its strong broadcast infrastructure, but gains a much cleaner default operator composer with honest preview and reusable routing semantics.
