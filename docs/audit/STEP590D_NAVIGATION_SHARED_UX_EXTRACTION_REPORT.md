# STEP590D — Navigation & Shared Telegram UX Extraction Report

## Verdict

`SOURCE READY / PRODUCTION NAVIGATION CANARY PENDING`

STEP590D moves ten callback actions out of the legacy dispatcher while preserving callback keys, role-selection semantics, input-mode escape behavior, old-message aliases and receipt keyboard behavior.

## Runtime delta

- new shared navigation module: 9 actions;
- new shared Telegram UX module: 1 action;
- legacy aliases moved from an inline `bot.js` table to one canonical shared map;
- `bot.js` reduced from 40,713 to 40,430 lines;
- callback ownership changed from 57/503 to 67/493;
- no migration, ENV, API route, payment, giveaway, broadcast or auth-core change.

## Verified source evidence

```text
navigation/shared UX executable tests: 93 assertions PASS
callback ownership/reachability:       2,462 assertions PASS
action registry:                       560/560 PASS
callback consistency:                  67 extracted, 7 aliases, 0 unresolved
admin-auth extraction regression:      83 assertions PASS
payment extraction regression:         164 assertions PASS
giveaway extraction regression:        119 assertions PASS
broadcast extraction regression:       161 assertions PASS
payment critical:                      66 assertions PASS
giveaway critical:                     55 assertions PASS
broadcast critical:                    35 assertions PASS
health/privacy critical:               52 assertions PASS
JavaScript syntax:                     313/313 PASS
source preflight:                      PASS under temporary dependency shims
portable critical spine:               6/6 PASS under temporary dependency shims
```

## Truth boundary

A clean dependency installation was attempted and failed because the implementation environment's package mirror returned HTTP 404 for `xtend@4.0.2`.

Temporary no-op shims were used only to execute source-oriented preflight and the portable critical spine. They were removed before artifact generation. Therefore this report does not claim:

- clean `npm ci` or fresh `npm audit` in the implementation environment;
- real Redis, QStash, PostgreSQL or Grammy behavior through shim-assisted runs;
- Vercel deployment or live Telegram acceptance.

## Preserved invariants

- global callback guard ordering unchanged;
- mode selection still uses the actual `ctx.from.id` actor;
- manager access still derives from `db.listBrandsForManager(u.id)`;
- no business-core imports were added to the shared modules;
- explicit navigation remains the only input-mode escape boundary;
- admin receipt acknowledgements retain their Menu/Support controls;
- legacy callback aliases remain seven and all targets are registered/handled;
- extracted actions cannot fall back to the legacy dispatcher.

## Residual risk

- old Telegram messages with aliases require live compatibility canary;
- a real dual-role user should exercise creator/brand/manager/curator switching;
- `menu_push` reply fallback and service-message keyboard editing depend on Telegram permissions;
- copy/layout parity is source-verified but not phone-verified in this STEP.
