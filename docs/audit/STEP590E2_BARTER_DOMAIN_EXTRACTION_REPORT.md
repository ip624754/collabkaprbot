# STEP590E2 — Barter Domain Extraction Report

## Verdict

**SOURCE READY / PRODUCTION BARTER CANARY PENDING**

## Baseline

- source baseline: STEP590E1H5;
- accepted production commit: `af56af594c1de6d6c8a950f4168be7a2c397320f`;
- STEP590E1 Applications & Leads production canary: operator PASS;
- SQL/ENV changes in STEP590E2: none.

## Scope

The STEP extracts 89 exact Barter callback actions from the legacy callback body into four explicit executable owners. It includes discovery, offer authoring/lifecycle, Barter conversations/proofs/reports and official publication orchestration.

Payment checkout (`a:off_buy`, `a:off_buy_home`) is explicitly excluded. Five registry-only/unreferenced Barter keys remain legacy-owned because no executable branch exists to extract safely.

## Changed runtime surface

- added `src/bot/domains/barter/`;
- added four route IDs and route definitions;
- injected the existing Barter capabilities from `src/bot/bot.js`;
- removed 89 corresponding inline callback branches from `src/bot/bot.js`;
- retained all existing DB, Redis, QStash, Telegram, audit and renderer implementations;
- added the missing import for the existing `verifyOfficialPublishState` helper.

`src/bot/bot.js` decreased from 39,179 to 37,284 lines before documentation packaging.

## Ownership evidence

```text
before: 120 extracted / 440 legacy
new:     89 extracted
final:  209 extracted / 351 legacy
registry: 560
aliases:    7
unresolved: 0
```

## Source evidence

- Barter executable extraction tests: 492 assertions PASS;
- Barter bounded-domain source contract: PASS;
- callback ownership/reachability: 2,624 assertions PASS;
- action registry: 560/560 PASS;
- callback consistency: 209 extracted, 351 legacy, 7 aliases, 0 unresolved;
- dependency parity: 98 required, 98 declared, 98 injected, 0 missing;
- admin/auth extraction regression: 83 PASS;
- payment extraction regression: 164 PASS;
- giveaway extraction regression: 119 PASS;
- broadcast extraction regression: 161 PASS;
- navigation/shared UX regression: 93 PASS;
- applications/leads regression: 302 PASS;
- payment critical: 66 PASS;
- giveaway critical: 55 PASS;
- broadcast unknown-state critical: 35 PASS;
- admin-auth critical: 63 PASS;
- health/privacy critical: 52 PASS;
- bounded-safety critical: 36 PASS under declared temporary dependency shims;
- portable critical spine: 6/6 PASS under declared temporary dependency shims;
- source preflight: PASS under declared temporary dependency shims.

## Environment boundary

A clean `npm ci --ignore-scripts` was attempted in the implementation environment and blocked because the available internal package mirror returned HTTP 404 for `xtend@4.0.2`. Temporary no-op shims for declared external packages were used only to execute dependency-bound source/preflight/portable-spine checks and are removed before artifact packaging.

This limitation does not prove a repository dependency defect and does not replace operator-side `npm ci`, `npm audit`, Vercel build or live Telegram evidence.

## Not verified

- clean dependency installation and fresh audit in the implementation environment;
- Vercel deployment of STEP590E2;
- live Barter offer creation/publication/update lifecycle;
- live thread creation/reply/proof/report/stage/close flow;
- live official queue/publish/verify/update/remove flow;
- real PostgreSQL, Redis, QStash and Telegram behavior on extracted routes.

## Rollback

Code rollback to exact STEP590E1H5 is possible because no schema or persistent contract changed. Preserve offers, threads, proofs, reports, official-publication rows, audit records and external Telegram message identifiers created after deployment. Never delete or rewrite durable workflow evidence merely to match an older code package.
