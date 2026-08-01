# NEW CHAT HANDOFF — STEP590C3

## Current truth

- Canonical source baseline: STEP590C3 on exact STEP590C2.
- Status: SOURCE READY / PRODUCTION GIVEAWAY CALLBACK CANARY PENDING / GLOBAL RELEASE HOLD.
- Extracted callback owners: 29; legacy owners: 531.
- SQL/ENV changes: none.
- STEP589 feature expansion remains HOLD during critical domain extraction.

## Read first

1. `docs/00_CURRENT_STATE.md`
2. `docs/architecture/STEP590C3_GIVEAWAY_BOUNDED_DOMAIN.md`
3. `docs/audit/STEP590C3_GIVEAWAY_DOMAIN_EXTRACTION_REPORT.md`
4. `docs/operations/STEP590C3_GIVEAWAY_DOMAIN_ROLLOUT_RUNBOOK.md`
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
legacy:                 531
```

## Next sequence

```text
operator local QA
→ bounded STEP590C3 production canary
→ STEP590C4 Critical Broadcast Callback Domain Extraction
→ STEP590D Navigation & Shared Telegram UX
```

Do not claim production acceptance from source evidence alone. Do not exercise a real winner draw without a disposable/approved giveaway.
