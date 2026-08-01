# AI Multi-Model Handoff — STEP590C1 Current Truth

**Baseline:** STEP590C1 source architecture package on exact STEP590B
**Status:** SOURCE READY / PRODUCTION DOMAIN CANARY PENDING / GLOBAL RELEASE HOLD

## Verified

- STEP590B operator canary and supplied production log reachability for `a:aw_auth_dec`;
- bounded `src/bot/domains/adminAuth/` module with explicit actions, policy, callbacks, service, views and route descriptors;
- pre-user challenge and post-user login-control ownership;
- 6 extracted actions / 554 explicit legacy owners;
- real Telegram approver identity, browser binding and canonical Redis auth state machine preserved;
- inline `a:admin_web_login_toggle` legacy branch removed;
- 83 domain assertions, 2,299 router assertions, 63 auth assertions, 136/137 registered source checks and 280 syntax checks PASS.

## Not verified

- clean dependency installation in the execution environment;
- final portable critical-spine run on STEP590C1;
- Vercel deployment of STEP590C1;
- live challenge approve/deny/exchange after extraction;
- live operator-control toggle after extraction.

## Hard rules

- no auth state-machine duplication inside the Telegram domain;
- `a:aw_auth_dec` stays pre-user and uses `ctx.from.id`;
- `a:admin_web_login_toggle` stays post-user and super-admin only;
- extracted owners may not silently fall back to legacy;
- preserve callback keys, guards, control IDs, audit semantics and public copy.

Next implementation step after canary: `STEP590C2 — Critical Payment Callback Domain Extraction`.

---

# AI Multi-Model Handoff — STEP590B Current Truth

**Baseline:** STEP590B runtime architecture package on STEP590A
**Status:** SOURCE READY / PRODUCTION CALLBACK CANARY PENDING / GLOBAL RELEASE HOLD

## Verified

- one exact ownership row for each of 560 registered callback actions;
- 5 extracted executable actions and 555 explicit legacy owners;
- pre-user admin-auth reachability and post-user giveaway-access reachability;
- duplicate action/route ownership hard failures;
- fail-closed wrong-phase, missing-handler and extracted-handler contract behavior;
- action registry, callback consistency, targeted X1–X3 critical regressions and full JavaScript syntax.

## Not verified

- clean local dependency installation in the execution environment;
- full STEP590B portable critical spine;
- Vercel deployment and live callback canary;
- production behavior of all legacy-owned callbacks.

## Hard rules

- preserve one action → one owner;
- no direct callback bypass around the canonical router;
- extracted route must not silently return false;
- retain the compatibility legacy owner until bounded domain acceptance;
- preserve callback keys, guards, identity boundaries and user copy.

Next step after canary: `STEP590C1 — Critical Admin/Auth Callback Domain Extraction`.

---

# AI Multi-Model Handoff — STEP590A Current Truth

**Baseline:** STEP590A docs-only architecture package on STEP588X7H1
**Runtime baseline:** STEP588X7H1
**Status:** ARCHITECTURE BASELINE ACCEPTED / RUNTIME EXTRACTION NOT STARTED / GLOBAL RELEASE HOLD

## Verified

- exact STEP588X7H1 ZIP integrity and SHA-256;
- 678 repository files and 267 JavaScript files inventoried;
- 560 action registry entries and 328 DB exports classified into proposed target ownership;
- callback concentration and top-file/function hotspots measured;
- no static relative-import cycle detected;
- modular-monolith dependency direction and STEP590B–J sequence documented;
- STEP590A contains no runtime, migration, ENV, callback-key or product-copy change.

## Not verified

- behavior after future extraction;
- final domain assignment for every heuristic row;
- production acceptance of STEP588X7H1 or STEP588X1–X7;
- strict PostgreSQL/Redis critical-spine integration.

## Hard rules

- begin runtime work with STEP590B, not a broad file split;
- one action must have one executable owner or an explicit alias/tombstone;
- preserve action keys, guard metadata, copy, DB exports and critical state machines during extraction;
- keep `src/db/queries.js` as a temporary compatibility façade during STEP590F;
- do not introduce microservices, ORM, TypeScript or framework migration in STEP590;
- every extraction is independently deployable, testable and reversible;
- unknown-callback, guard downgrade, DB export drift or critical-spine failure blocks the current extraction.

Next implementation step: `STEP590B — Executable Callback Router & Unique Ownership Gate`.

---

# AI Multi-Model Handoff — STEP588X7H1 Current Truth

**Baseline:** STEP588X7H1 hotfix on STEP588X7
**Status:** SOURCE READY / PRODUCTION ADMIN-AUTH CANARY PENDING / GLOBAL RELEASE HOLD

## Verified locally

- production log signature is explained by a concrete routing defect;
- admin auth callback has an executable route in the real callback path;
- actual Telegram actor and canonical Redis state machine remain authoritative;
- malformed, unauthorized, expired and successful callback outcomes are executable-tested;
- portable X1–X6 critical spine remains PASS;
- callback/action registries have no drift.

## Not verified

- Vercel deployment;
- live Telegram callback success;
- browser status polling and session exchange;
- production Upstash transition.

## Hard rules

- do not restore signed decision URLs;
- do not bypass browser verifier binding;
- do not route auth approval through application-user identity;
- generic `unknown_callback` must never be the expected auth decision outcome;
- rollback to STEP588X7 is security/functionality regressive for admin access.

Next operator action: deploy STEP588X7H1 and perform the bounded live approve/deny/browser exchange canary.

---

# AI Multi-Model Handoff — STEP588X7 Current Truth

**Baseline:** STEP588X7 test/governance implementation on STEP588X6
**Status:** SOURCE READY / PORTABLE SPINE PASS / STRICT EXTERNAL INTEGRATION PENDING / GLOBAL RELEASE HOLD

## Verified locally

- canonical critical-spine runner and machine-readable report semantics;
- portable 6/6 X1–X6 executable suites PASS;
- 8/8 P1 roots mapped to passing portable executable regressions;
- source contract 28 assertions PASS;
- auto mode reports absent external capabilities as `NOT_RUN`;
- strict mode reports absent/unsafe capabilities as `BLOCKED` with exit code 2;
- clean npm install, dependency/runtime preflight and package-lock consistency PASS;
- 133 registered source checks PASS using bounded continuation.

## Not verified

- real disposable PostgreSQL integration execution;
- real isolated Upstash/Redis integration execution;
- production Neon/Upstash behavior;
- production acceptance for STEP588X1–X6;
- STEP586H1 24-hour observation.

## Hard rules

- never call an absent integration capability PASS;
- never run the suite against production resources;
- preserve `PASS / FAIL / NOT_RUN / BLOCKED` semantics;
- do not weaken failure injection to restore green status;
- portable tests do not replace strict infrastructure evidence;
- strict integration PASS does not replace production canaries.

Next operator sequence: strict isolated X7 integration → X1–X6 production evidence → STEP586H1 24h observation → STEP587 Go/No-Go.

---

# AI Multi-Model Handoff — STEP588X6 Current Truth

**Baseline:** STEP588X6 source implementation on STEP588X5
**Status:** SOURCE READY / PRODUCTION ENV AND REPLAY CANARY PENDING / GLOBAL RELEASE HOLD

## Verified locally

- bounded critical-update classification and Redis receipt lifecycle;
- duplicate/concurrent/ambiguous critical update suppression and fail-closed receipt-store behavior;
- explicit dynamic SQL field allowlists and exact affected-row checks;
- bounded admin JSON request bodies with HTTP 413 handling;
- production security posture checks for rate limits, strong distinct secrets, signed payment payloads and admin limits;
- neutral runtime identifier examples and timing-safe payment HMAC verification;
- 36 X6 assertions, 132/132 registered source checks, X1–X5 critical regressions, dependency/runtime preflight PASS; one completed npm audit reported 0 vulnerabilities and the final repeat hit registry HTTP 502;
- no database migration and no new Vercel function.

## Not verified

- production Upstash receipt behavior under actual Telegram webhook retries;
- live crash after a partial critical mutation;
- production ENV values and fail-fast deployment boot;
- Vercel/proxy behavior for oversized JSON bodies;
- production row-count mismatch behavior;
- production acceptance for STEP588X1–X5;
- STEP586H1 24-hour observation.

## Hard rules

- do not broaden replay dedup into a blind global update drop;
- do not automatically rerun `outcome_unknown`;
- new critical callbacks require explicit classification plus domain idempotency review;
- dynamic SQL fields require explicit allowlist changes;
- do not bypass production posture failures;
- do not claim production acceptance from local Redis/test doubles.

Next remediation STEP: `STEP588X7 — Executable Critical-Path Test Spine`.

---

# AI Multi-Model Handoff — STEP588X5 Current Truth

**Baseline:** STEP588X5 source implementation on STEP588X4
**Status:** SOURCE READY / PRODUCTION HEALTH-LOG CANARY PENDING / GLOBAL RELEASE HOLD

## Verified locally

- public readiness allowlist and `NO_GO → HTTP 503` policy;
- separate process liveness contract;
- admin-session gate for full diagnostics;
- PostgreSQL and Redis readiness probes;
- protected diagnostics redaction of payloads, actors, nonces, event tails and incidental object IDs;
- privacy-safe webhook and update middleware summaries;
- pseudonymous actor/chat references and structured error sanitization;
- Pino defensive field redaction;
- 52 executable health/privacy assertions, 130/130 registered source checks, 257/257 JavaScript syntax checks, dependency/runtime preflight and npm audit with 0 vulnerabilities PASS;
- no new Vercel function and no DB migration.

## Not verified

- production deployment;
- actual GO/NO_GO status in Neon/Upstash;
- production admin session access to `?full=1`;
- real Vercel logs after representative message/callback/payment failures;
- external uptime monitor compatibility with the new 503 readiness truth;
- production acceptance for STEP588X1–X4 unless separately evidenced;
- STEP586H1 24-hour observation.

## Hard rules

- do not revert public readiness to verbose operator JSON;
- do not return HTTP 200 with `ok=true` when `system_status=NO_GO`;
- keep liveness and readiness semantically separate;
- full health must remain behind admin auth;
- never add raw Telegram IDs, usernames, message/callback text or payment payloads to logs;
- use `opaqueLogRef`, `safeLogError` and `sanitizeLogMeta` for new critical logs.

Next remediation STEP: `STEP588X6 — Bounded Safety Hardening`.

---

## STEP588X4 — Admin Web Auth Challenge Binding & Throttling (2026-07-20)

**Current handoff-safe repository baseline:** STEP588X4 source implementation on top of STEP588X3.

Repository truth:

- admin login challenges are bound to an HttpOnly, Secure, SameSite=Strict browser verifier cookie; a challenge ID alone is insufficient;
- Telegram approval uses callback data and the actual `ctx.from.id`; the legacy signed decision URL is permanently non-mutating (`410 Gone`);
- Redis Lua owns atomic `pending → approved/denied → consumed` transitions and one-time session creation; concurrent exchange reuses the same versioned session instead of minting another;
- sessions carry `authVersion = 2`, so pre-STEP588X4 sessions fail closed after rollout;
- idle timeout is enforced during session reads and stale sessions are deleted;
- fallback code is disabled by default, generated with `crypto.randomInt`, browser-bound, attempt-limited, lockable and independently rate-limited; when enabled it is disclosed only to the explicitly configured fallback approver;
- start and fallback verification use dedicated Redis Lua throttles and auth fails closed when the throttle store is unavailable;
- no database migration is required; Redis challenge/session records are ephemeral and versioned;
- local QA passes 48 auth assertions, 128/128 registered source checks, 253/253 JavaScript syntax checks, dependency/runtime preflight and npm audit with 0 vulnerabilities; this must not be represented as production Telegram/Upstash proof.

**Release decision:** STEP588X4 is source-ready, deployment and live auth canary pending. STEP587 and STEP589 remain HOLD. Continue with STEP588X5 only after preserving X4 rollout evidence or explicitly retaining the source-only boundary.

Read first:

- `docs/audit/STEP588X4_ADMIN_WEB_AUTH_CHALLENGE_BINDING_REPORT.md`;
- `docs/operations/STEP588X4_ADMIN_WEB_AUTH_ROLLOUT_RUNBOOK.md`;
- `docs/roadmap/STEP588X_REMEDIATION_ROADMAP.md`;
- `docs/process/07_WORK_HISTORY_STEP588X4.md`.

---

# AI Multi-Model Handoff — STEP588X3 Current Truth

**Baseline:** STEP588X3 source implementation on STEP588X2
**Status:** SOURCE READY / MIGRATION + PRODUCTION CANARY PENDING / GLOBAL RELEASE HOLD

## Verified locally

- per-attempt delivery claim and compare-and-set receipts;
- terminal `delivery_unknown` state;
- no stale-`sending` automatic reclaim;
- common QStash/legacy-cron safety helpers;
- bounded DB-only receipt retry after Telegram success;
- durable read after lost DB acknowledgement;
- timeout/network/5xx ambiguity handling;
- atomic Redis Lua for distinct-recipient 429 counting;
- founder-only no-resend reconciliation with mandatory note;
- 35 broadcast assertions, 66 payment assertions and 55 giveaway assertions PASS;
- 126 registered source checks and 250 JavaScript syntax checks PASS;
- dependency/runtime preflight PASS;
- migration/action/callback/package-lock gates PASS.

## Not verified

- migration 049 in production;
- live QStash replay and timeout behavior;
- real Telegram send-success / DB-receipt failure;
- live legacy cron and founder reconciliation;
- production duplicate absence;
- fresh npm vulnerability result because the audit endpoint returned 502;
- X1/X2 production acceptance unless separately evidenced;
- STEP586H1 24-hour observation.

## Immediate action

Apply migration 049, deploy STEP588X3 and execute `docs/operations/STEP588X3_BROADCAST_ROLLOUT_RUNBOOK.md`. Preserve normal-send, replay, unknown-state and reconciliation evidence. Then execute STEP588X4.

## Hard rules

- unknown is terminal for automation;
- no Telegram call from persistence/reconciliation;
- explicit negative acknowledgement and ambiguous outcome remain distinct;
- attempt token is mandatory for in-flight terminal writes;
- no release-clean claim before production evidence.

Canonical references:

- `docs/audit/STEP588X3_BROADCAST_UNKNOWN_STATE_SAFETY_REPORT.md`;
- `docs/operations/STEP588X3_BROADCAST_ROLLOUT_RUNBOOK.md`;
- `docs/roadmap/STEP588X_REMEDIATION_ROADMAP.md`;
- `docs/process/07_WORK_HISTORY_STEP588X3.md`.

---

# AI Multi-Model Handoff — STEP588X2 Current Truth

**Baseline:** STEP588X2 source implementation on STEP588X1
**Status:** SOURCE READY / PRODUCTION CANARY PENDING / GLOBAL RELEASE HOLD

## Verified locally

- one canonical atomic giveaway draw service;
- manual and cron convergence;
- eligible-first deterministic top-up;
- winner/status/audit rollback as one transaction;
- actor/source audit attribution;
- repeat-draw idempotency and cross-worker PostgreSQL locks;
- transactional sponsor replacement;
- 55 executable giveaway assertions PASS;
- 124 registered source checks PASS across bounded batches;
- action registry and migration pack have no drift;
- no STEP588X2 migration is required.

## Not verified

- production manual draw;
- production cron draw;
- real PostgreSQL multi-session contention and connection termination;
- live winner notifications;
- production sponsor replacement;
- dependency/runtime preflight in the current audit environment;
- STEP588X1 migration/Stars canary unless separately evidenced;
- STEP586H1 24-hour observation.

## Immediate action

Use `docs/operations/STEP588X2_GIVEAWAY_ROLLOUT_RUNBOOK.md`. Preserve manual top-up, replay and cron evidence. Then execute STEP588X3. Do not issue STEP587 GO or resume STEP589.

## Hard rules

- one draw core only;
- database row owns draw inputs;
- eligible-first and top-up remain explicit;
- no partial winner/status/audit state;
- Redis is not the correctness lock;
- no production claim without SQL and Telegram/cron evidence.

Canonical references:

- `docs/audit/STEP588X2_GIVEAWAY_DRAW_CORRECTNESS_REPORT.md`;
- `docs/operations/STEP588X2_GIVEAWAY_ROLLOUT_RUNBOOK.md`;
- `docs/roadmap/STEP588X_REMEDIATION_ROADMAP.md`;
- `docs/process/07_WORK_HISTORY_STEP588X2.md`.

---

# AI Multi-Model Handoff — STEP588 Current Truth

**Current repository baseline:** STEP588 — Backoffice Productization Audit & Architecture
**Parent:** STEP586H1
**Production release status:** STEP586H1 24-hour observation still pending

## Verified now

- current web-admin is a strong existing backoffice foundation;
- 10 routes, 11 read sections and a tightly bounded write surface are inventoried;
- auth uses secret + Telegram approval/code + Redis session + strict cookie;
- Users, Runtime and Overview are already mature;
- sensitive runtime/payment/access actions remain Telegram-only;
- no ORM exists and no ORM/framework rewrite is approved;
- six stale admin source contracts were restored to current UI truth;
- the accepted no-ORM/collapsed-API architecture is guarded in source preflight;
- targeted admin/admin-web/backoffice tests pass locally: 54/54.

## Main gaps

1. unified attention queue;
2. collaboration control center;
3. invite/giveaway/moderation operations;
4. durable audit before sensitive web writes;
5. incremental client/read-model modularization.

## Immediate order

1. Complete STEP586H1 24-hour production observation.
2. Execute STEP587 release Go/No-Go.
3. Start STEP589A only after release gate.

## Do not do

- build a parallel admin;
- add ORM;
- migrate to React/Next;
- add one serverless endpoint per entity;
- copy Telegram user flows into web;
- add payment/access/deal/giveaway web mutations before durable audit and request-provenance guards.

## Canonical files

1. `docs/00_CURRENT_STATE.md`
2. `docs/audit/STEP588_BACKOFFICE_PRODUCTIZATION_AUDIT.md`
3. `docs/backoffice/README.md`
4. `docs/backoffice/BACKOFFICE_SURFACE_MANIFEST.json`
5. `docs/roadmap/STEP589_BACKOFFICE_IMPLEMENTATION_ROADMAP.md`
6. `docs/process/07_WORK_HISTORY_STEP588.md`
7. `docs/audit/STEP586H1_NEON_CRON_CONNECTION_RESILIENCE_ALERT_TRUTH_REPORT.md`
8. `docs/operations/STEP586H1_NEON_CRON_24H_OBSERVATION_RUNBOOK.md`

---

## Historical handoff snapshots

# Historical snapshot — STEP586H

**Current baseline:** STEP586H — Live Telegram Acceptance and Mobile Copy Pass
**Parent:** STEP586G — Admin and Operator Vocabulary
**Live status:** remote Telegram evidence not yet executed

## Verified now

- deterministic evidence tooling covers seven required Telegram paths;
- exact deployment + bot acknowledgement is required before evidence initialization;
- no path can PASS without actual labels, screenshot/transcript evidence and three mobile checks;
- unapproved Stars purchase, invite spend or real broadcast evidence is rejected;
- obvious secrets are rejected from evidence files;
- static bounded button labels above 34 visible characters are blocked by source lint;
- source-confirmed long labels were shortened without callback or behavior changes;
- STEP586H local contract and source mobile audit pass.

## Not verified

- Vercel Preview deployment;
- live creator, brand, invite, paid, recovery and operator paths;
- actual phone wrapping and message density;
- Stars invoice rendering;
- real screenshots/transcripts;
- remote STEP584 evidence;
- production.

## Immediate next action

Deploy STEP586H to preview/staging and run `docs/operations/STEP586H_LIVE_TELEGRAM_ACCEPTANCE_RUNBOOK.md`.

Do not open another copy wave until the finalized evidence pack is PASS or contains a source-reproduced defect that needs a narrow fix.

## Do not do yet

- claim live-green from source checks;
- use production purchases or broadcasts for convenience;
- change callbacks, permissions, prices or state machines;
- broad bot/admin redesign;
- broad `bot.js` extraction.

## Working lenses

- Jobs: one clear result per screen.
- Vitalik: no live claim without evidence.
- Woz: smallest reliable acceptance surface.
- Durov: phone-first Telegram flow.
- Toly: runnable operator workflow.
- Armani: coherent evidence and presentation.
- samczsun: no secret leakage or accidental spend.
- Hasu: BLOCKED is better than false confidence.

## Canonical files

1. `docs/00_CURRENT_STATE.md`
2. `docs/audit/STEP586H_LIVE_TELEGRAM_ACCEPTANCE_MOBILE_COPY_REPORT.md`
3. `docs/operations/STEP586H_LIVE_TELEGRAM_ACCEPTANCE_RUNBOOK.md`
4. `docs/product/COLLABKA_COPY_SYSTEM.md`
5. `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`
6. `docs/process/07_WORK_HISTORY_STEP586H.md`

---

# Historical snapshot — STEP586G

**Current baseline:** STEP586G — Admin and Operator Vocabulary
**Parent:** STEP586F — Access, Error and Empty-State Recovery
**Live status:** not reverified in STEP586G

## Verified now

- Telegram admin and web-admin use aligned human-readable vocabulary for communications, outgoing messages, templates, moderation, audit, giveaways and delivery skips;
- status, diagnosis and operator action are separated;
- exact Redis, QStash, raw status, reason-code, callback and table diagnostics remain available;
- signed login decisions and machine values remain `approve / deny`;
- callback IDs, action-registry guards, audience values, permissions, queue behavior, payments, schema and migrations are unchanged;
- STEP586G, affected operator contracts and STEP586A–F regressions pass locally.

## Not verified

- live Telegram admin traversal or mobile wrapping;
- live web-admin rendering;
- Vercel Preview/production;
- live Redis, QStash or Neon diagnostics;
- real moderator/operator comprehension;
- remote STEP584 staging evidence.

## Immediate next STEP

`STEP586H_LIVE_TELEGRAM_ACCEPTANCE_AND_MOBILE_COPY_PASS`

Run a bounded live acceptance pass. Capture evidence for Telegram admin, web-admin communications, mobile labels, moderation, outgoing messages and one diagnostic failure state. Do not add product functionality.

## Do not do yet

- broad admin redesign;
- callback or permission changes;
- removal of raw diagnostics needed for production repair;
- payment, invite, deal or giveaway mechanism changes;
- claim live-green from source checks.

## Working lenses

- Jobs: one clear outcome, no UX debris.
- Vitalik: mechanism truth and auditable evidence.
- Woz: smallest reliable engineering surface.
- Durov: Telegram-native speed and leverage.
- Toly: ship under real constraints.
- Armani: coherent, polished artifacts.
- samczsun: abuse paths and adversarial review.
- Hasu: sober risk, incentives and cost of error.

## Canonical files

1. `docs/00_CURRENT_STATE.md`
2. `docs/audit/STEP586G_ADMIN_OPERATOR_VOCABULARY_REPORT.md`
3. `docs/product/COLLABKA_COPY_SYSTEM.md`
4. `docs/product/TERMINOLOGY_REGISTRY.md`
5. `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`
6. `docs/process/07_WORK_HISTORY_STEP586G.md`

# Historical snapshot — STEP586F

**Current baseline:** STEP586F — Access, Error and Empty-State Recovery
**Parent:** STEP586E — Monetization and Paid Product Clarity
**Live status:** not reverified in STEP586F

## Verified now

- a shared immutable recovery taxonomy covers channel, application, dialog, offer, giveaway, folder, role and generic failures;
- ordinary-user recovery does not disclose whether a private object exists, was deleted or belongs to another actor;
- recovery buttons return to existing list/menu surfaces and do not bypass authoritative access checks;
- selected empty states include a title, a source-backed reason and one next action;
- selected infrastructure details are removed from user copy and retained in structured `[copy_safety]` diagnostics;
- non-admin curator workspace rendering proves membership in the requested workspace before unrestricted detail lookup;
- the legacy curator workspace route has an explicit curator/admin gate;
- callback identities, schema, payment mechanics, invite economics, deal mechanics and giveaway mechanics are unchanged;
- STEP586F and regression contracts pass locally; the full 223-file JavaScript syntax surface passes separately.

## Security finding resolved

The curator workspace renderer previously loaded unrestricted workspace details before proving membership in that specific workspace. A crafted callback could therefore confirm private workspace detail before the intended boundary. STEP586F moves specific membership proof ahead of unrestricted lookup for non-admin actors and returns neutral recovery on failure. Live exploitation was not tested.

## Not verified

- live Telegram traversal or mobile wrapping;
- Vercel Preview/production;
- live Neon/Redis/QStash behavior;
- production stale-data combinations;
- remote STEP584 staging evidence;
- real-user comprehension.

## Immediate next STEP

`STEP586G_ADMIN_OPERATOR_VOCABULARY`

Make primary operator actions readable while preserving exact diagnostic vocabulary. Do not redesign controls or change privileges.

## Do not do yet

- broad admin redesign;
- global replacement of remaining `Нет доступа.` strings;
- permission changes hidden inside copy cleanup;
- payment, invite, deal or giveaway mechanism changes;
- broad `bot.js` rewrite;
- claim live-green from source checks.

## Working lenses

- Jobs: one clear outcome, no UX debris.
- Vitalik: mechanism truth and auditable evidence.
- Woz: smallest reliable engineering surface.
- Durov: Telegram-native speed and leverage.
- Toly: ship under real constraints.
- Armani: coherent, polished artifacts.
- samczsun: abuse paths and adversarial review.
- Hasu: sober risk, incentives and cost of error.

## Canonical files

1. `docs/00_CURRENT_STATE.md`
2. `docs/audit/STEP586F_ACCESS_ERROR_EMPTY_STATE_RECOVERY_REPORT.md`
3. `docs/product/COLLABKA_COPY_SYSTEM.md`
4. `docs/product/TERMINOLOGY_REGISTRY.md`
5. `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`
6. `docs/process/07_WORK_HISTORY_STEP586F.md`
