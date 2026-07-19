# STEP589 — Backoffice Productization Roadmap

**Source:** STEP588 audit
**Precondition:** STEP586H1 24h observation and STEP587 release decision

## STEP589A — Attention Queue and Overview Actionability

**Mode:** STANDARD
**Risk score:** 9

Implement:

- unified read-only attention model;
- severity, age, owner action, evidence link;
- links into Runtime/Payments/Users;
- no new write actions;
- no live polling.

Do not:

- turn all warnings into tasks;
- add new API function;
- rewrite Overview shell.

DoD:

- deterministic priority rules;
- stale signal downgrade;
- source contracts;
- mobile first viewport check.

## STEP589B — Collaboration Control Center

**Mode:** HEAVY
**Risk score:** 12

Implement read-only:

- offers/applications/dialogs/deals tabs;
- lifecycle joins;
- accepted-deal evidence;
- stale/contradictory-state detection;
- user/brand drilldown;
- attention filter.

No mutations.

Critical invariants:

- a deal exists only with authoritative acceptance evidence;
- private objects require actor/operator gate;
- contact data remains protected;
- no N+1 list query.

## STEP589C — Growth & Trust Operations

**Mode:** HEAVY
**Risk score:** 12

Implement read-only tabs:

- invite attribution/rewards;
- giveaways draw/claim/publish evidence;
- moderation queue.

No ledger correction, redraw or approve action in first wave.

## STEP589D — Payments and Entitlements Case Workflow

**Mode:** CRITICAL
**Risk score:** 15

First substep remains read-only:

- filters/pagination;
- product/result evidence;
- delayed apply case state;
- linked user timeline;
- operator note/status.

Before any manual mutation:

- durable DB audit;
- Origin/CSRF/replay guard;
- canonical service reuse;
- exact confirmation;
- rollback/compensation;
- test Stars cases.

## STEP589E — Incremental Modularization

**Mode:** STANDARD
**Risk score:** 8

Extract only touched domains:

- client views/components;
- read-model facades;
- runtime queue/config modules.

No framework migration.

Success metric:

- reduced touched-file conflict and smaller domain blast radius;
- no behavior change.

## STEP589F — Live Operator Acceptance

**Mode:** HEAVY
**Risk score:** 12

Evidence paths:

1. login and session expiry;
2. overview attention item → detail;
3. user search → card → note;
4. collaboration case drilldown;
5. payment drilldown;
6. communications draft + test send;
7. runtime incident;
8. mobile status check.

Verdict:

- PASS;
- FAIL;
- BLOCKED.

No live-green claim without evidence.

## Explicit non-goals

- customer web dashboard;
- Telegram flow duplication;
- ORM migration;
- React/Next rewrite;
- new serverless route family;
- broad admin write access;
- redesign for visual novelty.
