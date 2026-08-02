# STEP592 CURRENT HANDOFF

## Canonical baseline

- Parent commit: `d0c2f10e328d3e1464649831bcbf67840e875703`.
- Parent verdict: `PRODUCTION_ACCEPT_STEP591_PRODUCT_AND_OPERATIONS_REBASELINE`.
- Package: `1.3.40`.
- Source status: implementation and focused QA complete; operator clean install/deploy/browser/persistence acceptance pending.

## Implemented

- Admin → Users founding cohort workspace.
- Redis key `admin:founding_cohort:v1` under the existing environment namespace.
- Founder-only config/member mutations with token lock and admin audit.
- Explicit creator readiness, ACTIVE-offer count, onboarding canary and exit progress.
- No Telegram send, payment, official publish, SQL, migration, ENV, route or function change.

## Operator acceptance

1. Run clean install/audit, STEP592 focused tests, architecture gates, critical spine and source preflight.
2. Commit/push and wait for Vercel Ready.
3. Open Admin → Users and confirm desktop/mobile rendering.
4. Save owner/cadence, add one real creator candidate, refresh and confirm persistence.
5. Remove the candidate and confirm user/profile/offers remain unchanged.
6. Health must remain `ready / GO`.

## Exit boundary

Source acceptance is not marketplace-liquidity acceptance. STEP592 closes only when 10 launch-ready creators, 5 active offers, zero blockers, canary PASS, owner and cadence converge.

# STEP591 CURRENT HANDOFF — Product and Operations Rebaseline

- Canonical parent commit: `10042b52519ee043e812ea541e34c0c5ff39248e`.
- Package: `1.3.39`.
- STEP590 is closed with `PRODUCTION_ACCEPT_STEP590I_ARCHITECTURE_GATES_AND_CLOSE_STEP590`.
- Health/admin production evidence is green; desktop/mobile admin accepted.
- Product truth: 21 users, 0 active offers, 0 active leads, 0 payment signals.
- Control truth: payments/auto-apply/matching/fan-out ON; fallback and Founder Sale OFF.
- Architecture work is no longer the primary bottleneck.
- Next step: `STEP592_FOUNDING_COHORT_AND_MARKETPLACE_LIQUIDITY`.
- Do not start broad legacy retirement, IG OAuth, Founder Sale or new API routes without a separate approved STEP.

Read first:

1. `docs/product/STEP591_PRODUCT_OPERATIONS_BASELINE.json`;
2. `docs/product/STEP591_PRODUCT_CAPABILITY_MATRIX.md`;
3. `docs/operations/STEP591_LAUNCH_READINESS_BASELINE.md`;
4. `docs/roadmap/STEP591_PRODUCT_OPERATIONS_ROADMAP.md`.

---

# Current New-Chat Handoff — STEP590I

- Canonical baseline: production-accepted STEP590H commit `0defa47`, package `1.3.37`.
- Current source result: package `1.3.38`.
- STEP590H final verdict: `PRODUCTION_ACCEPT_STEP590H_ADMIN_WEB_FRONTEND_DECOMPOSITION`.
- Architecture enforcement now protects queries, cron, QStash workers and admin-web modules against re-monolithization and owner drift.
- Runtime behavior and deployable surface are unchanged.
- Focused architecture QA and all F/G/H regressions PASS; critical spine 6/6 PASS under temporary shims removed before packaging.
- Full preflight exceeded the artifact-environment timeout and remains an operator gate.
- Operator next: clean install/audit, STEP590I gates, full preflight, commit/push, Vercel Ready and health/admin smoke.

# Current New-Chat Handoff — STEP590H

- Baseline: production-accepted STEP590G3 commit `7331fcb4403618e4f99cd70b98b1cf955ab67982`, package `1.3.36`.
- Result: package `1.3.37`; `/scripts/admin-web.js` remains the single public module entry.
- Six bounded client modules own Overview, Users, Payments, Communications, Founder and Runtime view/state implementation.
- Shared auth, route resolution, render orchestration and event binding remain in the compatibility entry.
- Exact moved-source SHA parity: 2,636 lines; baseline entry 4,667 lines → current entry 2,228 lines.
- Backend APIs, auth policy, SQL, migrations, ENV, Telegram, CSS and function count remain unchanged.
- QA: H 154 assertions; compatibility entry PASS; real ESM graph/login render PASS; 57 admin-web contracts PASS; G3/G2/G1/F regressions PASS; critical spine 6/6 and source preflight PASS.
- Artifact-side clean npm install remains blocked by internal mirror `xtend@4.0.2` 404; operator dependency/audit and browser evidence remain required.
- Operator acceptance: commit/push, Vercel Ready, production login, Overview/Users/Runtime/Payments/Communications/Help/Founder navigation, desktop/mobile browser acceptance.
- Do not begin STEP590I until STEP590H acceptance.

## Previous Handoff — STEP590G3 Production Acceptance

- Commit `7331fcb4403618e4f99cd70b98b1cf955ab67982`, package `1.3.36`, clean worktree and HEAD/origin parity.
- Four unsigned QStash handlers returned `401 signature_missing`.
- Signed ping and monetization unknown-action canaries each reached `CREATED → ACTIVE → DELIVERED` with HTTP 200.
- Final verdict: `PRODUCTION_ACCEPT_STEP590G3_MONETIZATION_AND_OFFICIAL_PUBLISH_WORKERS_DECOMPOSITION`.

## Previous Handoff — STEP590G2 Production Acceptance

- Commit `e88ad931bf49c5bb9ebd55d134411d8aaf3a2e9a`, package `1.3.35`, clean worktree and HEAD/origin parity.
- Unsigned broadcast worker returned `401 signature_missing`; signed no-send QStash delivery converged `CREATED → ACTIVE → DELIVERED` with HTTP 200.
- Final verdict: `PRODUCTION_ACCEPT_STEP590G2_QSTASH_BROADCAST_DELIVERY_WORKER_DECOMPOSITION`.

## Previous Handoff — STEP590G1 Production Acceptance

- Commit `2fb27008e7f70ed194923df687dd68e6845f2521`, package `1.3.34`, clean worktree and HEAD/origin parity.
- `src/bot/cron.js` is a 12-export compatibility façade; `api/cron_router.js` preserves 4/4 jobs.
- Production module/auth boundaries returned `401` without secret; authorized `audit-flush-tick` returned HTTP 200 and `status=ok`.
- Final verdict: `PRODUCTION_ACCEPT_STEP590G1_CRON_TICK_DECOMPOSITION_WITH_COMPATIBILITY_FACADE`.

## Previous Handoff — STEP590F_R1 Production Recovery

- Current package: `1.3.33`.
- Production-blocking defect in STEP590F was a missing internal ESM export: `applicationsRepository.js` imported `isMissingBarterOffersMetaColumnError` from `bartersRepository.js`, but the helper was not exported.
- R1 exports the helper internally, keeps the public `queries.js` façade at exactly 328 exports, and adds an executable named-import/export linkage gate.
- SQL/function/transaction bodies are unchanged; reconstructed-body SHA parity remains canonical.
- Focused repository tests and real `queries.js` ESM instantiation PASS under execution-only dependency shims.
- R1 was committed/pushed as `2226269`; production `/api/webhook` reached the `401 Unauthorized` guard and web-admin recovery was operator-confirmed.

## Previous Handoff — STEP590F

- Current source result: package `1.3.32`.
- `src/db/queries.js` is a thin compatibility façade with 328 explicit exports.
- Implementation lives in nine bounded `src/db/repositories/*Repository.js` modules.
- Exact moved-body SHA-256 parity proves no SQL/signature/transaction-body drift.
- Application callers continue importing `queries.js`; only repositories may use explicit internal cross-repository imports.
- Source preflight PASS and portable critical spine 6/6 PASS under temporary shims removed before packaging.
- Operator evidence still required: clean `npm ci`, `npm audit`, commit/push, Vercel Ready and runtime health/import check.
- Next step: STEP590G cron/job decomposition.

## STEP590E6 CURRENT HANDOFF — Support, Verification, Sharing & Account

- Baseline: final STEP590E5D source tree (`1.3.30`); E5C/E5D operator commit/push was not evidenced at artifact time.
- Result: package `1.3.31`; new `src/bot/domains/userServices/`; 18 live callbacks extracted.
- Ownership: 482 extracted / 78 legacy / 7 aliases / 0 unresolved.
- Routes: `user_support` 3, `user_verification` 3, `user_sharing` 9, `user_account` 3.
- QA: E6 121 assertions PASS; router 2,965 PASS; all prior domain suites PASS; source preflight and portable spine 6/6 PASS under temporary execution-only shims.
- Contracts unchanged: no SQL, ENV, API route, callback key, action guard or visible-copy change.
- Recovery invariant: deleted-user gate remains in `bot.js` before dispatch and permits only support recovery plus `a:acc_restore`; account tombstone/restore keeps canonical DB and Redis cleanup.
- Explicit exclusions: `a:notice`, `a:founder`, admin support/moderation, broadcast, payments and admin web remain outside this STEP.
- Operator gate: ensure STEP590E5C and STEP590E5D are present, then run `npm.cmd ci`, `npm.cmd audit`, E6 tests, critical spine, preflight, commit/push, Vercel Ready and bounded support/verification/share/account smoke.
- STEP590E callback-domain decomposition is source-complete. Next: STEP590F `queries.js` repository decomposition with compatibility façade.


## STEP590E5D CURRENT HANDOFF — Admin Operations, System & Founder Controls

- Baseline: final STEP590E5C source tree (`1.3.29`); E5C operator commit/push not evidenced at artifact time.
- Result: package `1.3.30`; new `src/bot/domains/adminSystem/`; 30 live callbacks extracted plus `a:adm_ph` ownership closure.
- Ownership: 464 extracted / 96 legacy / 7 aliases / 0 unresolved.
- Routes: navigation 4, operations/invites 5, hard-skip 6, audit/metrics 5, QStash 2, Founder controls 8; Admin Communications templates now own 10.
- QA: E5D 224 assertions PASS; router 2,965 PASS; all prior domain suites PASS; source preflight and portable spine 6/6 PASS under temporary execution-only shims.
- Contracts unchanged: no SQL, ENV, API route, callback key, action guard or visible-copy change.
- Explicit exclusions: `a:founder`, `a:off_buy`, `a:off_buy_home`, broadcast, payments and admin web remain outside this STEP.
- Operator gate: ensure E5C is present, then `npm.cmd ci`, `npm.cmd audit`, E5D tests, critical spine, preflight, commit/push, Vercel Ready and bounded admin-system smoke.
- STEP590E5 source decomposition is complete. Next: STEP590E6 Support, Verification, Sharing & Account.


## STEP590E5C CURRENT HANDOFF — Admin Communications, Notices & Outbox

- Baseline: operator-pushed STEP590E5B commit `fe20572`.
- Result: package `1.3.29`; new `src/bot/domains/adminCommunications/`; 26 live callbacks extracted.
- Ownership: 433 extracted / 127 legacy / 7 aliases / 0 unresolved.
- Routes: `admin_communications` 1, `admin_notice_management` 9, `admin_outbox` 7, `admin_message_templates` 9.
- QA: E5C 184 assertions PASS; router 2,965 PASS; all prior domain suites PASS; source preflight and portable spine 6/6 PASS under temporary execution-only shims.
- Contracts unchanged: no SQL, ENV, API route, callback key, action guard or visible-copy change.
- Explicit exclusions: user-facing `a:notice`, STEP590E5B direct-message send actions, broadcast delivery, payment-admin and system/founder controls remain outside this STEP.
- Operator gate: `npm.cmd ci`, `npm.cmd audit`, E5C tests, critical spine, preflight, commit/push, Vercel Ready and bounded admin communications smoke.
- Next: STEP590E5D Admin Operations, System & Founder Controls.


## STEP590E5B CURRENT HANDOFF — Admin Users, Support & Moderator Governance

- Baseline: operator-pushed STEP590E5A commit `acbe16d`.
- Result: package `1.3.28`; new `src/bot/domains/adminOperations/`; 38 live callbacks extracted.
- Ownership: 407 extracted / 153 legacy / 7 aliases / 0 unresolved.
- Routes: `admin_users` 20, `admin_gifts` 8, `admin_support` 7, `admin_moderator_governance` 3.
- QA: E5B 266 assertions PASS; router 2,965 PASS; all prior domain suites PASS; source preflight and portable spine 6/6 PASS under temporary execution-only shims.
- Contracts unchanged: no SQL, ENV, API route, callback key, action guard or visible-copy change.
- Explicit exclusions: message templates, notices, outbox, admin system/founder and payment-admin remain outside this STEP.
- Operator gate: `npm.cmd ci`, `npm.cmd audit`, E5B tests, critical spine, preflight, commit/push, Vercel Ready and bounded admin smoke.
- Next: STEP590E5C Admin Communications, Notices & Outbox.


## STEP590E5A CURRENT HANDOFF — Moderation Reports & Verification

- Baseline: operator-pushed STEP590E4C commit `606028d`.
- Result: package `1.3.27`; new `src/bot/domains/moderation/`; 10 live callbacks extracted.
- Ownership: 369 extracted / 191 legacy / 7 aliases / 0 unresolved.
- Routes: `moderation_reports` owns 6 actions; `moderation_verification` owns 4 actions.
- QA: E5A 84 assertions PASS; router 2,965 PASS; all prior domain suites PASS; preflight source and portable spine 6/6 PASS under temporary execution-only shims.
- Hardening: malformed/non-positive report and verification identifiers cannot reach DB mutations.
- Contracts unchanged: no SQL, ENV, API route, callback key, action guard or visible-copy change.
- Explicit exclusions: `admin_mod_*`, admin users/support/comms/system/founder and payment-admin remain outside this STEP.
- Operator gate: `npm.cmd ci`, `npm.cmd audit`, E5A tests, critical spine, preflight, commit/push, Vercel Ready and bounded moderation smoke.
- Next: STEP590E5B Admin Users, Support & Moderator Governance.


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
