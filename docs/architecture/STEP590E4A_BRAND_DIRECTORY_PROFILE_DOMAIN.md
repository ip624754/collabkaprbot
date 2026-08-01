# STEP590E4A — Brand Directory & Profile Domain Extraction

**Date:** 2026-08-01
**Mode:** HEAVY
**Risk score:** 14/20
**Baseline:** operator-pushed STEP590E3C commit `858a0b1`, package `1.3.23`
**Package:** `1.3.24`

## Objective

Extract Brand directory, filtering and Brand profile orchestration from the legacy post-user dispatcher into explicit executable owners without changing product behavior, payment ownership, application/deal ownership, Brand team/curator ownership, callback keys, persistence, Redis state or user-visible copy.

## Exact ownership delta

```text
brand_directory: 10
brand_profile:   28
newly extracted: 38
cumulative:     323 extracted / 237 legacy
registry:       560
aliases:          7
unresolved:       0
```

The action-level delta is recorded in `STEP590E4A_ACTION_OWNERSHIP_DELTA.csv`.

## Bounded module

```text
src/bot/domains/brands/
├── actions.js
├── directoryCallbacks.js
├── index.js
├── policy.js
├── profileCallbacks.js
└── route.js
```

The module is an orchestration adapter. Existing renderers, Brand profile repositories, Redis directory-filter helpers, input-mode handlers, copy-safety surfaces, Brand Manager context resolution and Telegram keyboards remain canonical and are injected from `src/bot/bot.js`.

## Route owners

### `brand_directory`

Owns ten actions for:

- directory home and filter surface;
- single-filter selection/reset;
- multi-select goals/requirements filters;
- bounded directory pagination/open;
- creator application local-return context when opening a Brand.

### `brand_profile`

Owns twenty-eight actions for:

- Brand profile home/edit/more;
- basic field input-mode entry;
- niche, collaboration type, budget, goal and requirement selection;
- profile reset confirmation and execution;
- Brand Pass and Brand Plan information surfaces.

## Explicit exclusions

- `a:brand_buy` and `a:brand_plan_buy` remain `payment_purchase` owned.
- Brand applications, accepted deals and lead workflows remain in STEP590E1 owners.
- `a:bm_*`, `a:bms` and Brand team membership remain for STEP590E4B.
- `a:cur_*` curation operations remain for STEP590E4C.
- Registry-only Brand/curator keys without executable source branches remain legacy until STEP590J dead-code retirement.

## Preserved invariants

1. Actor identity comes from hydrated Telegram context, never callback payload.
2. Brand Manager context resolution remains canonical.
3. Directory filter shape, keys, TTLs, limits and pagination remain unchanged.
4. Creator application local-return context survives Brand-card navigation.
5. Public Brand cards retain existing contact-redaction and copy-safety behavior.
6. Profile mutations continue through existing DB helpers.
7. Profile reset remains confirm-first and invokes the canonical delete helper once.
8. Input-mode names, payloads and cancellation/recovery behavior remain unchanged.
9. Brand Pass/Plan screens do not alter prices or fulfillment.
10. Purchase callbacks remain payment-owned.
11. Application/deal callbacks remain application-owned.
12. Team and curator callbacks remain legacy for their approved follow-up STEPs.
13. Extracted ownership increases monotonically and duplicate ownership hard-fails QA.

## Persistent/runtime contract

- migrations: none;
- DB schema/SQL: unchanged;
- ENV: none;
- API/Vercel routes: none;
- callback keys: unchanged;
- action types/guards: unchanged;
- Redis keys/TTLs: unchanged;
- pricing/fulfillment: unchanged;
- Telegram copy/keyboards: unchanged.

## Rollback

Revert the exact STEP590E4A commit or restore the STEP590E3C artifact. No migration or ENV rollback is required. Durable Brand profile changes created by normal production use must not be rewritten by rollback.
