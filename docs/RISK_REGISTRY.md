# RISK REGISTRY — Collabka PR

**Status:** living register
**Introduced:** STEP580
**Review cadence:** before high-risk STEPs and during release readiness reviews

Severity: `LOW / MEDIUM / HIGH / CRITICAL`
State: `ACTIVE / WATCH / MITIGATED / ACCEPTED / PARKED`

| ID | Risk | Severity | State | Detection signal | Current mitigation | Escalation trigger |
|---|---|---:|---|---|---|---|
| R-01 | Neon/serverless connection timeout on first query or cold wake | HIGH | WATCH | `Connection terminated due to connection timeout`, first-query failures | bounded requests, health visibility, retry only where safe | repeated production failures or user-facing loss |
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
