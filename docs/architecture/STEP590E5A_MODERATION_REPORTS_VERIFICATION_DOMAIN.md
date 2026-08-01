# STEP590E5A — Moderation Reports & Verification Domain

## Boundary

`src/bot/domains/moderation/` owns 10 exact post-user callback actions:

- `moderation_reports`: 6 moderator home/report queue/view and dispute mutation actions;
- `moderation_verification`: 4 verification queue/view/approve/reject actions.

The domain is an orchestration adapter. Existing DB, audit, role, feature-flag and Telegram capabilities are injected by `bot.js`; the domain does not import infrastructure implementations directly.

## Explicit exclusions

- `a:admin_mod_add`, `a:admin_mod_list`, and `a:admin_mod_rm` remain legacy for STEP590E5B;
- admin users, support, communications, notices, outbox, system and founder controls remain legacy;
- verification application callbacks (`a:verify_*`) remain outside moderator operations;
- payment-admin ownership is unchanged;
- no schema, ENV, API route, key, guard, pricing or visible-copy change.

## Invariants

1. Every action resolves moderator authorization before protected reads or mutations.
2. Malformed or non-positive report and target-user identifiers return before durable mutations.
3. Offer freeze and thread close retain existing report lookup and audit writes.
4. Report resolve retains `db.resolveBarterReport(rid, moderatorUserId)` as DB truth.
5. Verification approval retains `safeUserVerifications()` and best-effort Telegram notification.
6. Verification rejection retains existing expect-text state and cancel callback.
7. Admin moderator membership governance is not falsely marked extracted.

## Ownership result

- registry: 560;
- extracted: 369;
- legacy: 191;
- aliases: 7;
- unresolved: 0.
