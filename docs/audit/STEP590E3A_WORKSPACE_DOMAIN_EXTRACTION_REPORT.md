# STEP590E3A — Workspace Domain Extraction Report

## Verdict

**SOURCE IMPLEMENTATION COMPLETE. FOCUSED QA PASS.**

The approved 39 callback branches were removed from the legacy dispatcher and are reachable through two exact post-user route owners.

## Verified in the implementation environment

- 39/39 approved actions have one extracted owner;
- `workspace_control`: 22 actions;
- `workspace_folders`: 17 actions;
- cumulative ownership: 248 extracted / 312 legacy;
- action registry: 560/560;
- callback consistency: 0 unresolved, 7 aliases;
- Workspace executable tests: 224 assertions PASS;
- callback ownership/reachability: 2,706 assertions PASS;
- prior payment, giveaway, applications/leads and Barter domain suites PASS;
- all 334 JavaScript files under `api/`, `scripts/`, `src/`, and `migrations/` pass `node --check`;
- package-lock consistency PASS;
- source contract confirms the 39 direct legacy branches are absent from `bot.js`;
- no SQL, ENV, API-route, callback-key or product-copy delta.

## Preflight boundary

`npm run preflight:source` passed all gates through the newly added Workspace executable/source contracts and subsequent source linters. It later stopped at `test:bounded-safety-hardening` because the unpacked artifact environment has no installed `dotenv` package (`node_modules` is absent).

Classification: **environment-blocked**, not a confirmed code failure.

A clean dependency install and the remaining dependency-bound/portable spine must be run in the operator repository before commit/deploy acceptance.

## Adversarial checks represented in tests

- unauthorized curator callback recovers before Workspace render;
- denied folder edit does not query PRO limits or open input mode;
- editor without owner privilege cannot delete a folder or write its audit event;
- network mutation and audit event occur exactly once in the executable test;
- payment and lead compatibility seams retain their prior owners;
- missing dependency fails closed;
- foreign actions are rejected by both Workspace handlers.

## Not verified

- operator `npm ci` after applying this artifact;
- dependency-bound full source preflight completion;
- portable critical spine 6/6 on this exact artifact;
- Git commit identity, origin parity and clean worktree after application;
- Vercel deployment and production Telegram callback behavior.
