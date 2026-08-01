# STEP590E3B — Workspace Profile, Instagram & Sharing Domain Extraction

**Date:** 2026-08-01
**Mode:** HEAVY
**Risk score:** 14/20
**Baseline:** STEP590E3A source artifact, package `1.3.21`
**Package:** `1.3.22`

## Objective

Extract the bounded Workspace profile, structured-contact, Instagram and sharing callback surfaces from the legacy post-user dispatcher into explicit executable route owners without changing product semantics.

This STEP is architecture-only. It does not redesign the profile UX, Instagram OAuth contract, contact visibility, public Workspace directory, callback keys, copy, storage or pricing.

## Exact ownership delta

```text
workspace_profile: 18
workspace_social:   9
newly extracted:   27
cumulative:       275 extracted / 285 legacy
registry:         560
aliases:            7
unresolved:         0
```

The exact action-level delta is recorded in `STEP590E3B_ACTION_OWNERSHIP_DELTA.csv`.

## Bounded module additions

```text
src/bot/domains/workspaces/
├── profileCallbacks.js
└── socialCallbacks.js
```

The existing Workspace `actions.js`, `policy.js`, `route.js` and `index.js` now expose two additional owners. Existing renderers, DB methods, Redis helpers, OAuth configuration, audit methods and input-mode services remain canonical and are injected through the composition root in `src/bot/bot.js`.

## Route owners

### `workspace_profile`

Owns 18 actions covering:

- Workspace profile view;
- profile mode, vertical and format selectors;
- structured contact view, migration, edit and clear paths;
- individual legacy-field clearing and input-mode entry;
- bounded public-profile reset confirmation and execution.

### `workspace_social`

Owns 9 actions covering:

- short/long Workspace sharing;
- Instagram story/post/DM/bio template surfaces;
- Instagram DM variant rendering;
- Instagram verification start, comment, status and OAuth entry.

## Compatibility seams retained

- `a:ws_pro_buy` remains `payment_purchase` owned.
- `a:wsp_lead_new` remains `lead_acquisition` owned.
- `a:wsp_open`, `a:wsp_preview`, `a:wsp_contact_req`, `a:wsp_contact_unlock` and `a:pm_*` remain legacy for STEP590E3C.
- Existing callback keys, action guards and aliases remain unchanged.
- Existing Meta/Instagram feature flags and fail-closed configuration checks remain unchanged.

## Preserved invariants

1. Actor identity comes from the hydrated user and Telegram context, never callback payload identity.
2. Profile mutations retain owner-scoped Workspace lookup before writes.
3. Structured-contact admin access remains limited to the existing super-admin predicate.
4. Profile writes and reset retain their existing audit event names and payloads.
5. Profile reset clears public presentation fields only; dialogs, applications, payments, PRO and channel connection remain intact.
6. Instagram OAuth remains hidden when `IG_OAUTH_UI_ENABLED` is false.
7. OAuth start remains fail-closed when enablement, encryption key, client credentials or public base URL are unavailable.
8. A configured OAuth start validates Workspace ownership and writes one bounded one-time Redis token with the existing ten-minute TTL.
9. No new database, Redis, Telegram, OAuth or payment core is introduced.
10. Extracted ownership increases monotonically; duplicate owners hard-fail at module initialization/QA.

## Persistent/runtime contract

- migrations: none;
- ENV: none;
- Vercel/API routes: none;
- callback keys: unchanged;
- user-visible copy: unchanged;
- DB methods and SQL: unchanged;
- Redis key shapes and TTLs: unchanged;
- Instagram OAuth configuration contract: unchanged.

## Rollback

Revert the exact STEP590E3B commit or restore the STEP590E3A full artifact. No schema or ENV rollback is required. Durable profile records created by normal production use are not rewritten or deleted automatically by rollback.
