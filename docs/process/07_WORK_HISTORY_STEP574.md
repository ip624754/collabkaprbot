# STEP574 — Pending Reward Resolution Polish

## Summary
This step polishes how pending invite rewards are explained and surfaced for both users and operators.

It does **not** change reward math, ledger semantics, redeem economics, or anti-abuse rules.
The focus is read-model clarity:
- clearer user-facing pending explanations
- clearer admin overdue/stale pending visibility
- next-action hints when pending appears stuck

## Why
The baseline already had:
- pending / confirmed / redeemed states
- user history and redeem UX
- admin invite/reward visibility

What was still weak:
- pending could look like “points exist but just do not spend”
- admin saw stale pending as one number without enough breakdown
- stale pending rows did not show whether they were join-confirm or activation-confirm cases
- there was no compact overdue hint on what to inspect next

## Scope
Included:
- pending reason copy for invite history / reward center
- overdue pending breakdown in admin summary
- stale pending rows with reward-type reason + overdue age
- compact admin next-action hints for stale pending
- docs + smoke update

Not included:
- reward logic changes
- new ledger schema
- bulk confirm/reject tools
- manual reward repair UI
- anti-fraud rewrite
- redeem changes

## What changed
### User-side polish
- pending invite history entries now show a readable reason:
  - `Awaiting join confirmation`
  - `Awaiting activation confirmation`
- reward center explains that pending points are not spendable and why they may still be pending
- invite center keeps `Reward ready` vs `Next reward` more explicit when pending also exists

### Admin-side polish
- summary now shows:
  - `Pending rewards`
  - `Pending overdue`
  - `Join pending overdue`
  - `Activation pending overdue`
- stale pending list now includes:
  - reward type reason
  - pending count
  - pending points
  - oldest due timestamp
  - overdue hours
- admin view adds compact next-action hints for stale pending

## Acceptance
This step is considered complete if:
- user-facing pending states are easier to understand
- admin can distinguish normal pending vs overdue pending
- admin can distinguish join-confirm vs activation-confirm stale items
- no reward math changed
- no new destructive admin actions were introduced

## QA
- `node --check src/db/queries.js`
- `node --check src/bot/bot.js`
- `node scripts/actions-registry-check.js`
- `node scripts/smoke-invite-rewards-contract.js`
- `node scripts/smoke-invite-admin-visibility-contract.js`
- `node scripts/smoke-invite-pending-resolution-contract.js`

## Residual risk
This remains a visibility/copy step only.
If stale pending still accumulates after this, the next step would be an ops/read path or manual resolution design — but only if the new visibility proves that it is actually needed.

## Result
Pending rewards are no longer a grey zone:
- users can see why points are still pending
- operators can see which pending is overdue, what kind it is, and what likely needs inspection next
