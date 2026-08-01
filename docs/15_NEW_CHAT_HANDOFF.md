# NEW CHAT HANDOFF — STEP590E1

## Current truth

- Canonical source baseline: STEP590E1 on exact STEP590D.
- Status: SOURCE READY / PRODUCTION APPLICATIONS-LEADS CANARY PENDING / GLOBAL RELEASE HOLD.
- Extracted callback owners: 120; legacy owners: 440; unresolved: 0.
- Newly extracted actions: 53.
- SQL/ENV changes: none.
- STEP589 feature expansion remains HOLD during the architecture extraction program.

## Read first

1. `docs/00_CURRENT_STATE.md`
2. `docs/architecture/STEP590E1_APPLICATIONS_LEADS_BOUNDED_DOMAINS.md`
3. `docs/audit/STEP590E1_APPLICATIONS_LEADS_DOMAIN_EXTRACTION_REPORT.md`
4. `docs/operations/STEP590E1_APPLICATIONS_LEADS_ROLLOUT_RUNBOOK.md`
5. `docs/roadmap/STEP590_MODULAR_MONOLITH_ROADMAP.md`

## New runtime ownership

```text
application_creator: 13
application_brand:   10
application_deals:   10
lead_acquisition:     5
lead_workflow:       14
lead_audit:           1
```

Cumulative ownership is 120 extracted / 440 legacy / 0 unresolved.

## Boundary truth

- Applications and Leads are separate bounded modules.
- Existing renderers, repositories, rate limits, workspace checks and workflow mutations remain canonical.
- `a:wsp_lead_new` is intentionally lead-acquisition owned because it is the canonical target of `a:send_request_to_creator`.
- `a:ca` is lead-audit owned; generic curation remains for STEP590E4.
- No persistent contract changed.

## Next sequence

```text
operator local QA
→ bounded STEP590E1 production canary
→ STEP590E2 Barter
```

Do not claim production acceptance from source or shim-assisted evidence alone.
