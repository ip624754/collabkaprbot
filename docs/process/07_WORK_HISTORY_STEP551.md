# STEP551 — Invite Rewards Rollout (foundation + confirm + redeem)

## Summary
This step collapses the previously planned STEP550 / STEP550.1 / STEP551 path into one narrow rollout on top of the existing invite layer.

The runtime now includes:
- invite rewards ledger
- pending accrual for join / activation
- lazy pending → confirmed processing
- available balance unlock
- invite/profile balance readouts
- redeem flow for `7d Pro` and `30d Pro`

## Why
The reward contract was already frozen in docs, but runtime had no ledger, no balance truth, and no redeem path.

Rolling out only redeem first would have been the highest-risk order because it would touch entitlements before there was any honest balance layer.

This step lands the whole narrow path together while still keeping the surface small and anti-abuse-first.

## Scope
Included:
- `migrations/046_invite_reward_ledger.sql`
- reward ledger storage
- join reward pending accrual (`+2`)
- activation reward pending accrual (`+10`)
- lazy confirm progression (24h / 48h)
- available/pending/redeemed balance model
- Invite screen reward readout
- short balance line in profile surfaces
- reward redeem callbacks + confirm flow
- Pro redemption targets (`brand_plan` / `workspace_pro`)

## Out of scope
Not included:
- cashout
- token rewards
- money rewards
- leaderboards
- multi-level referral
- admin manual reward overrides
- broad gamification

## Runtime contract
### Event → points
- `raw_open` → `0`
- `existing_user_hit` → `0`
- `self_invite` → `0`
- `invite_join` → `+2` pending → confirm after 24h
- `invite_activation` → `+10` pending → confirm after 48h

### Activation meaning
Current activation meaning is profile completion:
- brand profile basic 4 fields, or
- creator profile completion (title, contact, verticals, formats, portfolio, about)

### Balance buckets
- `Available points`
- `Pending points`
- `Redeemed points`

### Redeem catalog
- `100 points → 7 days Pro`
- `250 points → 30 days Pro`

### Redeem target rule
- brand-profile users → brand plan Pro
- otherwise workspace owners → workspace Pro on primary owned workspace
- fallback → brand plan Pro

## Acceptance
This step is complete if:
- migration `046_invite_reward_ledger.sql` is present
- invite/reward helpers exist in `src/db/queries.js`
- Invite screen shows balance readouts
- profile surfaces show a short balance line
- `a:share_redeem` / `a:share_redeem_do` exist and are guarded
- self/existing/raw-open cases do not earn points
- a single invited user cannot produce duplicate join or activation rewards
- redeem spends only available points

## QA
Source QA for this step:
- `node --check src/db/queries.js`
- `node --check src/bot/bot.js`
- `node scripts/actions-registry-check.js`
- `node scripts/callback-consistency-check.js`
- `node scripts/smoke-invite-layer-contract.js`
- `node scripts/smoke-invite-rewards-contract.js`

Live QA still required for:
- migration applied in Neon
- invite screen counters + points
- activation after completed profile
- 24h/48h confirmation progression
- redeem of `7d Pro` / `30d Pro`
- correct target application (brand plan vs workspace Pro)

## Risk
Medium.

Why not low:
- touches invite attribution follow-up logic
- introduces a new ledger table
- introduces entitlement redemption

Why not high:
- no cashout
- no token layer
- no broad admin/growth rewrite
- anti-abuse stays narrow and explicit

## Result
Invite rewards are now live in a narrow, product-native form.
No broad gamification was added.
The invite surface remains Telegram-native and compact.
