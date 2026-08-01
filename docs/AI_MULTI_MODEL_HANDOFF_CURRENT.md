
## STEP590E4C CURRENT HANDOFF — Curator Operations

- Baseline: operator-pushed STEP590E4B commit `e738784`.
- Result: package `1.3.26`; new `src/bot/domains/curators/`; 23 live callbacks extracted.
- Ownership: 359 extracted / 201 legacy / 7 aliases / 0 unresolved.
- Routes: `curator_operations` owns 16 actions; `curator_management` owns 7 actions.
- QA: E4C 136 assertions PASS; router 2,942 PASS; all prior domain suites PASS; preflight source and portable spine 6/6 PASS under temporary execution-only shims.
- Contracts unchanged: no SQL, ENV, API route, callback key, action guard or visible-copy change.
- Explicit exclusions: `a:cur_ws`/`a:cur_ws_off` remain Workspace-owned; registry-only curator aliases remain legacy.
- Operator gate: `npm.cmd ci`, `npm.cmd audit`, E4C tests, critical spine, preflight, commit/push, Vercel Ready and bounded curator smoke.
- Next: STEP590E5 Admin & Moderation.
