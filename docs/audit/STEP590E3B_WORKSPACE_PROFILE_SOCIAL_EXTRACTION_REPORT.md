# STEP590E3B — Workspace Profile/Social Domain Extraction Report

## Verdict

**SOURCE IMPLEMENTATION COMPLETE. FOCUSED QA PASS.**

The approved 27 callback branches were removed from the legacy dispatcher and are reachable through two exact post-user route owners.

## Verified in the implementation environment

- 27/27 approved actions have one extracted owner;
- `workspace_profile`: 18 actions;
- `workspace_social`: 9 actions;
- cumulative ownership: 275 extracted / 285 legacy;
- action registry: 560/560;
- callback consistency: 0 unresolved, 7 aliases;
- Workspace profile/social executable tests: 166 assertions PASS;
- callback ownership/reachability: 2,762 assertions PASS;
- Workspace control/folders, payment, giveaway, applications/leads and Barter domain suites PASS;
- package-lock consistency PASS;
- all 338 JavaScript files under `api/`, `scripts/`, `src/`, and `migrations/` pass `node --check`;
- source contract confirms all 27 direct legacy branches are absent from `bot.js`;
- OAuth fail-closed behavior and one-time token creation are represented in executable tests;
- no SQL, ENV, API-route, callback-key or product-copy delta.

## Adversarial checks represented in tests

- profile/social handlers reject foreign actions;
- missing dependencies fail closed;
- profile mode and single-field clear write and audit exactly once;
- public-profile reset writes and audits exactly once;
- hidden Instagram OAuth never reads the Workspace or creates a token;
- misconfigured visible OAuth fails before Workspace/token mutation;
- fully configured OAuth validates the owner Workspace and writes exactly one bounded token;
- payment and lead compatibility seams retain their prior owners.

## Dependency boundary

The implementation archive does not contain `node_modules`. `npm ci` is blocked by the implementation environment package mirror returning HTTP 404 for `xtend@4.0.2`. `npm run preflight:source` passes all gates through the new Workspace profile/social contracts and later stops only at `test:bounded-safety-hardening` because `dotenv` is unavailable. The portable critical spine is 5/6 PASS with the same dependency-only failure. These are classified as environment-blocked, not confirmed product-code failures.

## Not verified

- operator `npm ci` and `npm audit` on the exact artifact;
- complete dependency-bound source preflight and portable critical spine 6/6;
- Git commit identity, origin parity and clean worktree after application;
- Vercel deployment and production Workspace profile/Instagram/sharing behavior.
