# STEP590E6 — Support, Verification, Sharing & Account Domain

## Boundary

`src/bot/domains/userServices/` owns 18 exact post-user callback actions:

- `user_support`: 3 support entry/write callbacks;
- `user_verification`: 3 verification home/info/kind callbacks;
- `user_sharing`: 9 invite sharing, performance, points, history, rewards and redemption callbacks;
- `user_account`: 3 account delete-confirm/delete/restore callbacks.

The domain is an orchestration adapter. Canonical DB, Redis, verification eligibility, invite rewards, copy-safety and Telegram render helpers remain injected from `bot.js`.

## Explicit exclusions

- `a:notice` remains the user notice viewer;
- `a:founder` remains the user-facing Founder Sale flow;
- admin support and moderation remain STEP590E5-owned;
- broadcast, payments and admin web remain under their existing owners;
- no SQL, schema, ENV, API route, callback key, action guard or visible-copy change.

## Invariants

1. The deleted-user gate remains before post-user dispatch and permits only support recovery plus account restore.
2. Support entry/write preserves the existing expect-text and copy-safety recovery behavior.
3. Verification preserves feature flag, role-kind matching and creator/brand profile-quality gates.
4. Invite sharing/rewards preserve DB points truth, canonical option validation and redemption semantics.
5. Missing bot username remains fail-closed with copy-safety diagnostic and recovery UI.
6. Account tombstone/restore preserves canonical DB methods and clears the same four Redis UI/session hints.
7. The destructive account confirmation keeps the original compact Back + Home layout.
8. Unrelated user, admin, payment and Founder actions are not captured.

## Ownership result

- registry: 560;
- extracted: 482;
- legacy: 78;
- aliases: 7;
- unresolved: 0.
