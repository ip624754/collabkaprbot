# STEP590I Handoff Notes

## Baseline

- production commit: `0defa47`
- package before: `1.3.37`
- package after: `1.3.38`
- STEP590H verdict: `PRODUCTION_ACCEPT_STEP590H_ADMIN_WEB_FRONTEND_DECOMPOSITION`

## Result

Architecture boundaries from STEP590F, STEP590G1-G3 and STEP590H are enforced by one manifest-driven source gate, fail-closed mutation tests and source-preflight integration.

Protected invariants:

- `src/db/queries.js` remains a SQL-free compatibility façade under 420 lines;
- `src/bot/cron.js` remains a bounded façade under 40 lines;
- five QStash API routes delegate to exact worker owners;
- bounded repository/job directories keep required owner files;
- admin web keeps one public entry, entry budget under 2,500 lines and six bounded view factories;
- moved view declarations cannot return to the entry;
- bounded view modules cannot call `fetch` or `/api/*` directly;
- package and package-lock remain version-aligned.

## Runtime delta

None. No routes, functions, migrations, SQL, ENV, callbacks, Telegram flows, payment semantics or frontend behavior changed.

## QA boundary

Focused STEP590I and F/G/H regressions PASS; portable critical spine 6/6 PASS under temporary shims removed before packaging. Full `preflight:source` exceeded the artifact execution timeout and must be completed by the operator.
PATCH/HOTFIX/FULL parity is exact across 1,092 files; the deterministic tree SHA-256 is recorded in the external parity artifact.

## Operator gate

Run the commands in `INSTALL_STEP590I_ARCHITECTURE_GATES.md`, commit/push, wait for Vercel Ready, then verify `/api/health`, admin login and one Overview load. No state-changing production canary is required.
