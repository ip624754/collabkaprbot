# STEP590E5C — Active Architecture Risk Update

| ID | Risk | Severity | State | Required control |
|---|---|---:|---|---|
| R-66 | Notice/outbox extraction changes audience, draft or visible publication semantics | HIGH | SOURCE MITIGATED / PROD OPEN | preserve canonical audience/expiry/CTA helpers, draft truth, explicit publish path, executable route parity and bounded production smoke |
| R-67 | Outbox repeat/clear/template conversion duplicates delivery or destroys unresolved operator evidence | HIGH | SOURCE MITIGATED / PROD OPEN | preserve DB outbox truth, confirmation-before-clear, canonical repeat/template helpers, no delivery-engine rewrite |
| R-68 | Admin message-template extraction weakens super-admin authorization or captures user-facing notice/message actions | HIGH | SOURCE MITIGATED / PROD OPEN | exact owner registry, super-admin guard before mutation, explicit exclusion of `a:notice` and E5B direct-message send actions |

**Release gate:** R-66 through R-68 remain production-open until the exact STEP590E5C artifact is dependency-gated, deployed and exercised through bounded communications home, notice draft/view, outbox read-only/status and template-list paths. Destructive outbox clear or live notice publication is not mandatory unless explicitly approved.

---

# STEP590E3B — Active Architecture Risk Update

| ID | Risk | Severity | State | Required control |
|---|---|---:|---|---|
| R-49 | Profile/contact extraction weakens owner scoping or exposes structured contacts through a broad Workspace read | HIGH | SOURCE MITIGATED / PROD OPEN | preserve scoped Workspace loads, existing super-admin branch, public-contact redaction/unlock boundaries and bounded production smoke |
| R-50 | Instagram OAuth extraction becomes fail-open, leaks credentials/tokens or creates replayable start state | CRITICAL | SOURCE MITIGATED / PROD OPEN | preserve feature flags and config gates, owner Workspace validation, one-time Redis token/TTL, no secrets in callback payload/logs, bounded OAuth-start smoke |
| R-51 | Profile reset/share/template callback replay duplicates mutation or sends unintended external content | HIGH | SOURCE MITIGATED / PROD OPEN | canonical DB/render/send helpers, exact route ownership, cancel-first smoke, no destructive/reset production canary by default |

**Release gate:** R-49 through R-51 remain production-open until the exact STEP590E3B artifact is dependency-gated, deployed and exercised through bounded profile, contacts, sharing and Instagram entry paths. Live Meta OAuth completion and destructive profile reset are not mandatory unless explicitly approved.

---

# STEP590E3A — Active Architecture Risk Update

| ID | Risk | Severity | State | Required control |
|---|---|---:|---|---|
| R-47 | Workspace extraction weakens owner/editor/curator or cross-workspace authorization | HIGH | SOURCE MITIGATED / PROD OPEN | scoped Workspace loads, role checks before render, `getFolderAccess` before mutation, executable negative tests, bounded production smoke |
| R-48 | Folder/editor or disconnect/network callback replay duplicates mutation/audit effects | HIGH | SOURCE MITIGATED / PROD OPEN | preserve canonical DB methods and audit names, exact route ownership, no parallel state core, representative runtime marker scan |

**Release gate:** R-47 and R-48 remain production-open until the exact STEP590E3A artifact is dependency-gated, deployed and exercised through bounded owner/editor/curator/folder paths. No destructive production canary is mandatory unless the operator explicitly chooses it.

---

# STEP590E2 — Active Architecture Risk Update

| ID | Risk | Severity | State | Required control |
|---|---|---:|---|---|
| R-45 | Barter extraction weakens offer/thread/workspace authorization or trusts callback payload identity | HIGH | SOURCE MITIGATED / PROD OPEN | canonical hydrated actor, existing owner/manager/workspace checks, executable route parity, disposable cross-workspace negative canary |
| R-46 | Official publication or retry orchestration duplicates external Telegram/QStash effects | CRITICAL | SOURCE MITIGATED / PROD OPEN | keep canonical publish/verify/remove/retry helpers, preserve audit/message IDs, bounded disposable official-post canary, reject duplicate effects |

**Release gate:** R-45 and R-46 remain open until STEP590E2 deployment verifies representative discovery, offer, conversation/proof/report and official-publication paths without authorization drift, duplicate effects or payment-route capture.

---

# STEP590D — Active Architecture Risk Update

| ID | Risk | Severity | State | Required control |
|---|---|---:|---|---|
| R-40 | Shared navigation extraction changes role-mode state or input-mode escape semantics | HIGH | SOURCE MITIGATED / PROD OPEN | executable parity tests, role-gate source contract, live dual-role navigation canary |
| R-41 | Legacy callback aliases drift between runtime and consistency tooling | MEDIUM | SOURCE MITIGATED / PROD OPEN | one canonical frozen alias map consumed by runtime and QA, old-message production canary |
| R-42 | Shared Telegram receipt handling removes required recovery controls | MEDIUM | SOURCE MITIGATED / PROD OPEN | exact admin-receipt keyboard tests, service-message acknowledgement canary |

**Release gate:** R-40 through R-42 remain open until STEP590D deployment verifies Home/Menu, role switching, Guide, menu-push, receipt acknowledgement and at least one old-message alias in production.

---

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
| R-43 | Application/lead extraction drifts actor, role or workspace authorization | HIGH | ACTIVE | record from another actor/workspace becomes readable or mutable; callback payload identity is trusted | keep Telegram/hydrated actor canonical, inject existing access guards, executable authorization/source parity tests | first cross-workspace access, actor mismatch or unaudited status transition |
| R-44 | Canonical lead creation is split between public workspace and lead owners | HIGH | WATCH | `a:send_request_to_creator` and `a:wsp_lead_new` diverge or recurse across owners | own both actions in `lead_acquisition` and test normalization/reachability as one path | duplicate lead, cross-owner fallback or stale old-button regression |
| R-45 | Barter extraction weakens offer/thread/workspace authorization or trusts callback payload identity | HIGH | ACTIVE | cross-owner/workspace offer or thread becomes readable/mutable | canonical hydrated actor, existing owner/manager/workspace checks, exact route tests and negative canary | first authorization bypass or actor mismatch |
| R-46 | Official publication/retry extraction duplicates external effects or loses durable truth | CRITICAL | ACTIVE | duplicate official post, retry, remove or mismatched Telegram message ID/audit | canonical publish/verify/remove/retry helpers, durable audit/message IDs and disposable production canary | any duplicate external effect or durable/external divergence |
| R-47 | Directory extraction leaks hidden contacts or crosses Workspace/lead context | CRITICAL | ACTIVE | public profile reveals contact surface without preview/owner/unlock authority; back navigation crosses lead/workspace | retain canonical renderer/options, actor context and lead-scoped return parameters; negative source/runtime canary | first unauthorized reveal or cross-context navigation |
| R-48 | Contact-unlock extraction duplicates debit/retry or diverges Redis from durable DB truth | CRITICAL | ACTIVE | repeated charge, duplicate QStash job, unlock cache without durable state or durable unlock without UI recovery | preserve queue-first guard, dedup ID, token lock, atomic DB helper, retry and executable owner/queue/success tests | any duplicate debit, inconsistent unlock or lost retry evidence |

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


## Current STEP590C2 assessment

- Change type: critical payment callback transport extraction; no schema, ENV, pricing or fulfillment-state change.
- Primary risks addressed: R-38, R-39, R-40, R-41 and R-42.
- Runtime blast radius: six user purchase callbacks and ten Telegram-admin payment callbacks.
- Financial posture: signed payloads, durable ledger, `APPLYING/APPLIED`, replay suppression and atomic fulfillment remain in their existing canonical services.
- Rollback: exact STEP590C1 code rollback is possible because persistent contracts are unchanged; preserve payment/webhook evidence before rollback.
- Source verification: 164 domain assertions, 2,340 router assertions, 66 payment-critical assertions, 287 JavaScript syntax checks and 138/139 registered source checks PASS.
- Environment limitation: fresh `npm ci` was blocked by package-mirror HTTP 404 for `xtend@4.0.2`; bounded-safety and the complete portable spine are not newly claimed on the final tree.
- Runtime verification required: cancelled invoice rendering for available product families, admin payment ledger navigation and absence of callback ownership/domain dependency errors.
- Residual risk: the domain still receives a broad injected dependency object from the composition root; STEP590I must eventually enforce narrower capability interfaces.

## Current STEP590C3 assessment

- Change type: critical giveaway callback transport extraction; no schema or algorithm change.
- Primary risks addressed: route shadowing, duplicate ownership, misplaced handler reachability and monolith blast radius.
- Runtime blast radius: giveaway access, participant join/check, manual end, winners view and manual draw callbacks.
- Canonical correctness boundary: PostgreSQL atomic draw transaction and advisory/row locks remain unchanged.
- Rollback: code rollback only; committed winners and audit rows must never be rewritten or redrawn.
- Source verification: dedicated domain/router/critical tests and source preflight PASS; portable spine PASS with temporary dependency shims.
- Runtime verification required: bounded participant/owner canary; real draw only on a disposable or explicitly approved giveaway.
- Residual risk: remaining giveaway sponsor/publish/results/reminder callbacks still reside in legacy ownership and will be extracted separately.

## Current STEP590C4 assessment

- Change type: critical broadcast callback transport/composition extraction; no schema, ENV or delivery-state change.
- Primary risks addressed: route shadowing, duplicate ownership, direct-send duplication, implicit dispatch and monolith blast radius.
- Runtime blast radius: composer, audience selection, confirmation/cancel, broadcast list/view/blocked diagnostics, pause/resume/stop and QStash operator control.
- Canonical correctness boundary: idempotent broadcast-record creation plus existing delivery receipt/safety/worker paths remain unchanged.
- Rollback: code rollback to STEP590C3; preserve broadcast jobs, recipient logs, delivery receipts, QStash/cron evidence and unknown-state records before rollback.
- Source verification: 161 domain assertions, 2,440 router assertions, 35 broadcast-critical assertions, source preflight and portable spine PASS; dependency-backed runs are shim-assisted where declared.
- Runtime verification required: bounded composer/preview/audience/cancel/list/view/blocked canary with no live send or fanout mutation by default.
- Residual risk: target enumeration, worker execution, delivery reconciliation and some communications/admin flows remain outside this bounded callback domain and will be decomposed in later STEPs.

## Current STEP590E1 assessment

- Change type: applications, accepted-deals and leads callback transport/orchestration extraction; no schema, ENV or lifecycle-state redesign.
- Primary risks addressed: R-38, R-39, R-40 and R-41.
- Runtime blast radius: 53 callback actions across creator application flows, brand review/reply/acceptance, accepted deals, lead acquisition/workflow and lead audit.
- Canonical correctness boundary: existing workspace/role guards, application/lead write helpers, rate limits, audit evidence and DB repositories remain unchanged.
- Rollback: code rollback to exact STEP590D; preserve durable application, deal, lead, note and audit records created after deployment.
- Source verification: 302 domain assertions, 2,574 router assertions, action/callback registries, prior domain regressions and 316 JavaScript syntax checks PASS; source preflight and portable spine PASS under declared temporary dependency shims.
- Environment limitation: clean `npm ci` was blocked by internal mirror HTTP 404 for `xtend@4.0.2`; operator-side dependency/audit evidence remains required.
- Runtime verification required: bounded creator/brand/deal/lead navigation and disposable mutation canary, including workspace isolation and no duplicate notifications.
- Residual risk: broad capability injection remains a compatibility seam until repository decomposition and architecture import gates; `a:wsp_lead_new` ownership should remain explicitly tested because it moved from a public-workspace adjacency into canonical lead acquisition.


## Current STEP590E2 assessment

- Change type: Barter discovery, offer lifecycle, conversation/proof/report and official-publication callback orchestration extraction; no schema, ENV, API-route or status-model redesign.
- Primary risks addressed: R-38, R-39, R-40, R-41, R-45 and R-46.
- Runtime blast radius: 89 exact Barter callbacks across four post-user owners.
- Canonical correctness boundary: existing DB/Redis/QStash/Telegram helpers, workspace/owner/manager/moderator checks, audit names, external message identifiers and payment fulfillment remain unchanged.
- Explicit exclusion: `a:off_buy` and `a:off_buy_home` remain outside the Barter domain.
- Rollback: code rollback to exact STEP590E1H5; preserve offers, threads, proofs, reports, official-publication rows, audit events and Telegram message IDs created after deployment.
- Source verification: 492 domain assertions, 2,624 router assertions, 560/560 registry, 98/98 dependency parity, all prior domain/critical regressions, source preflight and portable spine PASS within the declared shim boundary.
- Environment limitation: clean dependency installation was blocked by implementation-mirror HTTP 404 for `xtend@4.0.2`; operator-side dependency, audit, Vercel and live integration evidence remains required.
- Runtime verification required: representative read-only paths plus disposable offer/thread/official-post mutation canary; explicitly verify no payment action is captured by Barter ownership.
- Residual risk: broad capability injection remains a compatibility seam until STEP590F/STEP590I; five registry-only Barter keys remain legacy-owned because no executable branch exists.

## Current STEP590E3C assessment

- Change type: directory search and public Workspace callback orchestration extraction; no schema, ENV, pricing, action-guard or visible-copy change.
- Primary risks addressed: R-38, R-39, R-40, R-41, R-43, R-44, R-47 and R-48.
- Runtime blast radius: six `a:pm_*` matching callbacks and four public Workspace/contact callbacks.
- Canonical correctness boundary: matching state helpers, `renderWsPublicProfile`, `db.unlockWorkspaceContactsWithCredits()`, monetization retry, Redis token lock/cache and Brand Pass helpers remain unchanged.
- Truth correction: `a:wsp_contact_unlock` was legacy-owned in the baseline; it is now explicitly owned by `directory_public_workspace` while retaining `pay / queue_first` metadata.
- Rollback: code rollback to exact STEP590E3B_R2; preserve durable debit/unlock, retry, lock, diagnostic and contact-pack evidence created after deployment.
- Source verification: 77 directory assertions, 2,784 router assertions, 560/560 registry, all prior extracted-domain regressions and 353 JavaScript syntax checks PASS.
- Environment limitation: clean `npm ci` is blocked by the implementation package mirror 404 for `xtend@4.0.2`; source preflight and portable spine stop only at missing `dotenv`.
- Runtime verification required: bounded matching/public-profile navigation plus an explicitly approved disposable unlock that proves no owner charge, no duplicate debit and durable/Redis parity.
- Residual risk: the public Workspace owner coordinates a broad monetization capability seam; STEP590F/STEP590I should narrow and statically enforce it.

## Current STEP590E4A assessment

- Change type: Brand directory/filter and Brand profile callback orchestration extraction; no schema, ENV, pricing, action-guard or visible-copy change.
- Runtime blast radius: 38 exact callbacks across `brand_directory` and `brand_profile`.
- Canonical correctness boundary: existing Brand profile DB helpers, Redis filter state, input modes, copy-safety and application-return helpers remain unchanged.
- Explicit exclusions: purchase callbacks remain payment-owned; applications/deals retain STEP590E1 owners; team and curator callbacks remain legacy.
- Rollback: code rollback to exact STEP590E3C commit `858a0b1`; preserve durable Brand profile changes created after deployment.
- Source verification: 212 domain assertions, 2,866 router assertions, 560/560 registry, prior domain regressions and 352 JavaScript syntax checks PASS; source preflight and portable spine 6/6 PASS under declared temporary dependency shims.
- Environment limitation: clean `npm ci`/`npm audit` remain operator-side; shim-assisted evidence does not claim real Upstash behavior.
- Runtime verification required: bounded directory/filter/application-return/profile navigation plus disposable profile mutation only with explicit operator intent.
- Residual risk: broad injected capability seams remain until STEP590F/STEP590I; registry-only Brand/curator keys remain for STEP590J dead-code retirement.


## Current STEP590E4B assessment

- Change type: Brand manager-mode and Brand team membership callback orchestration extraction.
- Runtime blast radius: 13 callbacks split into two executable owners.
- Correctness boundary: existing `brand_managers` DB helpers, Redis manager state/invite TTL and Telegram notifications remain canonical.
- Bounded parity correction: `a:bm_rm_ok` now defines `wsId` and `ret` before the empty-team recovery branch, preventing a pre-existing ReferenceError.
- Explicit exclusions: Brand directory/profile, payments, applications/deals and curator flows are not modified.
- Source verification: 83 domain assertions, 2,893 router assertions, 560/560 registry and prior domain regressions PASS; source preflight and portable spine 6/6 PASS under declared temporary shims.
- Runtime verification required: manager cabinet entry/brand switching, owner team screen, disposable invitation, add/remove and removed-manager notification.
- Residual risk: invitation and role-state changes depend on Redis/DB parity; use bounded disposable accounts for production canary.


## Current STEP590E4C assessment

- Change type: curator cabinet/giveaway operations and owner-side curator management callback orchestration extraction.
- Runtime blast radius: 23 callbacks split into `curator_operations` (16) and `curator_management` (7).
- Correctness boundary: existing role flags, Workspace membership proof, curator DB helpers, giveaway audit helpers, Redis checked/note/rate-limit/invite state and Telegram notifications remain canonical.
- Explicit exclusions: Workspace-owned `a:cur_ws`/`a:cur_ws_off`, Brand domains, payments, applications/deals, admin moderation and registry-only curator aliases are not modified.
- Watchlist preserved: Telegram share links retain the invisible non-empty `url=` workaround; curator notes/invites retain explicit degraded-store recovery; public and participant surfaces receive no curator-only data.
- Source verification: 136 domain assertions, 2,942 router assertions, 560/560 registry and all prior extracted-domain regressions PASS; source preflight and portable spine 6/6 PASS under declared temporary shims.
- Environment limitation: clean `npm ci`/`npm audit` remain operator-side; shim-assisted evidence does not claim live Upstash behavior.
- Runtime verification required: curator cabinet/inbox, one Workspace, one giveaway read path, checked/note cancellation, disposable invite and owner-side remove confirmation.
- Residual risk: role mutations depend on DB/Redis parity and best-effort Telegram notification; production canary must use bounded disposable actors.


## Current STEP590E5A assessment

- Change type: moderation report/dispute and verification callback orchestration extraction.
- Runtime blast radius: 10 callbacks split into `moderation_reports` (6) and `moderation_verification` (4).
- Correctness boundary: existing moderator-role resolution, report/offer/thread DB helpers, audit writes, verification status writes and Telegram notifications remain canonical.
- Bounded hardening: malformed/non-positive `rid` and `uid` values are rejected before DB mutations or verification state changes.
- Explicit exclusions: moderator membership governance (`admin_mod_*`), admin users/support/comms/system/founder, payment-admin and public verification application flows are not modified.
- Source verification: 84 domain assertions, 2,965 router assertions, 560/560 registry and all prior extracted-domain regressions PASS; source preflight and portable spine 6/6 PASS under declared temporary shims.
- Environment limitation: clean `npm ci`/`npm audit` remain operator-side; shim-assisted evidence does not claim live Postgres, Redis or Telegram behavior.
- Runtime verification required: moderator home, report queue/view, one disposable freeze/close/resolve path, verification queue/view and disposable approve/reject flow.
- Residual risk: mutations are durable and notification delivery is best-effort; production canary must use bounded disposable records and avoid real-user verification state unless explicitly approved.


## Current STEP590E5B assessment

- Change type: admin users, gifts/access, support and moderator-membership callback orchestration extraction.
- Runtime blast radius: 38 callbacks split across four exact owners.
- Correctness boundary: existing super-admin checks, DB helpers, Redis sessions/TTL, support-thread writes, role-cache invalidation and Telegram delivery remain canonical.
- Explicit exclusions: communications templates/notices/outbox, admin system/founder, payment-admin and moderation reports/verification are not modified.
- Source verification: 266 domain assertions, 2,965 router assertions, 560/560 registry and all prior extracted-domain regressions PASS; source preflight and portable spine 6/6 PASS under declared temporary shims.
- Environment limitation: clean `npm ci`/`npm audit` remain operator-side; shim-assisted evidence does not claim live Postgres, Redis or Telegram behavior.
- Runtime verification required: users list/card, note cancel, support read surface, moderator list and gift/revoke cancel paths.
- Residual risk: these are privileged mutation surfaces; production smoke must avoid real bans, gifts, moderator removals and outbound user messages unless explicitly disposable.
