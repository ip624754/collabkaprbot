# STEP590E3A — Workspace Control, Roles & Folders Domain Extraction

**Date:** 2026-08-01
**Mode:** HEAVY
**Risk score:** 16/20
**Baseline:** operator-confirmed `main` commit `117c3e8462d85e811a76beaf899f512ff7e3c84a`
**Package:** `1.3.21`

## Objective

Extract the bounded Workspace control and folder/editor callback surfaces from the legacy post-user dispatcher into explicit executable owners without changing product semantics.

This STEP is architecture-only. It does not redesign Workspace UX, roles, storage, callback keys, copy, pricing, or public-directory behavior.

## Exact ownership delta

```text
workspace_control: 22
workspace_folders: 17
newly extracted:    39
cumulative:        248 extracted / 312 legacy
registry:          560
aliases:             7
unresolved:          0
```

The exact action-level delta is recorded in `STEP590E3A_ACTION_OWNERSHIP_DELTA.csv`.

## New bounded module

```text
src/bot/domains/workspaces/
├── actions.js
├── callbacks.js
├── index.js
├── policy.js
└── route.js
```

The module owns orchestration only. Existing renderers, DB methods, Redis helpers, authorization checks, audit methods and input-mode services remain canonical and are injected through the composition root in `src/bot/bot.js`.

## Route owners

### `workspace_control`

Owns 22 actions covering:

- channel setup/list/open/settings/history;
- owner-scoped PRO view and offer pin control;
- disconnect/reconnect lifecycle;
- network and curator toggles;
- curator workspace entrypoints;
- creator-side Workspace lead list.

### `workspace_folders`

Owns 17 actions covering:

- folder list/open/create/add/remove/rename/export;
- folder clear/delete confirmation and execution;
- editor list/invite/add/remove surfaces.

## Compatibility seams retained

- `a:ws_pro_buy` remains `payment_purchase` owned.
- `a:wsp_lead_new` remains `lead_acquisition` owned.
- Workspace profile, Instagram, sharing, public Workspace and directory-search actions remain legacy for STEP590E3B/STEP590E3C.
- Existing action guards in `actionRegistry.js` remain unchanged.
- Existing callback aliases remain unchanged.

## Preserved invariants

1. Actor identity comes from the hydrated user and Telegram context, never callback payload identity.
2. Workspace reads stay owner-scoped where the legacy branch used `db.getWorkspace(ownerUserId, workspaceId)`.
3. Curator entrypoints verify role/admin state before rendering a Workspace.
4. Folder edit paths call `getFolderAccess()` before any mutation or input-mode activation.
5. Folder deletion remains owner-only.
6. Disconnect is a reversible connection-state change, not a hard delete.
7. Network, curator, folder and editor mutations retain the same audit event names.
8. No new database, Redis, Telegram or payment core is introduced.
9. Extracted ownership increases monotonically; duplicate owners hard-fail at module initialization/QA.

## Persistent/runtime contract

- migrations: none;
- ENV: none;
- Vercel/API routes: none;
- callback keys: unchanged;
- user-visible copy: unchanged;
- DB methods and SQL: unchanged;
- Redis key shapes and TTLs: unchanged.

## Rollback

Revert the exact STEP590E3A commit or restore the prior full artifact. No schema rollback is required. Durable records created by normal production use are not deleted by rollback.
