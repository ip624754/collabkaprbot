# STEP588 — Backoffice Productization Audit & Architecture

**Mode:** STANDARD with security/adversarial review
**Parent baseline:** STEP586H1
**Change type:** documentation + test-truth restoration
**Runtime business logic:** unchanged

## Executive conclusion

Web-admin уже нормальный и по ряду зон сильнее типичного startup backoffice.

Это не «простая админка». В исходниках подтверждены:

- Telegram-approved session auth;
- founder/operator split;
- overview cockpit;
- зрелый users workspace;
- runtime/queue/config truth;
- payment drilldown;
- communications draft workspace;
- audit breadcrumbs;
- 48 dedicated admin-web source contracts.

Оценка:

| Область | Score |
|---|---:|
| Auth/session safety | 8.5/10 |
| Operator write safety | 9/10 |
| Overview/runtime truth | 8/10 |
| Users workspace | 9/10 |
| Payments/comms | 7.5/10 |
| Product-domain coverage | 6/10 |
| Maintainability | 5.5/10 |
| Mobile readiness | 7/10 |
| Durable audit readiness | 5/10 |
| Overall current backoffice | **7.5/10** |

Как foundation — около **8.3/10**.
Как полностью покрывающий продукт backoffice — около **6.8/10**.

## Truth boundary

Verified from source:

- route and API inventory;
- auth/session implementation;
- current write surface;
- file sizes and test inventory;
- current read models;
- Vercel collapsed API design;
- admin-web source contract results.

Not verified:

- live production rendering;
- actual operator task time;
- mobile browser behavior;
- production session/auth traversal;
- real DB query latency;
- user comprehension;
- 24-hour STEP586H1 observation.

## Findings

### P0

None confirmed.

### P1 — source contract truth drift

Six admin-web smoke contracts had stale expectations before STEP588:

1. Runtime hierarchy expected old English label `Control plane snapshot`.
2. Runtime queues expected old English labels after STEP586G Russian copy migration.
3. Asset cache-bust contract hardcoded `20260404-step545`, while `admin.html` used `20260405-step545`.
4. User-card contract expected superseded headings/helpers/read-model fields.
5. Users interaction-clarity contract expected superseded copy and treated currently interactive cohort cards as non-clickable.
6. Users rails-hierarchy contract expected obsolete `Level 1 / Level 2` markers and old CSS structure.

STEP588 repaired only test expectations. Runtime UI was already authoritative. All 54 targeted admin/admin-web/backoffice contracts pass after the fixes.

A new `smoke:backoffice-productization-contract` is wired into source preflight. It freezes the accepted architecture: static SPA, three collapsed admin endpoints, direct `pg`, no ORM/framework rewrite, and no sensitive web mutations before durable audit and request-provenance guards.

### P1 product gap — collaboration operations absent

The web-admin cannot answer the central operational question:

> Где застряла конкретная коллаборация?

Offers, applications, dialogs and deals are available in bot/DB logic but not as a coherent web workspace.

Recommendation: first new productized surface should be a read-only Collaboration Control Center.

### P1 gate before broad writes — audit is not durable

`admin_web` audit currently uses Redis:

```text
100 recent entries
14-day TTL
```

That is sufficient for notes/drafts/test-send. It is not sufficient for money, access, entitlement, deal or giveaway mutations.

Recommendation: durable DB audit is mandatory before expanding sensitive web writes.

### P2 — monolithic client and read models

- `scripts/admin-web.js`: 4 575 lines;
- `readModels.js`: 1 166 lines;
- `runtime.js`: 1 150 lines;
- CSS: 2 268 lines.

This is maintainability debt, not a reason for broad rewrite.

Recommendation: strangler extraction by touched domain.

### P2 — no unified operator attention queue

Overview identifies a next step, but there is no persistent list of actionable cases across runtime, payments, moderation, deals and delivery.

Recommendation: add a bounded attention model. Do not convert every warning into a task.

### P2 — write provenance hardening required before expansion

Current `SameSite=Strict`/HttpOnly/Secure posture is good. There is no explicit Origin/CSRF check.

Recommendation: before adding new state-changing actions, add Origin validation, CSRF/action nonce and replay guard.

### P2 — multiple-approver code fallback attribution

When code fallback is used with more than one approver, `approvedByTgId` can remain `0`. This preserves access but weakens actor attribution and founder detection.

Recommendation: keep Telegram signed approval as preferred path; if code fallback remains, bind it to an explicit approver identity in a separate auth STEP.

### P3 — challenge stores short-lived raw IP preview

The challenge record includes raw IP preview for Telegram operator context. TTL is short, but it is still personal operational data.

Recommendation: retain only if useful; otherwise show coarse/hash-only context.

## Architecture decision

Do not rebuild the admin.

Do not add ORM.

Do not create a second backend.

Productize the current admin by adding missing operator jobs through the existing collapsed API and canonical services.

## Immediate roadmap decision

The next backoffice implementation wave is not another shell redesign.

Correct order after release gates:

1. STEP589A — Attention Queue and Overview Actionability.
2. STEP589B — Collaboration Control Center.
3. STEP589C — Growth & Trust Operations.
4. STEP589D — Payments/Entitlements Case Workflow.
5. STEP589E — Incremental Client/Read-Model Modularization.
6. STEP589F — Live Operator Acceptance.

STEP587 and STEP586H1 observation remain separate release gates. Backoffice feature rollout must not hide an unresolved cron reliability signal.
