
# STEP590E4C — Curator Operations Domain

## Boundary

`src/bot/domains/curators/` owns 23 exact post-user callback actions:

- `curator_operations`: 16 curator-side cabinet, inbox, leave and giveaway-operation actions;
- `curator_management`: 7 owner-side invite, add, list, audit and removal actions.

The domain is an orchestration adapter. It receives existing capabilities through dependency injection and does not import DB/Redis implementations directly.

## Explicit exclusions

- `a:cur_ws` and `a:cur_ws_off` remain `workspace_control` owned;
- registry-only `a:curator_home`, `a:curators`, `a:curators_home` remain legacy;
- admin moderation, Brand, payment, application and deal actions are unchanged;
- no schema, ENV, route, key, guard, pricing or copy change.

## Invariants

1. Curator-side actions require `isCurator || isAdmin` before protected reads or mutations.
2. Workspace leave verifies curator membership before unrestricted Workspace lookup and removal.
3. Giveaway check/note operations validate `getGiveawayForCurator()` and Workspace identity.
4. Owner management resolves Workspace through `db.getWorkspace(ownerUserId, wsId)` before mutation.
5. One-time curator invites retain Redis TTL of ten minutes and the non-empty Telegram share `url=` workaround.
6. Removal retains durable audit, role-cache invalidation and best-effort DM notification.
7. Registry-only aliases are not falsely marked executable.

## Ownership result

- registry: 560;
- extracted: 359;
- legacy: 201;
- aliases: 7;
- unresolved: 0.
