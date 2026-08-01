# STEP590A — Modular Monolith Dependency Rules

**Status:** binding rules for STEP590B–J.
**Scope:** architecture extraction only; no runtime behavior change is implied.

## Allowed layers

1. **Composition** — creates bot/API/job dependencies and registers routes.
2. **Transport** — Telegram callbacks, commands, message modes and HTTP handlers.
3. **Domain** — services, policies and pure views.
4. **Persistence/adapters** — repositories, Redis, PostgreSQL and external APIs.
5. **Shared pure utilities** — formatting/parsing with no domain ownership.

Allowed direction:

```text
composition → transport → domain → persistence/adapters
```

## Rules

### R1 — One action, one runtime owner

Every `a:*` registry entry must resolve to exactly one executable owner, one declared alias or one declared retired/tombstone entry. UI references do not count as ownership.

### R2 — Registration is executable

Action ownership must be registered through the canonical callback router. A source string found in an unrelated handler is not proof of reachability.

### R3 — Guard metadata remains canonical

`src/bot/actionRegistry.js` remains the guard/type source of truth until a separately approved replacement. Extraction cannot downgrade `REQUIRE_REDIS`, `DB_TRUTH` or `QUEUE_FIRST` behavior.

### R4 — Transport owns Telegram context

Only transport/view code may directly use Grammy `ctx` mutation methods. Domain services accept explicit values and return explicit results.

### R5 — Services own orchestration

Callbacks parse/ack/render; services enforce product operations. Callbacks must not create parallel payment, giveaway, broadcast or auth state machines.

### R6 — Repositories own SQL

DB modules may import pool/config/safe-patch helpers. They must not import Telegram modules, views or domain callback handlers.

### R7 — Views are side-effect free

Views may construct text/keyboards but cannot mutate DB/Redis or execute external sends.

### R8 — Domain internals are private

A domain may import another domain only through its public `index.js` or explicit service contract. Direct import of another domain's internal callback/view/repository file is forbidden.

### R9 — Jobs do not call callbacks

Jobs use domain services/repositories and external adapters. They never manufacture Telegram callback context.

### R10 — Compatibility façades are temporary and measurable

`src/db/queries.js` and legacy callback delegation may re-export/delegate during extraction. New product behavior must not be added to compatibility façades after the corresponding domain has been extracted.

### R11 — No static cycles

The current baseline has no detected static relative-import cycle. Every STEP must preserve that invariant.

### R12 — No hidden product change

Architecture extraction cannot silently change copy, callback keys, DB schema, ENV, payment semantics, eligibility, delivery retry policy, permissions or audit behavior.

## Planned automated gates

STEP590I should enforce:

- unique callback ownership;
- all registry actions classified;
- all aliases point to registered canonical actions;
- moved routes have executable dispatch tests;
- no forbidden layer imports;
- no static import cycle;
- no new imports from domain modules into `bot.js` compatibility internals;
- DB export parity while the façade exists;
- file concentration budgets with explicit allowlist/debt notes.

## Exception process

An exception requires:

- named STEP and owner;
- reason the dependency is necessary;
- bounded duration;
- regression test;
- removal condition;
- entry in `docs/RISK_REGISTRY.md` when production-impacting.
