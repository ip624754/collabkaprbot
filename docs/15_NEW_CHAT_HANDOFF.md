# Current New-Chat Handoff — STEP590F

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
