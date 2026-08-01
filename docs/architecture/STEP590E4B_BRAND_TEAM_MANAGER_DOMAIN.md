# STEP590E4B — Brand Team & Manager Membership Domain

## Scope

Two post-user callback owners:

- `brand_manager_mode`: 6 actions for entering manager mode, help, mode toggle, brand picker and active-brand selection.
- `brand_team_membership`: 7 actions for owner-facing team gate, invite, username add, list and removal.

The domain reuses existing DB, Redis, rendering, audit and Telegram helpers through an explicit composition dependency seam. No callback key or product behavior is redesigned.

## Exclusions

Payments, applications/deals, Brand directory/profile and curator operations retain their prior owners.

## Ownership exit

`336 extracted / 224 legacy / 7 aliases / 0 unresolved`.
