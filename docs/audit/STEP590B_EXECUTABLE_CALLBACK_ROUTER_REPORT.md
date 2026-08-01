# STEP590B — Executable Callback Router Implementation Report

## Verdict

`SOURCE READY / DEPLOYMENT CANARY PENDING`

STEP590B introduces an executable callback ownership spine without changing callback keys, schema, ENV or product semantics.

## Implemented

- exact ownership for all 560 registered callback actions;
- duplicate action and duplicate route hard failures;
- pre-user and post-user dispatch phases;
- executable admin-auth reachability through `admin_web_auth`;
- executable giveaway-access ownership through `giveaway_access`;
- explicit legacy compatibility ownership for 555 untouched actions;
- fail-closed missing-handler and wrong-phase behavior;
- transport-level unknown/error recovery retained in one facade;
- preflight integration for ownership/reachability tests.

## Source changes

Primary runtime files:

- `src/bot/router/callbackOwnership.js`;
- `src/bot/router/callbackRouter.js`;
- `src/bot/routes/callbacks.js`;
- `src/bot/bot.js`.

QA/tooling:

- `scripts/test-callback-router-critical.js`;
- `scripts/smoke-callback-router-ownership-contract.js`;
- `scripts/preflight.js`;
- `package.json`.

## Verified

- callback ownership/reachability executable suite: 2,292 assertions PASS;
- router source contract PASS;
- action registry: 560 code / 560 registry PASS;
- callback consistency: 554 refs / 560 keys, zero unresolved PASS;
- payment critical regression: 66 PASS;
- giveaway critical regression: 55 PASS;
- broadcast critical regression: 35 PASS;
- JavaScript syntax: 271/271 PASS;
- package-lock consistency PASS;
- Vercel function budget: 11/12 PASS with warning;
- `git diff --check` PASS.

## Not verified

- clean dependency installation in the execution environment;
- full dependency/runtime preflight;
- complete portable critical spine on the STEP590B tree;
- Vercel deployment;
- live admin-auth approve/exchange;
- live unknown-callback absence;
- production behavior of all 555 legacy-owned actions.

`npm ci` was attempted and blocked by the execution environment package mirror returning HTTP 404 for `xtend@4.0.2`. This is not represented as a project PASS or project failure.

## Risk framing

The change is behavior-preserving by design but sits on the central Telegram dispatch path. Deployment must be canaried with exact callbacks from both extracted routes and representative legacy domains before STEP590C proceeds.
