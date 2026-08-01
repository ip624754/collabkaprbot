# NEW CHAT HANDOFF — STEP590E3B

## Current truth

- Baseline before this STEP: STEP590E3A source artifact, package `1.3.21`.
- STEP590E3A: operator directed progression after bounded Workspace smoke; exact post-E3A commit/deployment identity was not provided here.
- STEP590E3B status: SOURCE IMPLEMENTATION COMPLETE / FOCUSED QA PASS / OPERATOR DEPENDENCY GATE PENDING.
- Package: `1.3.22`.
- Extracted callback owners: 275; legacy owners: 285; aliases: 7; unresolved: 0.
- Newly extracted actions: 27.
- SQL/ENV/API-route/callback-key/product-copy changes: none.
- STEP589 feature expansion remains HOLD during the STEP590 architecture program.

## Read first

1. `docs/00_CURRENT_STATE.md`
2. `docs/architecture/STEP590E3B_WORKSPACE_PROFILE_INSTAGRAM_SHARING_DOMAIN.md`
3. `docs/audit/STEP590E3B_WORKSPACE_PROFILE_SOCIAL_EXTRACTION_REPORT.md`
4. `docs/operations/STEP590E3B_WORKSPACE_PROFILE_SOCIAL_ROLLOUT_RUNBOOK.md`
5. `docs/roadmap/STEP590_MODULAR_MONOLITH_ROADMAP.md`

## New runtime ownership

```text
workspace_profile: 18
workspace_social:   9
```

Cumulative ownership is 275 extracted / 285 legacy / 7 aliases / 0 unresolved.

## Boundary truth

- `src/bot/domains/workspaces/` remains an orchestration adapter over existing renderers, repositories, Redis, OAuth and input-mode helpers.
- `a:ws_pro_buy` remains `payment_purchase` owned.
- `a:wsp_lead_new` remains `lead_acquisition` owned.
- `a:pm_*`, `a:wsp_open`, `a:wsp_preview`, `a:wsp_contact_req` and `a:wsp_contact_unlock` remain for STEP590E3C.
- Actor/owner checks, audit event names, callback keys, visible copy, OAuth flags and Redis token TTL are unchanged.
- No persistent contract changed.

## Verified

- Workspace profile/social executable suite: 166 assertions PASS.
- Callback ownership/reachability: 2,762 assertions PASS.
- Registry: 560/560; callback consistency: 275 extracted / 285 legacy / 7 aliases / 0 unresolved.
- Workspace control/folders and prior payment, giveaway, applications/leads and Barter suites PASS.
- Package-lock consistency, focused source contracts and 338/338 JavaScript syntax checks PASS.
- Source preflight passes through the STEP590E3B contracts and later stops only on missing `dotenv`; portable critical spine is 5/6 for the same environment reason.

## Environment-blocked / not verified

- The unpacked artifact has no `node_modules`; `npm ci` is blocked by the implementation mirror 404 for `xtend@4.0.2`. Complete dependency-bound preflight and portable spine remain operator-side.
- Git commit/push, exact Vercel deployment identity and production Telegram canary are not performed in this environment.

## Next sequence

```text
apply PATCH or HOTFIX
→ npm ci + full local gate
→ commit/deploy bounded STEP590E3B
→ STEP590E3C Directory Search & Public Workspace
```

Do not start STEP590E4 before STEP590E3C has its own bounded artifact boundary.
