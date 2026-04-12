# STEP571 — Unified Invite Center Layout Polish + Progressive Actions

## Summary
This step keeps Invite/Rewards as one shared user surface for all roles and polishes it into a cleaner summary-first Invite Center.

## What changed
- Renamed the primary invite surface to `Invite Center`
- Reworked the main layout into:
  - invite link / share actions
  - stats (`Invited / Activated`)
  - points wallet (`Available / Pending / Redeemed`)
  - reward progress
- Added progressive actions:
  - `📄 История` appears only when invite/reward data exists
  - `🎁 Обменять баллы` appears only when `Available >= 100`
- Added a compact history screen with:
  - recent invited users
  - recent reward/redeem operations
- Kept profile integration narrow: short points readout only

## Scope
Included:
- invite surface layout polish
- progressive CTA logic
- invite/reward history helper + screen
- short profile points readout

Not included:
- reward logic changes
- ledger redesign
- role-specific invite flows
- broad profile redesign
- new migrations

## Acceptance
- one Invite Center for all roles
- main screen remains summary-first even for active inviters
- `📄 История` stays hidden until data exists
- `🎁 Обменять баллы` stays hidden until reward threshold is reached
- profile shows only a short points readout

## QA
- open Invite Center on a fresh account
- verify no history button on empty state
- verify reward button hidden below 100 available points
- verify history appears after real invite/reward data exists
- verify reward center opens when available points reach 100+

## Result
Invite/Rewards now scale better for active inviters without splitting the flow by role or dumping long lists into the main screen.
