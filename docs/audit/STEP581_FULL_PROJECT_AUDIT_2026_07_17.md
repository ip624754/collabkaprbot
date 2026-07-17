# STEP581 — Full Project Audit

**Project:** Collabka PR / `@collabkaprbot`  
**Date:** 2026-07-17  
**Mode:** HEAVY / CRITICAL review  
**Scope:** full repository, code, docs, migrations, operational contracts, release readiness  
**Baseline audited:** STEP580 FULL ZIP on top of STEP579 runtime source

## Executive conclusion

Collabka is a real, substantial production system, not a prototype. The repository contains mature product surfaces, extensive source-contract smokes, operational documentation, admin tooling, payment paths, invite/reward logic, giveaways, QStash delivery, Neon/Postgres persistence and Telegram-native workflows.

The project is **functionally advanced but not release-clean**. The strongest areas are accumulated product depth, operational knowledge, source smoke coverage and explicit runtime safeguards. The weakest areas are monolith concentration, a currently failing canonical preflight, a false-negative dependency gate, documentation sprawl, near-limit Vercel function count, and stale continuity claims that can overstate live confidence.

**Readiness classification:** `CONDITIONALLY READY / NOT CLEAN-GREEN`.

The repository should not be broadly refactored. The correct next move is a short stabilization wave that restores a trustworthy green preflight, closes callback drift, repairs the dependency detector, and aligns continuity docs with current verified truth.

---

## Audit method and Truth Boundary

### Verified in this audit

- archive extracted successfully;
- repository structure inspected;
- package metadata and scripts inspected;
- `npm ci --ignore-scripts` completed;
- npm dependency audit reported `0 vulnerabilities`;
- 211 JavaScript files passed `node --check`;
- source preflight executed until its first hard failure;
- callback consistency guard executed and failed with 21 unresolved callback references;
- dependency/runtime preflight executed and produced a false missing-dependency result;
- Vercel function-budget check reported 11 deployable functions out of a 12-function ceiling;
- code, migrations, docs, API entrypoints, major file sizes, auth/secret comparison paths and operational docs were inspected.

### Not verified in this audit

- live Vercel deployment;
- real Telegram interaction paths;
- Neon production data correctness;
- QStash delivery in production;
- Stars invoice/payment settlement in production;
- real admin session behavior in browser;
- live giveaway draw and claim lifecycle;
- real rate-limit behavior under load;
- live webhook latency and cold-start profile.

No source-level pass should be treated as proof of production success.

---

## Repository profile

- Runtime: Node.js ESM, Node `>=20`
- Platform: Vercel serverless
- Database: PostgreSQL / Neon
- Queue/cache: Upstash Redis and QStash
- Telegram framework: grammY
- Deployable API functions: **11**
- Migrations: **47 SQL migrations + runner**
- JavaScript/SQL code volume: approximately **82,844 lines**
- Documentation files: approximately **230**
- Script files: approximately **159**

### Largest concentration points

- `src/bot/bot.js`: ~1.73 MB
- `src/db/queries.js`: ~313 KB
- `scripts/admin-web.js`: ~256 KB
- `src/bot/cron.js`: ~75 KB

These files are operationally important and represent the largest regression blast-radius zones.

---

# Findings by severity

## P0 — Immediate launch blockers

No source-confirmed P0 exploit or destructive data-loss defect was found during this static audit.

This does **not** mean no P0 exists in production. Live verification was outside the available evidence boundary.

---

## P1 — Must fix before calling the baseline clean-green

### P1.1 Canonical source preflight fails

`npm run preflight:source` exits with failure because the callback consistency guard reports 21 unresolved callback references:

- `a:adm_uban_q`
- `a:adm_ucopy`
- `a:adm_ucsv`
- `a:adm_ugift`
- `a:adm_urevoke_q`
- `a:admin_outbox_clear`
- `a:admin_outbox_clear_q`
- `a:admin_outbox_to_tpl`
- `a:admin_umsg_tpl_add`
- `a:admin_umsg_tpl_del_q`
- `a:admin_umsg_tpl_edit`
- `a:admin_umsg_tpl_reset_q`
- `a:admin_umsg_tpl_view`
- `a:admin_umsg_tpls`
- `a:bc_simple_btn_preset`
- `a:bc_simple_button`
- `a:bc_simple_media`
- `a:bc_simple_media_clear`
- `a:bc_simple_text`
- `a:bc_start`
- `a:bc_start_adv`

### Risk

A callback can exist in visible UI or source references but not be handled by the canonical action router/alias contract. Depending on reachability, the result may be dead buttons, degraded admin flows, or stale source references that hide larger routing drift.

### Required action

Classify every item into exactly one category:

1. live callback and missing handler;
2. dynamically handled callback not understood by the checker;
3. legacy/dead reference that must be removed;
4. intentional alias that must be registered explicitly.

Do not silence the guard globally.

---

### P1.2 Dependency preflight contains a false-negative detector

`npm run preflight:deps` reports missing packages:

- `@upstash/qstash`
- `@upstash/redis`
- `grammy`

But `npm ls --depth=0` confirms they are installed.

The detector uses:

`require.resolve('<package>/package.json')`

Some packages restrict `package.json` through package `exports`, so the check fails even though the package is resolvable and installed.

### Risk

The canonical runtime/dependency gate cannot be trusted. A healthy checkout is reported as broken, which encourages bypassing preflight and weakens release discipline.

### Required action

Resolve package entrypoints instead of package metadata paths, for example:

- `require.resolve(dep, { paths: [ROOT] })`; or
- use `npm ls --json`; or
- use `import.meta.resolve` with a controlled fallback.

Add a smoke contract covering scoped packages with restricted exports.

---

### P1.3 Continuity docs contain stale live-confirmed claims

`docs/15_NEW_CHAT_HANDOFF.md` states live-confirmed readings such as:

- `System = OK`
- `Overview = OK`
- `Runtime warnings = 0`

Those may have been true at a previous observation point, but they were not reverified in this audit and are presented too strongly for a fresh baseline handoff.

### Risk

Other AI systems or operators may treat historical runtime state as current truth.

### Required action

Mark runtime facts with date, source and TTL, for example:

- `live-confirmed at 2026-07-xx HH:mm UTC`;
- `stale unless rechecked after deploy`;
- `source-confirmed only`.

---

## P2 — High-leverage structural risks

### P2.1 `bot.js` is a critical monolith

At ~1.73 MB, `src/bot/bot.js` carries a very large product and routing surface.

### Risk

- high cognitive load;
- merge and AI-context errors;
- accidental cross-feature regressions;
- difficult ownership boundaries;
- slow review and weak locality.

### Recommendation

Do **not** perform a broad rewrite. Use an extraction-by-verified-boundary program:

1. choose one stable feature family;
2. capture callback/source contract first;
3. extract without behavior change;
4. run preflight and targeted smokes;
5. stop after each narrow extraction.

Good candidates are independent admin broadcast templates, invite read surfaces, or support thread presentation. Avoid extracting payments, giveaway settlement or cross-role routing first.

---

### P2.2 `queries.js` is a second critical monolith

At ~313 KB, data access, locks, queues, ledgers and product queries are concentrated in one file.

### Risk

- transaction-boundary ambiguity;
- accidental connection holding;
- difficult lock review;
- unclear ownership of ledger vs UI query logic.

### Recommendation

First create a read-only ownership map. Then extract by invariant domain:

- invite ledger;
- giveaways;
- payments;
- broadcasts/QStash;
- support threads;
- admin read models.

Do not change SQL semantics while moving code.

---

### P2.3 Vercel function count is near the hard ceiling

The repository has 11 deployable API entrypoints, with a hard limit of 12 in the current Hobby contract.

### Risk

One additional route can block deployment or force emergency route consolidation.

### Recommendation

Treat API function count as a capacity budget:

- no new standalone API file without explicit approval;
- prefer sub-routing inside existing read/write/QStash surfaces;
- define a reserved slot policy;
- add function-count delta to every STEP QA.

---

### P2.4 Documentation is rich but operationally noisy

Approximately 230 docs exist, including duplicate numbering, legacy variants, historical snapshots, overlapping runbooks and many STEP-specific documents.

Examples include duplicate number prefixes and parallel legacy/current files.

### Risk

- source-of-truth ambiguity;
- stale instructions selected by AI;
- slow onboarding;
- high context cost;
- accidental execution from superseded docs.

### Recommendation

Create a documentation registry with statuses:

- `CANONICAL`
- `ACTIVE SUPPORTING`
- `HISTORICAL`
- `SUPERSEDED`
- `ARCHIVE`

Do not delete history. Add machine-readable metadata and a one-screen index.

---

### P2.5 Test portfolio is broad but highly source-contract oriented

The project has many smoke scripts, which is a strength. However, many validate strings, routing shape and source contracts rather than stateful integration behavior.

### Risk

A large green source suite can coexist with production defects in:

- DB transactions;
- Redis/QStash timing;
- webhook retries;
- race conditions;
- payment idempotency;
- Telegram edit/send behavior.

### Recommendation

Keep source smokes, but add a small authoritative integration spine:

1. migration boot against ephemeral Postgres;
2. callback dispatch against a test bot context;
3. invite ledger idempotency;
4. giveaway draw concurrency;
5. payment provider-charge uniqueness;
6. QStash delivery dedup/retry convergence.

---

## P3 — Important improvements

### P3.1 Versioning and baseline naming need one canonical contract

Package version `1.3.19`, STEP numbers, archive names and docs baseline identifiers coexist without a single release identity.

Recommendation: define a release manifest containing:

- STEP;
- package version;
- git SHA/tree hash when available;
- migration head;
- build timestamp;
- artifact SHA-256.

---

### P3.2 Migration governance should be made more explicit

There are 47 SQL migrations and a migration runner. Historical files include mixed naming formats.

Recommendation:

- verify immutable checksums;
- enforce numeric uniqueness;
- document current migration head;
- add a clean-database replay test;
- prohibit editing applied migrations.

---

### P3.3 Client-side HTML rendering requires continued escaping discipline

`scripts/admin-web.js` uses `innerHTML` extensively. This is normal for the current architecture, and escaping helpers are present, but every unescaped interpolation is security-sensitive.

Recommendation:

- add a static contract that flags interpolations not wrapped in approved escaping/sanitization helpers;
- focus on user-generated fields, notes, usernames, payment metadata and external error messages.

---

### P3.4 Critical environment truth is fragmented

The project has strong ENV docs and a baseline smoke, but operational truth still spans `.env.example`, config parsing, release docs and Vercel settings.

Recommendation: generate one ENV catalog from code with:

- required/optional;
- default;
- owner;
- secret/non-secret;
- runtime scope;
- fail-open/fail-closed behavior;
- production verification status.

---

# Security and abuse-path review

## Strengths

- timing-safe secret comparison exists for webhook and cron paths;
- logger redaction includes authorization fields;
- payment uniqueness migration exists;
- advisory-lock usage exists in critical flows;
- Redis Lua is used for atomic operations;
- callback action registry and consistency tooling exist;
- anti-bypass contracts exist for Brand Pass/contacts;
- QStash dedup and retry contracts exist;
- explicit soft-delete and user-ban migrations exist.

## Remaining adversarial questions

These require dedicated STEPs or live tests, not assumptions:

- Can the same Telegram update be replayed and produce duplicate monetary or reward effects?
- Can two giveaway draw paths run concurrently and disagree on winners?
- Can a stale callback mutate a resource after its state changed?
- Can an admin session secret fall back to a weaker or shared secret unintentionally?
- Can QStash delivery be forged or replayed under malformed headers?
- Can user-controlled HTML reach admin `innerHTML` without escaping?
- Can invite activation/redeem be farmed across account/channel lifecycle edge cases?
- Can payment provider IDs collide across environments or providers?

---

# Product and UX review

## Strong product qualities

- Telegram-native workflows are deep and specific;
- creator/brand dual-role surfaces are mature;
- invite center now has clearer information architecture;
- admin operations are unusually capable for a Vercel Hobby system;
- operational UX and copy contracts are explicitly tested;
- Creator OS thesis is directionally strong.

## Product risks

- feature breadth may exceed clarity for new users;
- accumulated menus and callback surface create discoverability debt;
- admin complexity may outgrow the “hobby-safe” architecture;
- product value can be diluted if every workflow is exposed equally;
- Creator OS strategy can become a justification for broad feature expansion.

## Product recommendation

Use a strict product hierarchy:

1. one primary user outcome per role;
2. three dominant paths per home surface;
3. advanced operations progressively disclosed;
4. every new feature must replace, compress or outperform an existing path;
5. no new surface without a measurable user/job hypothesis.

---

# Readiness scorecard

| Area | Rating | Evidence |
|---|---:|---|
| Product depth | 9/10 | broad creator/brand/admin workflows |
| Source syntax integrity | 10/10 | 211 JS files passed `node --check` |
| Dependency security | 9/10 | npm audit: 0 vulnerabilities |
| Source-contract QA | 8/10 | extensive smoke suite, but current preflight failure |
| Integration/runtime proof | 5/10 | not reverified; source-heavy coverage |
| Security posture | 7/10 | good primitives, several unverified abuse paths |
| Maintainability | 5/10 | very large monoliths and docs sprawl |
| Release discipline | 6/10 | strong process, broken canonical gates |
| Vercel capacity margin | 3/10 | 11/12 function slots used |
| Documentation continuity | 6/10 | rich, but stale truth and source ambiguity |

**Overall:** 6.8/10 engineering readiness.  
**Production posture:** usable and mature, but the baseline should not be labeled clean-green until P1 items are resolved.

---

# Recommended next STEP

## STEP582 — Preflight Truth Restoration

### Scope

- classify and resolve the 21 unresolved callback references;
- fix dependency resolution detection;
- add regression tests for both gates;
- update handoff truth markers;
- run full source + deps preflight;
- no product feature changes;
- no schema changes;
- no broad refactor.

### Definition of Done

- `npm run preflight:source` PASS;
- `npm run preflight:deps` PASS;
- `npm run preflight` PASS in the local audit environment;
- callback drift report contains zero unresolved items;
- installed scoped packages are correctly detected;
- current handoff separates dated live facts from source facts;
- changed-file list, QA, patch, browser hotfix and full ZIP produced.

