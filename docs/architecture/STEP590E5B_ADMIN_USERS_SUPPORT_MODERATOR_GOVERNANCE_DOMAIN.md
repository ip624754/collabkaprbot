# STEP590E5B — Admin Users, Support & Moderator Governance Domain

## Boundary

`src/bot/domains/adminOperations/` owns 38 exact post-user callback actions:

- `admin_users`: 20 user directory, card, notes, access, direct-message and per-user gift actions;
- `admin_gifts`: 8 bulk grant/revoke actions;
- `admin_support`: 7 support read/status/reply actions;
- `admin_moderator_governance`: 3 moderator membership actions.

The domain is an orchestration adapter. Existing DB, Redis, Telegram, rendering, template and audit capabilities are injected by `bot.js`; the domain does not replace their durable truth.

## Explicit exclusions

- `a:adm_umsg_tpl`, `a:admin_umsg_tpls*`, notices, outbox and other communication-template actions remain legacy for STEP590E5C;
- admin operations, system, QStash and founder controls remain legacy for STEP590E5D;
- payment-admin ownership remains unchanged;
- moderation reports and verification remain STEP590E5A-owned;
- no schema, ENV, API route, callback key, action guard or visible-copy change.

## Invariants

1. Every extracted action retains the existing super-admin authorization check before protected reads or mutations.
2. Unauthorized execution returns without DB mutation, Redis mutation or outbound admin action.
3. User ban/revoke/gift mutations retain the existing DB helpers and confirmation screens.
4. User notes and search state retain their Redis key, TTL and degraded-mode behavior.
5. Support status uses `setSupportThreadStatusForAdmin`; operator replies retain support-thread persistence and reply-session TTL.
6. Moderator add/remove retains DB membership truth and role-cache invalidation.
7. Message templates and outbox remain outside this boundary to avoid creating a communications mini-monolith.

## Ownership result

- registry: 560;
- extracted: 407;
- legacy: 153;
- aliases: 7;
- unresolved: 0.
