# STEP588X Independent Audit — Active Risk Override

The following risks override earlier release optimism until remediation evidence exists.

| ID | Risk | Severity | State | Required control |
|---|---|---:|---|---|
| R-26 | Payment fulfillment commits outside payment APPLIED transaction | CRITICAL | ACTIVE | Source uses one atomic service; migration 048 + production canary required |
| R-27 | Payment ledger absence fails open into product/credit fulfillment | CRITICAL | ACTIVE | Source fail-closed implemented; production migration/canary evidence required |
| R-28 | Matching/featured session removed before durable paid apply | HIGH | ACTIVE | Durable context + post-commit cleanup implemented; live evidence required |
| R-29 | Giveaway auto-draw runtime binding defect and split manual path | CRITICAL | ACTIVE | Source uses one atomic service; production manual/replay/cron evidence required |
| R-30 | Broadcast Telegram send may succeed while DB remains reclaimable | CRITICAL | ACTIVE | unknown terminal state; no auto-resend |
| R-31 | Admin challenge/approval URL can act as transferable privileged capability | CRITICAL | ACTIVE | browser binding + Telegram callback + one-time consume |
| R-32 | Admin fallback code lacks crypto generation/throttling/lockout | HIGH | ACTIVE | disabled-by-default production fallback |
| R-33 | Public health and webhook logs expose excess operational/personal data | HIGH | ACTIVE | protected diagnostics + redaction |
| R-34 | Source-heavy test portfolio misses transaction/crash/race defects | HIGH | ACTIVE | STEP588X7 executable critical-path suite |
| R-35 | Generic dynamic SQL/body/update helpers retain latent safety footguns | MEDIUM | WATCH | allowlists, size caps, row-count truth |

**Release gate:** R-26 through R-28 are source-remediated but remain active until STEP588X1 migration/canary evidence. R-29 is source-remediated but remains active until STEP588X2 manual/replay/cron evidence. R-30 through R-34 still require implementation. STEP587 GO and STEP589 remain paused.

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
