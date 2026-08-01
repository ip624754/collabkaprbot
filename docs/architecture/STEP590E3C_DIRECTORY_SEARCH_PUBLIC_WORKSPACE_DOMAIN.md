# STEP590E3C — Directory Search & Public Workspace Domain Extraction

**Date:** 2026-08-01
**Mode:** HEAVY
**Risk score:** 15/20
**Baseline:** STEP590E3B_R2 source artifact, package `1.3.22`
**Package:** `1.3.23`

## Objective

Extract the remaining directory search and public Workspace callback orchestration from the legacy post-user dispatcher into explicit executable owners without changing search behavior, public-profile visibility, Brand Pass pricing, queue-first monetization, durable unlock truth, callback keys or user-visible copy.

This STEP closes the Workspace/Directory callback tranche. It does not redesign matching, public profiles, lead acquisition, credit products or payment fulfillment.

## Exact ownership delta

```text
directory_search:           6
directory_public_workspace: 4
newly extracted:           10
cumulative:               285 extracted / 275 legacy
registry:                 560
aliases:                    7
unresolved:                 0
```

The action-level delta is recorded in `STEP590E3C_ACTION_OWNERSHIP_DELTA.csv`.

## Bounded module

```text
src/bot/domains/directory/
├── actions.js
├── callbacks.js
├── index.js
├── policy.js
└── route.js
```

The domain is an orchestration adapter. Existing renderers, repositories, Redis helpers, role/brand-manager resolution, monetization retry/lock helpers and Telegram surfaces remain canonical and are injected from `src/bot/bot.js`.

## Route owners

### `directory_search`

Owns six `a:pm_*` actions covering:

- matching home;
- filter reset;
- vertical/format selection;
- bounded filter toggles;
- paginated search execution;
- matched public Workspace open.

### `directory_public_workspace`

Owns four actions covering:

- owner preview;
- public Workspace open, including read-only lead context;
- contact-unlock decision surface;
- queue-first/DB-truth contact unlock.

## Truth-boundary correction

The implementation inventory confirmed that `a:wsp_contact_unlock` was still legacy-owned in the STEP590E3B_R2 baseline. It was not part of `payment_purchase`. Therefore STEP590E3C correctly contains ten actions, not nine.

The action remains registered as:

```text
type:  pay
guard: queue_first
```

Moving its callback owner does not move or redesign the monetization core.

## Compatibility seams retained

- `a:wsp_lead_new` remains `lead_acquisition` owned.
- Brand Pass purchase callbacks remain in their existing owners.
- Search state helpers and limits remain unchanged.
- `renderWsPublicProfile` remains the canonical public-profile renderer.
- `db.unlockWorkspaceContactsWithCredits()` remains the canonical durable debit/unlock operation.
- QStash retry, token lock, diagnostics and Redis unlock cache retain their existing keys, TTLs and state semantics.
- Existing callback keys, action types, guards and aliases remain unchanged.

## Preserved invariants

1. Telegram/hydrated actor identity remains canonical; callback payload never supplies actor identity.
2. Brand-manager context resolution for `ws:0` remains unchanged.
3. Matching filter limits, state shape and pagination remain unchanged.
4. Public profiles hide direct contacts by default.
5. Owner preview reveals the same existing surface without changing public visibility rules.
6. Lead-context public profile remains read-only and returns to the originating lead dialog.
7. Contact request reads Redis first and uses DB fallback only when Redis is unavailable.
8. Contact unlock remains queue-first when async retry is enabled.
9. Owner access never charges credits.
10. Durable debit/unlock remains atomic in `db.unlockWorkspaceContactsWithCredits()`.
11. Redis lock/dedup and retry identifiers remain unchanged.
12. No duplicate charge, unlock or contact-pack send path is introduced.
13. `a:wsp_lead_new` remains with canonical lead acquisition.
14. Extracted ownership increases monotonically; duplicate owners hard-fail in QA.

## Persistent/runtime contract

- migrations: none;
- ENV: none;
- Vercel/API routes: none;
- callback keys: unchanged;
- action registry types/guards: unchanged;
- user-visible copy: unchanged;
- DB methods and SQL: unchanged;
- Redis keys/TTLs: unchanged;
- QStash retry and lock semantics: unchanged;
- pricing and credit costs: unchanged.

## Rollback

Revert the exact STEP590E3C commit or restore the STEP590E3B_R2 full artifact. No schema or ENV rollback is required. Durable unlocks, debit ledger rows, retry jobs and audit/diagnostic evidence created by normal production use must not be rewritten by rollback.
