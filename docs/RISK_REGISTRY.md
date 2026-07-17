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
| R-05 | Invite reward truth drift between copy and ledger | HIGH | WATCH | UI promises unavailable reward, wrong activation wording | separate invite/activation/reward states, education copy, ledger unchanged | any reward-rule change |
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
