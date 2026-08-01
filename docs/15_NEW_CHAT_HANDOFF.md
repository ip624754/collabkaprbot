# NEW CHAT HANDOFF — STEP590D

## Current truth

- Canonical source baseline: STEP590D on exact STEP590C4.
- Status: SOURCE READY / PRODUCTION NAVIGATION CANARY PENDING / GLOBAL RELEASE HOLD.
- Extracted callback owners: 67; legacy owners: 493; unresolved: 0.
- SQL/ENV changes: none.
- STEP589 feature expansion remains HOLD during the architecture extraction program.
- STEP590C4 production broadcast canary was not independently evidenced inside this STEP.

## Read first

1. `docs/00_CURRENT_STATE.md`
2. `docs/architecture/STEP590D_NAVIGATION_AND_SHARED_TELEGRAM_UX.md`
3. `docs/audit/STEP590D_NAVIGATION_SHARED_UX_EXTRACTION_REPORT.md`
4. `docs/operations/STEP590D_NAVIGATION_SHARED_UX_ROLLOUT_RUNBOOK.md`
5. `docs/roadmap/STEP590_MODULAR_MONOLITH_ROADMAP.md`

## Runtime ownership

```text
admin_web_auth:          1
admin_web_auth_control:  1
payment_purchase:        6
payment_admin:          10
giveaway_access:         4
giveaway_participant:    2
giveaway_lifecycle:      5
broadcast_composer:     17
broadcast_audience:      2
broadcast_dispatch:      2
broadcast_operations:    7
navigation_shared:       9
telegram_ux_shared:      1
legacy:                 493
```

## Navigation truth

- `src/bot/shared/navigation/` owns Home, Menu, role/mode selection and Guide routing.
- `src/bot/shared/telegramUx/` owns receipt acknowledgement and the canonical legacy alias map.
- shared modules coordinate existing helpers; they do not own payment, giveaway, broadcast, auth or deal business cores.
- old-message alias compatibility remains seven mappings.
- no durable data migration is required.

## Next sequence

```text
operator local QA
→ bounded STEP590D production canary
→ STEP590E1 Applications & Leads
```

Do not claim production acceptance from source evidence alone.
