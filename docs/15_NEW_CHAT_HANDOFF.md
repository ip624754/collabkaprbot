# NEW CHAT HANDOFF — STEP590E2

## Current truth

- Canonical source baseline: STEP590E2 on accepted STEP590E1H5.
- Accepted production commit before this STEP: `af56af594c1de6d6c8a950f4168be7a2c397320f`.
- STEP590E1 deployment and Applications/Deals/Leads canary: PASS.
- STEP590E2 status: SOURCE READY / PRODUCTION BARTER CANARY PENDING / GLOBAL RELEASE HOLD.
- Extracted callback owners: 209; legacy owners: 351; aliases: 7; unresolved: 0.
- Newly extracted actions: 89.
- SQL/ENV/API-route changes: none.
- STEP589 feature expansion remains HOLD during the architecture extraction program.

## Read first

1. `docs/00_CURRENT_STATE.md`
2. `docs/architecture/STEP590E2_BARTER_BOUNDED_DOMAIN.md`
3. `docs/audit/STEP590E2_BARTER_DOMAIN_EXTRACTION_REPORT.md`
4. `docs/operations/STEP590E2_BARTER_DOMAIN_ROLLOUT_RUNBOOK.md`
5. `docs/roadmap/STEP590_MODULAR_MONOLITH_ROADMAP.md`

## New runtime ownership

```text
barter_discovery:      16
barter_official:        9
barter_conversations:  16
barter_offers:         48
```

Cumulative ownership is 209 extracted / 351 legacy / 7 aliases / 0 unresolved.

## Boundary truth

- `src/bot/domains/barter/` is an orchestration adapter over existing renderers and services.
- `a:off_buy` and `a:off_buy_home` remain outside the domain as payment checkout entrypoints.
- Five registry-only/unreferenced Barter keys remain legacy-owned.
- Actor, workspace, owner/manager/moderator guards, audit event names and lifecycle states are unchanged.
- No persistent contract changed.
- A missing import for the existing official verification helper was repaired; no new state machine was introduced.

## Next sequence

```text
operator local QA
→ Vercel deployment
→ bounded STEP590E2 Barter production canary
→ STEP590E3 Workspaces & Directory
```

Do not claim STEP590E2 production acceptance from source or shim-assisted evidence alone.
