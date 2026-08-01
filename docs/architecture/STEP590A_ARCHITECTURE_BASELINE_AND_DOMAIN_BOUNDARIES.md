# STEP590A — Architecture Baseline, Domain Boundaries & Zero-Regression Extraction Plan

**Date:** 2026-08-01
**Mode:** HEAVY / read-only architecture
**Risk Score:** 9/20
**Baseline artifact:** `collabkaprbot_STEP588X7H1_ADMIN_AUTH_CALLBACK_ROUTING_FULL.zip`
**Baseline ZIP SHA-256:** `0054f38c756ff943e978a2e6e3bfcc3eae9fcfe1fa852e046a1e643c1c0c5f5e`

## Verdict

> Collabka should evolve as a modular monolith. The current product and infrastructure stack remain valid; the primary architecture risk is concentration of unrelated Telegram, domain and persistence responsibilities in a small number of oversized files.

STEP590A does not move runtime code. It establishes reproducible ownership inventories, target boundaries, extraction order and acceptance rules for STEP590B–J.

## 1. Verified current-state inventory

| Metric | Verified value |
|---|---:|
| Repository files | 678 |
| JavaScript files | 267 |
| `src/bot/bot.js` | 41,692 lines |
| `src/db/queries.js` | 9,211 lines |
| `scripts/admin-web.js` | 4,667 lines |
| `src/bot/cron.js` | 2,216 lines |
| Action registry entries | 560 |
| Action registry entries directly handled in `bot.js` by the ownership heuristic | 542 |
| Directly extracted admin-auth actions | 1 |
| Directly extracted giveaway-access actions | 4 |
| Alias/generated/registry-only actions requiring explicit classification | 13 |
| Exported values from `queries.js` | 328 |
| Callback handler region | lines 24,830–37,732, approximately 12,903 lines |
| `getBot()` function span | approximately 18,114 lines |
| Static relative-import cycles | 0 |

The source has no detected static ESM import cycle. That is a positive baseline. It does not remove the concentration risk caused by large composition functions, shared mutable callback context and a broad `db` façade.

### Highest concentration files

| File | Lines | Named function declarations | Distinct `a:*` literals |
|---|---:|---:|---:|
| `src/bot/bot.js` | 41,692 | 809 | 549 |
| `src/db/queries.js` | 9,211 | 372 | 0 |
| `scripts/admin-web.js` | 4,667 | 179 | 0 |
| `src/bot/cron.js` | 2,216 | 53 | 4 |
| `src/lib/adminWeb/readModels.js` | 1,213 | 37 | 0 |
| `src/lib/adminWeb/runtime.js` | 1,150 | 28 | 0 |
| `api/health.js` | 1,041 | 9 | 0 |

Counts are generated from the STEP590A inventory and are intended as structural evidence, not as a code-quality score by themselves.

## 2. Why the change is justified now

The STEP588X7H1 incident is direct evidence of architecture risk:

```text
registered action
+ source-visible handler
+ green source checks
+ handler located under the wrong Telegram transport branch
= production unknown_callback
```

The issue was not missing business logic. It was misplaced ownership and lack of executable dispatch proof. STEP590 therefore prioritizes callback ownership and dispatch reachability before broad file decomposition.

Existing extracted modules show the correct direction:

- `src/bot/adminWebAuthCallback.js`;
- `src/bot/paymentFulfillmentCore.js`;
- `src/db/giveawayAtomicCore.js`;
- `src/bot/broadcastDeliverySafety.js`;
- `src/bot/broadcastDeliveryReceipt.js`;
- `src/bot/payments/starsHandlers.js`;
- `src/bot/routes/gwAccess.js`.

These modules should be reused and composed, not duplicated.

## 3. Current action ownership

The action registry remains the canonical guard/type source of truth.

Current proposed domain distribution:

| Domain | Actions |
|---|---:|
| Admin | 88 |
| Barter | 84 |
| Giveaways | 67 |
| Workspaces | 67 |
| Applications | 33 |
| Brand profile | 32 |
| Broadcasts | 27 |
| Leads | 19 |
| Curation | 16 |
| Brand management | 12 |
| Navigation | 12 |
| Official publish | 12 |
| Monetization products | 11 |
| Brand directory | 10 |
| Moderation | 10 |
| Payments admin | 9 |
| Sharing | 9 |
| Admin broadcast | 6 |
| Directory search | 6 |
| Workspace public surface | 5 |
| Audience | 4 |
| Onboarding | 4 |
| Account | 3 |
| Notifications | 3 |
| Support | 3 |
| Verification | 3 |
| Founder | 2 |
| Payments | 2 |
| Admin auth | 1 |

The ownership CSV is a planning inventory. Domain assignment is deterministic by current naming and known aliases, but it remains a proposed target until the corresponding extraction STEP approves it.

Machine-readable source:

- `docs/architecture/STEP590A_ACTION_OWNERSHIP.csv`.

## 4. Current database ownership

`src/db/queries.js` exposes 328 values through one import surface. Proposed distribution:

| Repository domain | Exports |
|---|---:|
| Barter | 59 |
| Giveaways | 40 |
| Workspaces | 40 |
| Users | 38 |
| Applications | 35 |
| Broadcasts | 34 |
| Payments | 33 |
| Shared or requiring review | 20 |
| Brands | 11 |
| Official publish | 6 |
| Verification | 5 |
| Instagram | 4 |
| Audit | 3 |

Machine-readable source:

- `docs/architecture/STEP590A_DB_EXPORT_OWNERSHIP.csv`.

The initial split must preserve `src/db/queries.js` as a compatibility façade. Existing consumers may continue importing `* as db` until each domain is migrated and parity is proven.

## 5. Target architecture

```text
src/
├── app/
│   └── composition.js
├── bot/
│   ├── createBot.js
│   ├── router/
│   │   ├── callbackRouter.js
│   │   ├── callbackOwnership.js
│   │   ├── commandRouter.js
│   │   └── messageRouter.js
│   ├── middleware/
│   ├── shared/
│   └── domains/
│       ├── adminAuth/
│       ├── payments/
│       ├── giveaways/
│       ├── broadcasts/
│       ├── navigation/
│       ├── applications/
│       ├── leads/
│       ├── barter/
│       ├── workspaces/
│       ├── brands/
│       ├── curation/
│       ├── moderation/
│       └── support/
├── db/
│   ├── queries.js              # temporary compatibility façade
│   ├── users.js
│   ├── payments.js
│   ├── giveaways.js
│   ├── broadcasts.js
│   ├── workspaces.js
│   ├── applications.js
│   ├── barter.js
│   ├── brands.js
│   ├── audit.js
│   └── shared.js
├── jobs/
│   ├── runner.js
│   ├── paymentRecovery.js
│   ├── giveawayLifecycle.js
│   ├── broadcastDelivery.js
│   └── maintenance.js
└── lib/
```

This is a target ownership model, not permission to create all directories in one patch.

## 6. Domain module contract

A domain may use the following roles where needed:

```text
callbacks.js     Telegram callback transport adapter
commands.js      command transport adapter
messages.js      message/input-mode transport adapter
service.js       domain orchestration and business operations
policy.js        permissions and state-transition rules
views.js         text and keyboard construction
repository.js    optional domain-facing persistence contract
index.js         public exports only
```

Not every domain needs every file. Small domains should remain small.

### Hard dependency direction

```text
API / bot composition
→ transport routes
→ domain service / policy
→ repository
→ pool / external adapters
```

Forbidden directions:

- repository → Telegram/Grammy;
- service → `ctx.reply`, `ctx.editMessageText` or callback acknowledgement;
- view → DB/Redis mutation;
- one domain → another domain's private files;
- job → callback route;
- DB module → bot module;
- shared helper → product domain.

The full rules are in `STEP590A_DEPENDENCY_RULES.md`.

## 7. Extraction sequence

### STEP590B — Executable Callback Router & Ownership Gate

Create one explicit registration surface. Every registered action must have exactly one owner or an explicit alias/tombstone record. Dispatch tests must execute the real route.

### STEP590C — Critical Domain Extraction

Bounded substeps:

1. admin-auth registration and route ownership;
2. payment callbacks around the existing canonical fulfillment core;
3. giveaway callbacks around the existing atomic draw core;
4. broadcast callbacks around the existing delivery safety core.

No money, draw or delivery semantics may change.

### STEP590D — Navigation and Shared Telegram UX

Extract menu/home/stale-button recovery/edit-or-reply/input reset/footer navigation. Preserve Redis-degraded navigation and share URL compatibility.

### STEP590E — Product Domain Extraction

One deployable domain per substep:

1. applications and leads;
2. barter;
3. workspaces and public directory;
4. brands and curation;
5. admin and moderation;
6. support, verification, sharing and account.

### STEP590F — DB Query Decomposition

Move functions by repository domain while retaining `queries.js` as an export façade. Preserve names, signatures, SQL, transaction boundaries and return shapes.

### STEP590G — Job Decomposition

Move cron work into bounded job modules while retaining one scheduler/composition surface and the existing Vercel function budget.

### STEP590H — Admin Web Client Decomposition

Split the large generated/browser script by views/state/router while preserving one deployable asset and the current API contract.

### STEP590I — Architecture Gates

Add executable checks for ownership uniqueness, dependency direction, route reachability, compatibility exports and size budgets.

### STEP590J — Legacy Retirement

Remove legacy callback branches and compatibility exports only after all consumers and parity gates are green.

## 8. Zero-regression contract

Every extraction STEP must prove:

```text
before action registry == after action registry
before guard metadata == after guard metadata
before callback key set == after callback key set
before DB export set == after DB export set
before migration set == after migration set
before user-visible copy == after user-visible copy, unless explicitly scoped
critical portable spine == PASS
route reachability for moved actions == PASS
unknown callback behavior == unchanged for truly unknown actions
```

Additional critical checks:

- one action has one runtime owner;
- aliases resolve before guard lookup or have explicit legacy metadata;
- moved privileged routes retain the same guard and replay receipt;
- callback acknowledgement remains bounded and idempotent;
- no new DB transaction boundary is introduced by file movement;
- no new Vercel function is created without a separate function-budget decision.

## 9. Stop conditions

Stop the current extraction STEP and fix-forward when any of the following occurs:

- action registry drift;
- moved action reaches `unknown_callback`;
- duplicate action ownership;
- guard downgrade;
- callback/user-visible copy drift outside scope;
- critical-spine failure;
- DB export/signature drift;
- new static import cycle;
- migration or ENV change not declared in the STEP plan.

## 10. Success criteria for the program

The program is complete only when:

- `bot.js` is composition and shared compatibility code, not the primary owner of product behavior;
- `queries.js` is a small compatibility façade or retired;
- critical routes have executable dispatch tests;
- domains have explicit public surfaces;
- jobs have explicit budgets, locks and receipts;
- architecture gates prevent re-concentration;
- user behavior and production contracts remain stable throughout extraction.

Line-count targets such as `bot.js ≤ 1,500` are directional exit criteria, not permission for artificial fragmentation.

## Truth boundary

Verified in STEP590A:

- baseline ZIP integrity and SHA;
- file/action/export/line inventories;
- callback concentration;
- no detected static relative-import cycle;
- existing extracted canonical services and route modules.

Not verified in STEP590A:

- runtime behavior after future extraction;
- production readiness of STEP588X1–X7H1;
- exact final module count;
- that every heuristic domain assignment is final;
- that a line-count reduction alone improves correctness.
