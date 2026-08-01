# STEP590E5C — Admin Communications, Notices & Outbox Domain

## Boundary

`src/bot/domains/adminCommunications/` owns 26 exact post-user callback actions:

- `admin_communications`: 1 communications hub action;
- `admin_notice_management`: 9 system-notice management actions;
- `admin_outbox`: 7 Redis outbox actions;
- `admin_message_templates`: 9 personal-message template actions, including per-user template selection.

The domain is an orchestration adapter. Existing Redis, DB, Telegram, rendering, placeholder, clipping and audit helpers remain injected from `bot.js`; no second communications core is introduced.

## Explicit exclusions

- `a:notice` remains a user-facing view action and stays legacy-owned;
- `a:adm_umsg`, `a:adm_umsg_free` and `a:adm_umsg_send` remain STEP590E5B `admin_users` ownership because they are user-card delivery operations;
- broadcast composer/audience/dispatch/operations remain STEP590C4-owned;
- admin system, founder, QStash and operational controls remain for STEP590E5D;
- no SQL, schema, ENV, API route, callback key, action guard or visible-copy change.

## Invariants

1. Every extracted action retains super-admin authorization before protected reads or mutation.
2. System notice remains Redis-only and does not become a broadcast send path.
3. Notice publish continues to require text, increment version and force active state.
4. Outbox repeat remains private-chat-only and uses the existing preview/confirmation token flow.
5. Outbox clear removes only the Redis journal, not already delivered Telegram messages.
6. Template add/edit/delete/reset retains existing Redis persistence and expect-text state.
7. Placeholder expansion, Telegram-safe clipping, URL warning and no-direct-send preview remain unchanged.
8. The user-facing `a:notice` route is not captured by the admin domain.

## Ownership result

- registry: 560;
- extracted: 433;
- legacy: 127;
- aliases: 7;
- unresolved: 0.
