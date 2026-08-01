# STEP590E3C — Directory/Public Workspace Extraction Report

**Date:** 2026-08-01
**Baseline:** STEP590E3B_R2 source artifact
**Verdict:** SOURCE IMPLEMENTATION COMPLETE / FOCUSED QA PASS / OPERATOR DEPENDENCY GATE PENDING

## Scope reviewed

- six `a:pm_*` matching callbacks;
- public Workspace preview/open/contact request;
- queue-first contact unlock;
- callback ownership and dispatch wiring;
- monetization ownership, guard and durable-state seams;
- source contracts that previously assumed legacy placement.

## Findings

### F1 — Actual scope is ten actions

The STEP590E3B_R2 ownership table showed `a:wsp_contact_unlock` still owned by `legacy`. Earlier planning language that described it as payment-owned was incorrect. Its action metadata is `pay / queue_first`, but callback ownership had not been extracted.

Resolution: include the unlock action in `directory_public_workspace` while preserving its existing financial core and guard.

### F2 — Search/public Workspace callbacks were structurally extractable

The ten callbacks were isolated branches in the post-user dispatcher and depended on existing helpers rather than private local state. They were moved without changing payload parsing, copy, renderer arguments or state transitions.

### F3 — Monetization remains canonical

The extracted unlock callback continues to use:

- `db.unlockWorkspaceContactsWithCredits()` for durable debit/unlock truth;
- existing QStash retry enqueue;
- existing Redis lock token and TTL;
- existing dedup ID;
- existing Redis unlock cache;
- existing diagnostics and Brand Pass fallback.

No direct debit, Stars fulfillment or alternate unlock implementation was introduced.

### F4 — Source contracts needed domain awareness

Two source-only brand-lead contracts inspected strings only in `bot.js`. After extraction, the checked behavior correctly spans `bot.js` renderers and `domains/directory/callbacks.js` orchestration.

Resolution: read both canonical source locations and explicitly assert that contact unlock is absent from the legacy dispatcher and present in the directory domain.

## Ownership result

```text
before: 275 extracted / 285 legacy
after:  285 extracted / 275 legacy
aliases: 7
unresolved: 0
registry: 560/560
```

## Verified evidence

- STEP590E3C executable suite: 77 assertions PASS;
- STEP590E3C source contract: PASS;
- callback ownership/reachability: 2,784 assertions PASS;
- callback consistency: 285 extracted / 275 legacy / 7 aliases / 0 unresolved;
- action registry: 560/560 PASS;
- STEP590E3A: 224 assertions PASS;
- STEP590E3B: 166 assertions PASS;
- Applications/Leads: 302 assertions PASS;
- Barter: 492 assertions PASS;
- Payment: 164 assertions PASS;
- Giveaway: 119 assertions PASS;
- Broadcast: 161 assertions PASS;
- Navigation/shared UX: 93 assertions PASS;
- package-lock consistency: PASS;
- JavaScript syntax: 353/353 PASS;
- focused/dependency-free source gates PASS;
- full `preflight:source` PASS under temporary local dependency shims used only for execution evidence;
- portable critical spine: 6/6 PASS under the same temporary execution-only shims;
- no shim or `node_modules` is included in the final source tree or artifacts.

## Not verified in the implementation environment

- clean `npm ci` on the final tree: package mirror returns 404 for `xtend@4.0.2`;
- `npm audit` on the final tree;
- clean dependency-backed repeat of `preflight:source` and portable critical spine 6/6 on the exact final artifact;
- Git commit/origin parity;
- Vercel deployment and production Telegram canary;
- live credit charge/unlock against production data.

## Residual risk

The contact-unlock callback has a wider dependency seam than read-only directory callbacks because it coordinates Redis, QStash and durable DB truth. The seam is explicit and executable-tested, but later STEP590F/STEP590I work should narrow capability interfaces and enforce import direction.
