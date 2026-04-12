# STEP575 — Invite Center User UX Reframe

## Summary
This step narrows the main user-side invite surface into a cleaner SWB-style structure without changing Collabka invite/reward truth.

It does **not** change reward math, ledger semantics, redeem economics, anti-abuse rules, or admin invite visibility.
The focus is the main Telegram screen contract:
- shorter hub
- summary-first layout
- action-first buttons
- recent invited contacts on the hub
- history / redeem kept as separate entrypoints

## Why
The baseline after STEP571–574 already had:
- working invite link/share/card flows
- invite stats and reward balances
- separate history and reward center callbacks
- pending reward visibility polish

What was still weak:
- the main hub still mixed raw link, invite code, 3 ready texts, stats, and reward hints into one long readout
- actions were there, but the screen still read as a text block instead of an invite center
- activation rate and activation rule were not visible at a glance
- recent invited contacts were hidden behind history instead of helping the hub feel live

## Scope
Included:
- reframe the main invite hub into `Summary / Actions / Points / Reward / Recent invited contacts`
- add `Activation rate`
- add `Activation rule: completed profile`
- show up to 3 recent invited contacts on the hub
- move raw link + invite code utility into `Link + copy`
- rename action wording to `Link + copy`, `Invite card`, `Invite history`, `Redeem`, `Refresh`
- tighten history/redeem naming to match the cleaner hub contract
- add source smoke for the new hub contract
- docs update

Not included:
- reward-logic rewrite
- new ledger design
- new pending statuses
- new callback families
- admin invite analytics redesign
- migrations

## What changed
### Main invite hub
- removed the old raw-link + invite-code + 3 ready invite texts dump from the primary screen
- now shows:
  - `Invited`
  - `Activated`
  - `Activation rate`
  - `Activation rule: completed profile`
- keeps a compact `Actions` block:
  - `📨 Share invite`
  - `🔗 Link + copy`
  - `🧾 Invite card`
- keeps points + reward summary without changing current balance truth
- shows up to 3 `Recent invited contacts`
- hints to open `Invite history` when more invitees exist than the hub preview shows

### Supporting surfaces
- `Link + copy` now carries the raw link + invite code utility that used to clutter the hub
- `Invite history` wording is aligned to the new contract and now repeats activation rate / activation rule for quick context
- reward surface wording is tightened to `Redeem for Pro` / `Redeem`

## Acceptance
This step is considered complete if:
- the main invite screen is visibly shorter and cleaner than STEP574
- activation rate is visible on the hub
- activation rule is visible on the hub
- recent invited contacts appear on the hub when data exists
- history remains a separate surface
- raw link utility still exists, but no longer clutters the main hub
- reward truth stays unchanged
- no new callback family or schema change is introduced

## QA
- `node --check src/bot/bot.js`
- `node scripts/smoke-invite-rewards-contract.js`
- `node scripts/smoke-invite-hub-ux-contract.js`
- `node scripts/actions-registry-check.js`

## Residual risk
This is still a render-contract step only.
Live Telegram verification is still required for:
- invite hub readability on real chat messages
- conditional `Invite history` / `Redeem` button visibility
- recent-contact density on small screens
- updated `Link + copy` / `Invite card` wording in real user flow

## Result
Invite Center now reads like a compact invite hub instead of a long mixed text block:
- summary first
- actions second
- points / reward third
- recent invite proof on the same screen
- details kept in history / redeem instead of the main hub
