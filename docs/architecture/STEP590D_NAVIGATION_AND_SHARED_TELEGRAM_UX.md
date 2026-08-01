# STEP590D — Navigation & Shared Telegram UX

## Decision

STEP590D extracts navigation callbacks and shared Telegram receipt/alias behavior from the legacy `src/bot/bot.js` dispatcher into reusable bounded shared layers.

This is not a new business domain. The extracted code may coordinate screens and ephemeral UI state, but it must not implement payment, giveaway, broadcast, deal, application or entitlement business mutations.

## Canonical modules

```text
src/bot/shared/navigation/
├── actions.js
├── callbacks.js
├── index.js
├── policy.js
└── route.js

src/bot/shared/telegramUx/
├── actions.js
├── callbacks.js
├── index.js
├── policy.js
└── route.js
```

## Exact ownership

`navigation_shared` owns nine post-user actions:

```text
a:ui_mode_set
a:guide
a:menu_push
a:menu
a:role_pick
a:home
a:home_hint_ack
a:home_mode
a:main_menu
```

`telegram_ux_shared` owns one post-user action:

```text
a:usr_ack
```

Legacy callback aliases are now declared once in `src/bot/shared/telegramUx/actions.js` and consumed by both runtime routing and the callback-consistency gate.

## Preserved behavior

- `/start` role gate remains in `bot.js` and is unchanged.
- `a:menu` and `a:home` remain canonical input-mode escape boundaries.
- support follow-up context is cleared only on the same explicit navigation actions as before.
- `a:menu_push` still opens a new editable message and preserves admin-receipt buttons.
- `a:home_hint_ack` keeps the same hint-seen persistence and no-hint rerender.
- creator, brand, brand-manager and curator mode transitions preserve their Redis state and access checks.
- a single managed brand is still selected automatically.
- `a:guide` preserves mode-aware copy, shortcuts and banner behavior.
- `a:usr_ack` preserves the admin-receipt Menu/Support keyboard and removes buttons for other service messages.
- all seven legacy aliases resolve to their prior canonical actions.

## Dependency direction

```text
bot transport
  → callback router
    → shared navigation / Telegram UX adapters
      → injected existing render/state helpers
```

The shared layer must not import `src/db/queries.js`, payment fulfillment, giveaway atomic settlement, broadcast delivery workers or admin-auth state machines directly. Required capabilities are injected by `bot.js`.

## Safety rules

1. Every extracted action has exactly one executable owner.
2. An extracted handler may not return `false` for an owned action.
3. Navigation may change only UI/session state already changed by the legacy branch.
4. Shared Telegram UX may only acknowledge or reshape the current inline keyboard.
5. Callback keys and user-visible copy remain compatible.
6. Global rate-limit, Redis guard, user hydration, ban/tombstone and input-mode ordering remain outside and before the post-user shared handlers.
7. The legacy dispatcher remains the explicit owner for all non-extracted actions.

## Ownership delta

```text
STEP590C4: 57 extracted / 503 legacy
STEP590D:  67 extracted / 493 legacy
Delta:    +10 extracted / -10 legacy
```

## Production boundary

Source acceptance does not prove Telegram production behavior. Production acceptance requires a bounded Home/Menu/role/guide/receipt canary with no router or shared-layer error markers.
