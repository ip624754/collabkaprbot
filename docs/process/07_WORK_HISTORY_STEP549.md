# STEP549 — Invite Rewards Contract Freeze (docs-only)

## Summary
This STEP freezes a narrow Collabka invite rewards contract as a docs-only product decision.

It does not change code, database, runtime behavior, invite callbacks, or UI implementation.

The goal is to define the correct reward model before any implementation work begins.

## Why
Collabka already has an invite layer with attribution and `Invited / Activated` logic.

A rewards layer can be valuable, but only if it is based on meaningful referral outcomes rather than noisy opens or spammy growth mechanics.

This STEP freezes that reward logic first, so the future implementation does not drift into:
- rewarding raw opens
- spam incentives
- unclear activation meaning
- ad-hoc redeem logic
- vague anti-abuse behavior

## Scope
Included in this STEP:
- freeze event → points contract
- freeze pending / confirmed logic
- freeze Collabka activation meaning for rewards
- freeze balance model
- freeze primary display surfaces
- freeze starter redeem catalog
- freeze anti-abuse rules
- document the contract in current-state docs
- add a separate reusable canon note for other bots/projects

## Out of scope
Not included:
- code changes
- migrations
- runtime changes
- ledger implementation
- balance implementation
- invite UI changes
- profile UI changes
- redeem flow implementation
- admin override tools
- money rewards
- token rewards
- multi-level referral
- leaderboards

## Frozen reward contract

### Core principle
Reward meaningful referral outcomes, not raw opens.

### Event → points
- `raw_open` → `0`
- `existing_user_hit` → `0`
- `self_invite` → `0`
- `invited_joined` → `+2`
- `invited_activated` → `+10`

### Pending / confirmed
- `invited_joined`:
  - pending first
  - confirmed after 24h

- `invited_activated`:
  - pending first
  - confirmed after 48h

### Activation meaning
For Collabka, the default reward activation meaning is:

- `completed profile`

### Balance model
The contract assumes 3 balance buckets:
- `Available points`
- `Pending points`
- `Redeemed points`

### Main display
Primary surface:
- Invite screen

Primary invite readouts:
- `Invited`
- `Activated`
- `Collabka points`
- `Pending`
- `Redeemed`
- `Next reward`

Secondary surface:
- Profile

Profile readout:
- short `Points balance` only

### Redeem catalog
Starter catalog:
- `100 points → 7 days Pro`
- `250 points → 30 days Pro`

### Anti-abuse
- no reward for raw open
- no reward for self-invite
- no reward for existing user
- one invited user can produce join reward only once
- one invited user can produce activation reward only once
- pending points are not spendable
- future reward implementation must rely on a ledger
- reward record statuses must support:
  - `pending`
  - `confirmed`
  - `rejected`
  - `redeemed`

## Decision
The reward layer is approved as a future product direction, but not yet as a runtime implementation.

Current baseline remains:
- invite layer exists
- rewards contract is frozen
- implementation is deferred
- no gamification expansion beyond this narrow contract is approved

## Acceptance
This STEP is considered complete if:
- the reward contract is documented in `docs/00_CURRENT_STATE.md`
- this work-history file is added
- a separate reusable canon note exists for other bots/projects
- the step remains docs-only
- no runtime behavior is claimed as changed
- no hidden scope is introduced into invite UI or balance logic

## QA
QA for this STEP:
- verify consistency with current invite canon
- verify that rewards do not depend on raw opens
- verify that activation meaning is explicit
- verify that redeem catalog is narrow and product-native
- verify that anti-abuse rules are explicit
- verify that this step makes no code/runtime claims

## Risk
Medium at product level, low at implementation level for this step.

Residual risk remains because this is a docs/product freeze only.
It does not prove that ledger, anti-abuse, timers, or redeem logic already exist in runtime.

## Result
Reward contract frozen.
No code changes.
No runtime changes.
No regressions introduced by this STEP.
