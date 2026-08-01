## STEP590E4A CURRENT HANDOFF — Brand Directory & Profile

- Baseline: STEP590E3C commit `858a0b1`; package `1.3.23`.
- Result: package `1.3.24`; `src/bot/domains/brands/`; 38 actions extracted.
- Ownership: 323 extracted / 237 legacy / 7 aliases / 0 unresolved.
- Payment and applications/deals ownership unchanged; team/curation remain next.
- No SQL, ENV, API route, callback key, guard, pricing or copy change.
- Source QA PASS; operator clean dependency/deploy/runtime acceptance pending.
- Next: STEP590E4B Brand Team & Manager Membership.

# NEW CHAT HANDOFF — STEP590E3C

## Current truth

- Baseline before this STEP: STEP590E3B_R2 source artifact, package `1.3.22`.
- STEP590E3B_R2: operator local source preflight PASS; exact resulting Git/deployment identity was not supplied here.
- STEP590E3C status: SOURCE IMPLEMENTATION COMPLETE / FOCUSED QA PASS / OPERATOR DEPENDENCY GATE PENDING.
- Package: `1.3.23`.
- Extracted callback owners: 285; legacy owners: 275; aliases: 7; unresolved: 0.
- Newly extracted actions: 10.
- SQL/ENV/API-route/callback-key/action-guard/product-copy changes: none.
- STEP589 feature expansion remains HOLD during the STEP590 architecture program.

## Read first

1. `docs/00_CURRENT_STATE.md`
2. `docs/architecture/STEP590E3C_DIRECTORY_SEARCH_PUBLIC_WORKSPACE_DOMAIN.md`
3. `docs/audit/STEP590E3C_DIRECTORY_PUBLIC_WORKSPACE_EXTRACTION_REPORT.md`
4. `docs/operations/STEP590E3C_DIRECTORY_PUBLIC_WORKSPACE_ROLLOUT_RUNBOOK.md`
5. `docs/roadmap/STEP590_MODULAR_MONOLITH_ROADMAP.md`

## New runtime ownership

```text
directory_search:           6
directory_public_workspace: 4
```

Cumulative ownership is 285 extracted / 275 legacy / 7 aliases / 0 unresolved.

## Boundary truth

- `src/bot/domains/directory/` is an orchestration adapter over existing matching, public-profile and monetization helpers.
- `a:wsp_contact_unlock` was legacy-owned in STEP590E3B_R2; it is now `directory_public_workspace` owned and still registered `pay / queue_first`.
- `a:wsp_lead_new` remains `lead_acquisition` owned.
- `db.unlockWorkspaceContactsWithCredits()`, QStash retry, Redis lock/cache and diagnostic helpers remain canonical.
- Actor identity, search limits/state, public contact visibility, pricing, callback keys, visible copy and TTLs are unchanged.
- No persistent contract changed.

## Verified

- Directory/Public Workspace executable suite: 77 assertions PASS.
- Callback ownership/reachability: 2,784 assertions PASS.
- Registry: 560/560; callback consistency: 285 extracted / 275 legacy / 7 aliases / 0 unresolved.
- Workspace A/B, Applications/Leads, Barter, Payment, Giveaway, Broadcast and Navigation suites PASS.
- Package-lock consistency and 353/353 JavaScript syntax checks PASS.
- Focused/dependency-free gates PASS. Full `preflight:source` and portable critical spine 6/6 also PASS under temporary local dependency shims used only to execute the dependency-bound tests.
- No shim or `node_modules` is included in the source tree or release artifacts.

## Environment-blocked / not verified

- `npm ci` on the exact artifact is blocked by the implementation mirror 404 for `xtend@4.0.2`.
- Clean `npm ci`, `npm audit`, and a dependency-backed repeat of the full source/critical gate on the exact artifact remain operator-side because the implementation package mirror returned 404 for `xtend@4.0.2`.
- Git commit/push, exact Vercel deployment identity and production Telegram/credit-unlock canary are not performed here.

## Next sequence

```text
apply PATCH or HOTFIX
→ npm.cmd ci + npm.cmd audit
→ full local source/critical gate
→ commit/deploy bounded STEP590E3C
→ STEP590E4 Brands & Curation
```

Do not start STEP590E4 before STEP590E3C has its own bounded artifact boundary and operator gate.
