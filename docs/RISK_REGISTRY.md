# STEP590B — Active Architecture Risk Update

| ID | Risk | Severity | State | Required control |
|---|---|---:|---|---|
| R-38 | Callback exists in source/registry but is unreachable, shadowed or owned by multiple handlers | HIGH | SOURCE MITIGATED / PROD OPEN | exact ownership registry, executable phased dispatch, duplicate-owner hard fail, live callback canary |
| R-39 | Legacy compatibility dispatcher masks extraction drift or becomes permanent architecture | MEDIUM | ACTIVE | bounded STEP590C–J extraction, explicit legacy count, architecture gates and eventual façade retirement |

**Release gate:** R-38 remains open until STEP590B deployment canary proves admin-auth, giveaway-access, representative legacy routes and stale recovery. R-39 is intentionally active throughout the strangler migration and closes only when legacy ownership is retired by accepted domain extractions.

---

# STEP588X Independent Audit — Active Risk Override

The following risks override earlier release optimism until remediation evidence exists.

| ID | Risk | Severity | State | Required control |
|---|---|---:|---|---|
| R-26 | Payment fulfillment commits outside payment APPLIED transaction | CRITICAL | ACTIVE | Source uses one atomic service; migration 048 + production canary required |
| R-27 | Payment ledger absence fails open into product/credit fulfillment | CRITICAL | ACTIVE | Source fail-closed implemented; production migration/canary evidence required |
| R-28 | Matching/featured session removed before durable paid apply | HIGH | ACTIVE | Durable context + post-commit cleanup implemented; live evidence required |
| R-29 | Giveaway auto-draw runtime binding defect and split manual path | CRITICAL | ACTIVE | Source uses one atomic service; production manual/replay/cron evidence required |
| R-30 | Broadcast Telegram send may succeed while DB remains reclaimable | CRITICAL | SOURCE MITIGATED / PROD OPEN | attempt-token claim, terminal unknown, no auto-resend, founder reconciliation |
| R-31 | Admin challenge/approval URL can act as transferable privileged capability | CRITICAL | SOURCE MITIGATED / PROD OPEN | browser binding + actual Telegram callback actor + atomic one-time consume + session versioning |
| R-32 | Admin fallback code lacks crypto generation/throttling/lockout | HIGH | SOURCE MITIGATED / PROD OPEN | disabled by default; crypto RNG; explicit actor; atomic attempts/lockout; dedicated throttles |
| R-33 | Public health and webhook logs expose excess operational/personal data | HIGH | SOURCE MITIGATED / PROD OPEN | coarse public readiness, admin-protected diagnostics, pseudonymous structured logs; production log/health canary required |
| R-34 | Source-heavy test portfolio misses transaction/crash/race defects | HIGH | SOURCE MITIGATED / INTEGRATION OPEN | portable P1 mapping + isolated PostgreSQL/Redis spine; strict run evidence pending |
| R-35 | Generic dynamic SQL/body/update helpers retain latent safety footguns | MEDIUM | SOURCE MITIGATED / PROD OPEN | allowlists, size caps, row-count truth; production canary required |
| R-36 | Critical Telegram retry can replay a non-idempotent mutation | HIGH | SOURCE MITIGATED / PROD OPEN | bounded update_id receipts, terminal ambiguous state, fail-closed storage |
| R-37 | Weak/reused production secrets or disabled rate limits permit unsafe runtime | HIGH | SOURCE MITIGATED / PROD OPEN | webhook/cron init gate plus readiness NO_GO; operator ENV evidence required |

**Release gate:** R-26 through R-28 are source-remediated but remain active until STEP588X1 migration/canary evidence. R-29 is source-remediated but remains active until STEP588X2 manual/replay/cron evidence. R-30 is source-remediated but remains active until STEP588X3 migration, replay and unknown-state evidence. R-31 and R-32 are source-remediated but remain open until STEP588X4 deployment and two-browser/replay/idle evidence. R-33 is source-remediated but remains open until STEP588X5 deployment, public/private health and Vercel-log evidence. R-35 through R-37 are source-remediated but remain open until STEP588X6 ENV, replay, body-limit and stale-row canaries. R-34 has a source-ready portable/integration spine but remains open until strict isolated PostgreSQL and Redis reports PASS. STEP587 GO and STEP589 remain paused.

---

# RISK REGISTRY — Collabka PR

**Status:** living register
**Introduced:** STEP580
**Review cadence:** before high-risk STEPs and during release readiness reviews

Severity: `LOW / MEDIUM / HIGH / CRITICAL`
State: `ACTIVE / WATCH / MITIGATED / ACCEPTED / PARKED`

| ID | Risk | Severity | State | Detection signal | Current mitigation | Escalation trigger |
|---|---|---:|---|---|---|---|
| R-01 | Neon/serverless connection timeout on first query or cold wake | HIGH | WATCH | `Connection terminated due to connection timeout`, first-query failures | pooled URL, pool max 1, one acquisition/session-init retry, dead-client destruction, health warning, 24h observation | repeated final failures after retry or missed cron work |
| R-02 | Cron overlap or duplicate external effects | CRITICAL | MITIGATED | duplicate publish/draw/send, overlapping runs | Redis token lock, PG advisory lock, idempotent reserve/state guards | any duplicate authoritative effect |
| R-03 | Payment/credit/unlock double application | CRITICAL | MITIGATED | duplicate ledger rows, repeated entitlement | exactly-once DB guards, audit, HEAVY-only changes | any inconsistent money-like balance |
| R-04 | Callback/action-key regression after refactor | HIGH | WATCH | dead buttons, stale callback, unacked callback | action registry, source smokes, backward compatibility | new callback family or router extraction |
| R-05 | Invite reward truth drift between copy and ledger | HIGH | MITIGATED | UI promises unavailable reward, wrong amount/window, pending shown as spendable | shared immutable DB/UI rule catalog, STEP586D copy contract, ledger and anti-abuse unchanged | any reward, activation, target or confirmation-window change |
| R-06 | Giveaway draw/claim race or non-reproducible winners | CRITICAL | MITIGATED | different winners on replay, duplicate claim, lock contention mishandled | deterministic seed/hash, transactional state, advisory lock | any draw algorithm or claim mutation change |
| R-07 | Vercel function-cap or deploy-surface creep | HIGH | WATCH | deployment rejection, unexpected function count | collapsed routes, parked integrations outside active surface | adding API route family or reviving IG OAuth |
| R-08 | Telegram rate limit or slow notify stalls cron batch | HIGH | MITIGATED | 429 bursts, cron timeout, partial batch | cooldown/resume, bounded notify timeout, digest | sustained 429 or batch non-convergence |
| R-09 | Admin privilege boundary erosion | CRITICAL | MITIGATED | operator sees founder action, write without audit | founder gate, role split, audit trail | any admin write or auth change |
| R-10 | Runtime diagnostics report stale history as active incident | MEDIUM | MITIGATED | Overview/System mismatch, false degraded banner | shared truth model, stale downgrade rules | new health signal or read-model divergence |
| R-11 | Documentation continuity drift | HIGH | ACTIVE | contradictory baseline IDs, missing STEP history, old launch truth | STEP580 canon, handoff/current-state updates | every release/archive generation |
| R-12 | AI broad rewrite or invented runtime claim | HIGH | ACTIVE | scope expands, “live green” without evidence | CogniForge modes, Truth Boundary, narrow STEP contract | uncertainty in critical zone or >7-file runtime change |
| R-13 | Creator marketplace cold-start / empty opportunity feed | HIGH | WATCH | low useful inventory, low creator response | curated opportunities, structured cards, claim flow concept | feed/product implementation planning |
| R-14 | Third-party opportunity attribution or consent problem | HIGH | WATCH | repost appears first-party, unclear source/rights | source attribution, external-link truth, claim ownership later | ingesting real Instagram opportunities |
| R-15 | Product drift into complex CRM/dashboard | MEDIUM | ACTIVE | duplicate surfaces, workflow friction, unused admin complexity | workflow-first Creator OS thesis, Telegram-native invariants | major dashboard or multi-workspace proposal |
| R-16 | Trust/matching score becomes opaque or misleading | HIGH | PARKED | unexplained ranking, biased match, unsupported claims | evidence-based signals, explainable scoring requirement | before Match Engine implementation |
| R-17 | Deal stage or paid acceptance gate bypass through forged/direct callback | CRITICAL | MITIGATED | `deal_stage` without `accepted_by_user_id`, stage write without actor access | actor-scoped load, explicit access assertion, accepted-deal runtime guards, accepted-only SQL list/write guards, STEP586C source contract | any new deal mutation path or acceptance/credit change |
| R-18 | Paid-product copy/config drift or invoice fields rejected after copy expansion | HIGH | WATCH | UI price/result differs from server catalog, `sendInvoice` 400, stale parsed config key | runtime-derived labels, bounded 32/255 invoice fields, STEP586E source contract | any price/catalog/entitlement change or invoice rejection |
| R-19 | Private-object enumeration or authorization drift through recovery/error path | HIGH | MITIGATED | crafted callback confirms object detail, recovery route bypasses scoped lookup | neutral recovery copy, specific-membership proof before unrestricted read, STEP586F source contract | any new object-detail route, broad access-copy refactor or permission change |
| R-20 | One cron exception creates duplicate or collapsed OPS alerts | HIGH | WATCH | matching `cron_failed` + `cron_router_failed`, two job stack traces but one digest item | job-owned failure marker, router suppression, per-job/error-class dedup, failed last-run breadcrumb | any duplicate pair or cross-job suppression after STEP586H1 |

## Critical-zone handling

The following always require HEAVY governance and a rollback/verification plan:

- payments, Stars, credits, Brand Pass, unlocks;
- auth, secrets, webhooks, admin sessions;
- migrations and destructive data semantics;
- giveaway draw/claim correctness;
- cron concurrency, idempotency, outbox delivery;
- production rollout controls.

## Risk review template

Before a STANDARD/HEAVY STEP, record:

```text
Affected risks: R-__
New risk introduced: yes/no
Blast radius:
Rollback path:
Source verification:
Runtime verification required:
Residual risk:
```

## Current STEP580 assessment

- Change type: documentation/continuity only.
- Primary risks addressed: R-11, R-12, R-15.
- Runtime blast radius: none.
- Runtime verification: not applicable; repository archive integrity only.

## Current STEP586C assessment

- Change type: lifecycle copy plus accepted-deal defense in depth.
- Primary risks addressed: R-03, R-04, R-11, R-12, R-17.
- Runtime blast radius: brand application/deal UI, deal-stage mutation guard and accepted-deal queries.
- Rollback: revert the exact STEP586C file delta; no migration rollback is required.
- Source verification: canonical source preflight PASS; dedicated lifecycle guard PASS.
- Runtime verification required: live creator/brand application acceptance and deal-stage traversal in Preview/Staging.
- Residual risk: live data may contain historical `deal_stage` rows without accepted evidence; STEP586C hides them from deal lists rather than rewriting data.
## Current STEP586D assessment

- Change type: invite/reward copy plus shared mechanism constants; no economic change.
- Primary risks addressed: R-04, R-05, R-11, R-12.
- Runtime blast radius: invite screens and reward-rule constant reads used by existing DB backfill code.
- Rollback: revert the exact STEP586D delta; no migration rollback is required.
- Source verification: dedicated invite language/mechanism contract and targeted invite contracts PASS locally.
- Runtime verification required: first-start attribution, activation, confirmation timing and redeem on Preview/Staging test accounts.
- Residual risk: live Telegram wrapping and production ledger timing are not proven by source checks; operator invite vocabulary remains for STEP586G.

## Current STEP586E assessment

- Change type: paid-product copy, shared receipt/invoice builders and explicit payment-handler catalog dependency injection; no economic change.
- Primary risks addressed: R-03, R-04, R-11, R-12, R-18.
- Runtime blast radius: Stars invoice construction, payment success/recovery notifications and paid-product screens.
- Rollback: revert the exact STEP586E delta; no migration rollback is required.
- Source verification: paid-product contract, payment validation, callback/dependency/runtime and 221-file syntax checks PASS locally.
- Runtime verification required: one Preview/Staging invoice per product family without completing unintended purchases, plus approved test purchases for apply/retry evidence.
- Residual risk: live Telegram Stars and operator support/refund handling are unverified; two parsed Brand Plan config keys remain non-authoritative and need a separate ENV-governance decision.
## Current STEP586F assessment

- Change type: recovery taxonomy, bounded ordinary-user copy/empty-state changes and curator read-order hardening; no schema or economic change.
- Primary risks addressed: R-04, R-09, R-11, R-12, R-19.
- Runtime blast radius: Telegram stale/access failure rendering, selected empty states and curator workspace detail loading.
- Rollback: revert the exact STEP586F delta; no migration rollback or data rewrite is required.
- Source verification: dedicated recovery contract, STEP586A–E regressions, callback/dependency/runtime contracts and 223-file syntax surface PASS locally.
- Runtime verification required: Preview/Staging stale-button and unauthorized-object traversal for creator, brand, curator and giveaway paths.
- Residual risk: 123 exact `Нет доступа.` strings remain for later source classification; live Telegram wrapping and production stale-data combinations are unverified.

## STEP586H acceptance-specific risk

| ID | Risk | Severity | State | Mitigation | Escalation |
|---|---|---:|---|---|---|
| R-UX-LIVE-EVIDENCE | Source-green copy is presented as live-green without phone/deployment evidence | P1 | OPEN until remote pack PASS | Exact target acknowledgement; seven mandatory paths; screenshot/transcript requirement; PASS/FAIL/BLOCKED evaluator | Block release claim and rerun STEP586H on preview/staging |
| R-UX-ACCEPTANCE-SPEND | Operator accidentally buys Stars, spends invite points or launches a broadcast during UX acceptance | P1 | MITIGATED IN TOOLING | Read-only default; explicit approval flags; evaluator rejects unapproved spend/broadcast evidence | Stop acceptance, preserve evidence, review payment/broadcast state |
| R-UX-EVIDENCE-SECRET | Token, DB URL or personal data leaks into acceptance artifacts | P1 | PARTIALLY MITIGATED | Secret-pattern rejection, redaction rule, local gitignore | Rotate exposed secret immediately; remove artifact from history |

## Current STEP586H1 assessment

- Change type: production reliability hardening at DB acquisition and cron alert boundaries; no schema or business-logic change.
- Primary risks addressed: R-01, R-02, R-10, R-11, R-12, R-20.
- Runtime blast radius: all pool acquisitions, cron failure reporting and health JSON shape.
- Rollback: revert the exact STEP586H1 delta; no migration or data rollback is required.
- Source verification: dedicated resilience contract, health/dependency/runtime contracts, callbacks, package-lock and audit PASS locally.
- Runtime verification required: 24-hour production cron observation with health/OPS/last-run evidence.
- Residual risk: `PG_CONN_TIMEOUT_MS=1000` remains aggressive; external schedules still require manual staggering; optional broadcast-429 atomicity smoke is pre-existing FAIL and out of STEP586H1 scope.

## STEP588 backoffice-specific risks

| ID | Risk | Severity | State | Detection signal | Current mitigation | Escalation trigger |
|---|---|---:|---|---|---|---|
| R-21 | Sensitive web mutation without durable audit | CRITICAL | ACTIVE | money/access/state change exists only in 14-day Redis audit | current web writes limited to notes/drafts/test-send; sensitive actions Telegram-only | any new payment, entitlement, access, deal or giveaway web write |
| R-22 | Backoffice client/read-model monolith increases regression blast radius | HIGH | WATCH | unrelated sections change in one large file, repeated merge/test drift | source contracts, incremental strangler extraction decision | new domain adds >500 lines to existing monolith or repeated cross-section regressions |
| R-23 | Backoffice becomes a second product/backend | HIGH | MITIGATED | duplicated Telegram workflow or business mutation logic | ADR-001, collapsed API, canonical service reuse | proposal for parallel web user flow or separate money/state core |
| R-24 | Web write request provenance is insufficient after surface expansion | HIGH | WATCH | state-changing POST relies only on session cookie | SameSite Strict now; Origin/CSRF/replay gate required before expansion | first new sensitive web mutation |
| R-25 | Operational gaps remain invisible because no unified attention queue exists | MEDIUM | ACTIVE | operator must inspect multiple sections to find actionable case | STEP589A roadmap; Overview currently provides one next step | missed incident/case or repeated manual cross-section triage |

## Current STEP588 assessment

- Change type: documentation/architecture plus stale-test truth restoration.
- Primary risks addressed: R-07, R-09, R-11, R-12, R-15, R-21–R-25.
- Runtime business blast radius: none.
- Source verification: targeted admin/admin-web contracts PASS.
- Runtime verification required: live web-admin acceptance after STEP589 implementation, not for docs-only architecture.
- Residual release risk: STEP586H1 24-hour production observation remains pending.

## Current STEP588X2 assessment

- Change type: critical giveaway settlement unification and transactional sponsor replacement; no schema migration.
- Primary risks addressed: R-02, R-06, R-11, R-12, R-29, R-34.
- Runtime blast radius: manual draw, cron auto-draw, winner persistence, giveaway audit and sponsor replacement.
- Rollback: code rollback to STEP588X1; committed winner rows must not be silently rewritten or re-drawn.
- Source verification: 55 giveaway behavioral assertions, 124 registered source checks, 238 JavaScript syntax checks, generated-file parity and supplementary source invariants PASS locally.
- Runtime verification required: controlled manual top-up, replay/idempotency and cron canaries with SQL winner/audit evidence.
- Residual risk: real Neon connection termination and multi-session contention are not reproduced locally; notifications remain external side effects after the committed draw.

## Current STEP588X3 assessment

- Change type: critical broadcast delivery state-machine hardening plus additive migration 049.
- Primary risks addressed: R-02, R-10, R-11, R-12, R-30, R-34.
- Runtime blast radius: QStash delivery worker, legacy direct cron, broadcast sent-log state, Communications observability and founder reconciliation.
- Rollback: prefer fix-forward; rollback to STEP588X2 is unsafe while `delivery_unknown` rows exist because the old runtime lacks the terminal-state contract.
- Source verification: 35 unknown-state assertions, 126 registered source checks, 250 JavaScript syntax checks, dependency/runtime preflight and registry parity PASS locally.
- Runtime verification required: migration 049, controlled normal-send/replay, staging ambiguity injection, live unknown-state visibility and no-resend reconciliation evidence.
- Residual risk: at-most-once safety intentionally permits under-delivery when Telegram outcome cannot be determined; production QStash/Telegram behavior is not reproduced locally.

## Current STEP588X4 assessment

- Change type: critical admin-web identity proof, challenge/session state-machine and abuse-control hardening; no PostgreSQL migration.
- Primary risks addressed: R-04, R-09, R-11, R-12, R-31, R-32, R-34.
- Runtime blast radius: admin login start/status/exchange, Telegram approval callback, Redis challenge/session records, session validation and admin login UX.
- Rollback: security fix-forward or temporary `ADMIN_WEB_ENABLED=0`; rollback to STEP588X3 restores transferable approval links and unversioned sessions.
- Source verification: executable auth policy tests, auth binding contract, action/callback registry and full source regressions are required by preflight.
- Runtime verification required: origin/second-browser canary, actual Telegram approver identity, duplicate callback/exchange, old-session invalidation, idle expiry and bounded throttle evidence.
- Residual risk: actual Upstash Lua concurrency, Vercel cookie/domain behavior and live Telegram callbacks are not reproduced locally; Redis-only audit durability remains tracked separately.

## Current STEP588X5 assessment

- Change type: health/readiness truth and logging privacy hardening; no schema migration or new endpoint.
- Primary risks addressed: R-07, R-10, R-11, R-12 and R-33.
- Runtime blast radius: public/private health response policy, database/Redis readiness probes and selected structured log paths.
- Rollback: prefer fix-forward; rollback restores verbose public diagnostics and false-green readiness semantics.
- Source verification: 52 health/privacy assertions, 130 registered source checks, 257 JavaScript syntax checks, dependency/runtime preflight and npm audit PASS locally.
- Runtime verification required: public/private health canary, controlled NO_GO response and representative Vercel log inspection.
- Residual risk: full diagnostics depend on Redis-backed admin auth; platform-added metadata and external monitor compatibility require live observation.

## Current STEP588X6 assessment

- Change type: bounded replay, request-size, SQL-patch, mutation-truth and production-config hardening; no schema migration or product-flow redesign.
- Primary risks addressed: R-02, R-03, R-04, R-09, R-11, R-12, R-35, R-36 and R-37.
- Runtime blast radius: selected critical webhook updates, three generic DB patch helpers, admin auth/write request parsing and production runtime-initialization/readiness validation.
- Rollback: code rollback to STEP588X5 is possible but security-regressive; preserve Redis/log evidence and do not automatically replay `outcome_unknown` updates.
- Source verification: 36 X6 assertions, 132 registered source checks, X1–X5 critical regressions, dependency/runtime preflight and package-lock/registry/migration-pack gates PASS locally; one completed npm audit reported 0 vulnerabilities and the final repeat hit registry HTTP 502.
- Runtime verification required: production ENV preflight, one duplicate-suppression canary, one preview receipt-store failure, one HTTP 413 canary and one stale/missing-row mutation canary.
- Residual risk: replay receipts reduce provider-level retries but do not replace domain idempotency; a crash after an external/domain side effect can intentionally leave `outcome_unknown` requiring operator review.


## Current STEP588X7H1 assessment

- Change type: narrow production auth-callback routing correction; no schema or ENV change.
- Primary risk addressed: registered critical callback existed but was unreachable in the real callback router, causing admin-login denial and generic stale-button recovery.
- Runtime blast radius: `a:aw_auth_dec` only, plus removal of a latent undefined-variable branch from setup-forward handling.
- Security posture: browser binding, Telegram actor proof, Redis atomic transition and critical update replay receipt remain unchanged.
- Rollback: rollback to STEP588X7 restores the known defect; prefer fix-forward or temporarily disable admin web.
- Source verification: 63 auth assertions, auth source contracts, portable critical spine, callback/action registries and dependency preflight PASS.
- Runtime verification required: one approve, one deny, no `unknown_callback`, successful originating-browser exchange.


## STEP590 architecture-program risks

| ID | Risk | Severity | State | Detection signal | Mitigation | Escalation trigger |
|---|---|---:|---|---|---|---|
| R-38 | Callback route ownership remains implicit or duplicated during extraction | CRITICAL | ACTIVE | one action resolves to zero or multiple executable handlers; moved route reaches `unknown_callback` | STEP590B unique ownership registry, executable dispatch tests, aliases declared explicitly | any duplicate owner, missing owner or guard mismatch |
| R-39 | Structural refactor changes product behavior while presented as file movement | HIGH | ACTIVE | callback keys, copy, SQL, state transitions, audit or return shapes drift | before/after parity manifests; domain-specific regression; one bounded domain per STEP | any undeclared UX/schema/ENV/business-rule change |
| R-40 | Compatibility façades become permanent second ownership layers | HIGH | WATCH | new behavior added to `bot.js`/`queries.js` after domain extraction | façade freeze rule and retirement criteria in STEP590J | extracted domain adds new legacy branch/export implementation |
| R-41 | Module split creates circular or inverted dependencies | HIGH | WATCH | static cycle or repository/service/view direction violation | dependency rules and STEP590I automated import gates | first cycle or forbidden import |
| R-42 | Architecture program delays production remediation/acceptance evidence | MEDIUM | ACTIVE | structural work proceeds while H1/X1–X7 production state remains unknown | retain explicit release HOLD and separate production acceptance lane | architecture claim used to imply production readiness |

## Current STEP590A assessment

- Change type: docs-only architecture baseline, ownership inventory and extraction governance.
- Runtime blast radius: none.
- Primary risks addressed: R-22, R-38, R-39, R-40, R-41 and R-42.
- Rollback: remove the STEP590A documentation package; STEP588X7H1 runtime tree is unchanged.
- Source verification: baseline ZIP integrity, action/export inventories, static import graph, docs-only scope, registries and portable critical spine.
- Runtime verification required: none for STEP590A itself; STEP588X7H1 live admin-auth canary remains separate and pending.
- Residual risk: action/export domain assignment is partly heuristic and must be confirmed in each bounded extraction STEP.


## Current STEP590C1 assessment

- Change type: critical admin/auth callback domain extraction; no schema or ENV change.
- Primary risks addressed: R-38, R-39, R-40, R-41 and R-42.
- Runtime blast radius: `a:aw_auth_dec` and `a:admin_web_login_toggle` only.
- Security posture: actual Telegram approver, browser verifier binding, atomic Redis transitions, session consume, super-admin check and operator audit semantics remain canonical.
- Rollback: exact STEP590B code rollback is possible because persistent contracts are unchanged; bounded fix-forward is preferred.
- Source verification: 83 domain assertions, 2,299 router assertions, 63 auth assertions, 136/137 registered source checks and 280 JavaScript syntax checks PASS.
- Environment limitation: `npm ci` was blocked by internal mirror HTTP 404 for `xtend@4.0.2`; `test:bounded-safety-hardening` and the complete portable spine are therefore not newly claimed on the final tree.
- Runtime verification required: one fresh approve/exchange, one deny, one login-control toggle round trip and absence of unknown/ownership/phase errors.
- Residual risk: `renderAdminSystem` and operator-control storage remain injected from the composition root until later admin-domain extraction; this is an explicit compatibility seam, not a second implementation.
