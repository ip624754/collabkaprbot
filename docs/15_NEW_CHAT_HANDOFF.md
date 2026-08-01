# NEW CHAT HANDOFF — STEP590E3A

## Current truth

- Canonical operator baseline before this STEP: `117c3e8462d85e811a76beaf899f512ff7e3c84a` on `main`.
- STEP590E2: operator accepted for roadmap progression from exact deployment identity plus read-only Barter runtime evidence; disposable mutation canary waived and retained as residual risk.
- STEP590E3A status: SOURCE IMPLEMENTATION COMPLETE / FOCUSED QA PASS / OPERATOR DEPENDENCY GATE PENDING.
- Package: `1.3.21`.
- Extracted callback owners: 248; legacy owners: 312; aliases: 7; unresolved: 0.
- Newly extracted actions: 39.
- SQL/ENV/API-route/callback-key/product-copy changes: none.
- STEP589 feature expansion remains HOLD during the STEP590 architecture program.

## Read first

1. `docs/00_CURRENT_STATE.md`
2. `docs/architecture/STEP590E3A_WORKSPACE_CONTROL_FOLDERS_DOMAIN.md`
3. `docs/audit/STEP590E3A_WORKSPACE_DOMAIN_EXTRACTION_REPORT.md`
4. `docs/operations/STEP590E3A_WORKSPACE_ROLLOUT_RUNBOOK.md`
5. `docs/roadmap/STEP590_MODULAR_MONOLITH_ROADMAP.md`

## New runtime ownership

```text
workspace_control: 22
workspace_folders: 17
```

Cumulative ownership is 248 extracted / 312 legacy / 7 aliases / 0 unresolved.

## Boundary truth

- `src/bot/domains/workspaces/` is an orchestration adapter over existing renderers, repositories and Redis/input-mode helpers.
- `a:ws_pro_buy` remains `payment_purchase` owned.
- `a:wsp_lead_new` remains `lead_acquisition` owned.
- Workspace profile, Instagram, sharing, public Workspace and directory-search actions remain for STEP590E3B/STEP590E3C.
- Actor, owner/editor/curator guards, audit event names, callback keys and visible copy are unchanged.
- No persistent contract changed.

## Verified

- Workspace executable suite: 224 assertions PASS.
- Callback ownership/reachability: 2,706 assertions PASS.
- Registry: 560/560; callback consistency: 248 extracted / 312 legacy / 7 aliases / 0 unresolved.
- Prior payment, giveaway, applications/leads and Barter executable suites PASS.
- All 334 JavaScript files in runtime/tooling scope pass `node --check`.
- Package-lock consistency and focused source contracts PASS.

## Environment-blocked / not verified

- The unpacked artifact has no `node_modules`; `npm run preflight:source` later stops at `test:bounded-safety-hardening` on missing `dotenv`.
- Operator `npm ci`, complete dependency-bound source preflight and portable critical spine are not verified on this exact artifact.
- Git commit/push, Vercel deployment and production Telegram canary are not performed.

## Next sequence

```text
apply PATCH or HOTFIX
→ npm ci + full local gate
→ commit/deploy bounded STEP590E3A
→ STEP590E3B Workspace Profile, Instagram & Sharing
```

Do not start STEP590E3C before STEP590E3B has its own bounded artifact boundary.
