# STEP532 — Web admin users copy unification + banned_at schema guard

Date: 2026-04-03

## Goal
Finish the visible RU/EN cleanup in `/admin/users` and restore runtime safety after the production error:

```
error: column u.banned_at does not exist
```

The fix must stay narrow: no new write-paths, no route-family expansion, no forced migration just to make the users page readable again.

## What changed

### 1) Users copy unification
Updated the user-facing admin copy so the visible `Users` screen now uses one Russian operator canon for:
- cohort labels;
- saved presets rail;
- compare / pin rail;
- follow-up rail;
- meta strip and table micro-hints;
- row / compare status wording (`блок`, `активен`, etc.).

The goal was not a marketing rewrite — only removing the noisy RU/EN mix that made the control plane feel half-polished.

### 2) `banned_at` schema guard
Added a users-directory-only schema guard in `src/db/queries.js`:
- `hasUsersBannedAtColumn()`
- `usersDirectoryBannedAtSelectSql(...)`
- `buildUsersDirectoryProblemScoreSql(...)`

Affected read surfaces:
- `listUsersDirectory(...)`
- `getUsersDirectoryByIds(...)`
- `exportUsersDirectory(...)`

Behavior:
- if `users.banned_at` exists, users-directory keeps the normal banned-aware behavior;
- if the column is absent, the users-directory queries degrade to `null::timestamptz as banned_at` and a problem-score path that omits the banned component instead of crashing the whole page.

## Why this is the right fix
- fixes the actual runtime failure the operator saw;
- keeps the patch local to users-directory read surfaces;
- does not require emergency schema work before the admin page can load again;
- preserves banned-aware behavior on deployments where the column already exists.

## Explicit non-goals
- no migration was added in this step;
- no ban/unban operator flow was expanded;
- no public-bot flow changed;
- no export/bulk/compare write behavior changed.

## Source verification
- `node --check scripts/admin-web.js`
- `node --check api/admin-web-read.js`
- `node --check src/db/queries.js`
- `node --check src/lib/adminWeb/readModels.js`
- `node --check src/lib/adminWeb/usersExport.js`
- `npm run smoke:admin-web-users-copy-unification-contract`
- `npm run smoke:admin-web-users-export-contract`
- `npm run smoke:admin-web-users-filter-rail-contract`
- `npm run smoke:admin-web-users-cohort-rail-contract`
- `npm run smoke:admin-web-users-saved-presets-contract`
- `npm run smoke:admin-web-users-compare-pin-rail-contract`
- `npm run smoke:admin-web-users-followup-rail-contract`
- `npm run smoke:admin-web-users-header-meta-strip-contract`

## Live verification still required
- open `/admin/users` on the real deployment that previously threw `u.banned_at does not exist`;
- confirm the page now loads;
- confirm the new RU copy reads cleanly on the real operator viewport;
- confirm export / compare / pinned-copy still behave correctly in the live browser.
