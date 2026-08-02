# STEP590E5D — Admin Operations, System & Founder Controls Domain

## Boundary

`src/bot/domains/adminSystem/` owns 30 exact post-user callback actions:

- `admin_system_navigation`: 4 admin shell/navigation actions;
- `admin_system_operations`: 5 digest, pending-snapshot and invite-visibility actions;
- `admin_delivery_hard_skip`: 6 hard-skip inspection/export/unskip actions;
- `admin_audit_metrics`: 5 audit/search/export and metrics actions;
- `admin_qstash_controls`: 2 QStash status/ping actions;
- `admin_founder_controls`: 8 Founder Sale runtime-control actions.

`a:adm_ph` is not an admin-system action. It is attached to the existing `admin_message_templates` owner in `src/bot/domains/adminCommunications/`, taking that route from 9 to 10 actions.

The new domain remains an orchestration adapter. Existing Redis, QStash, DB, Telegram, render, audit and Founder Sale configuration helpers remain injected from `bot.js`; no replacement operational core is introduced.

## Explicit exclusions

- `a:founder` remains the user-facing Founder Sale flow;
- `a:off_buy` and `a:off_buy_home` remain payment/official-publishing actions;
- broadcast delivery remains STEP590C4-owned;
- admin users/support/moderator governance remain STEP590E5B-owned;
- notices/outbox/templates remain STEP590E5C-owned;
- no SQL, schema, ENV, API route, callback key, action guard or visible-copy change.

## Invariants

1. Every admin-system action retains the existing super-admin gate before protected reads or mutations.
2. `a:admin` remains a backward-compatible alias that resolves to `a:admin_home`.
3. Pending-snapshot clear removes only the Redis snapshot and does not cancel delivery, mutate DB rows or alter QStash state.
4. Hard-skip inspection/export/unskip remains Redis-only and does not mutate durable user or delivery rows.
5. Audit search/export remains read-only; metrics retains the 1–90-day clamp.
6. QStash ping still requires SDK availability, `QSTASH_TOKEN`, a valid public base URL, signed publish and deduplication evidence.
7. Founder runtime toggles/overrides remain Redis-backed; reset removes the override and restores ENV-derived truth.
8. `a:adm_ph` only renders placeholder help and does not become a direct-send path.
9. User-facing Founder Sale and payment actions are not captured by admin-system ownership.

## Ownership result

- registry: 560;
- extracted: 464;
- legacy: 96;
- aliases: 7;
- unresolved: 0.
