# STEP590B — Executable Callback Router & Unique Ownership Gate

## Decision

Collabka keeps one Telegram callback transport and one compatibility legacy dispatcher while callback ownership is extracted incrementally.

The router is split into three layers:

1. `src/bot/router/callbackOwnership.js` — exact action ownership and phase metadata;
2. `src/bot/router/callbackRouter.js` — dependency-free executable dispatch;
3. `src/bot/routes/callbacks.js` — Telegram transport UX for unknown/error recovery.

No callback key, product behavior, guard policy, database schema or user-facing copy is intentionally changed by STEP590B.

## Ownership contract

Every key in `ACTION_REGISTRY` has exactly one owner:

- an extracted route; or
- the explicit `legacy` compatibility owner.

Current exact ownership:

| Route | Phase | Actions | Count |
|---|---|---|---:|
| `admin_web_auth` | `pre_user` | `a:aw_auth_dec` | 1 |
| `giveaway_access` | `post_user` | `a:gw_access*` exact family | 4 |
| `legacy` | `post_user` | all not-yet-extracted registered actions | 555 |

Total: 560 registered actions.

The registry hard-fails on:

- duplicate route IDs;
- duplicate action ownership;
- extraction of an action absent from `ACTION_REGISTRY`;
- empty or invalid route definitions.

## Dispatch contract

The pure router returns one explicit status:

- `handled` — the exact owner executed;
- `deferred` — ownership belongs to a later phase;
- `unknown` — final dispatch has no registered/handled action;
- `error` — missing handler, wrong phase, thrown exception or extracted-handler contract violation.

Extracted handlers must return exactly `true` for their owned actions. They cannot silently decline and let another handler claim the same action.

The legacy compatibility handler preserves its historical convention: exact `false` means no branch matched and triggers stale-button recovery.

## Phases

### Pre-user

Used for callbacks whose security identity is the actual Telegram actor and which must not depend on an application-user row.

Current owner:

- `a:aw_auth_dec`.

### Post-user

Runs after canonical user hydration and account gates.

Current extracted owner:

- giveaway access diagnostics.

All remaining actions are post-user legacy owners until bounded domain extraction.

## Zero-regression properties

- existing global callback rate limiting remains before routing;
- existing action guard selection remains before routing;
- admin auth remains before application-user hydration;
- ban/tombstone/input-mode gates remain unchanged for post-user actions;
- unknown callback recovery copy remains unchanged;
- callback acknowledgement remains fail-safe and bounded;
- no second Telegram callback transport is created.

## Next extraction

STEP590C should move critical domain callbacks into exact route owners, one bounded domain at a time, while retaining the legacy compatibility owner for all untouched actions.
