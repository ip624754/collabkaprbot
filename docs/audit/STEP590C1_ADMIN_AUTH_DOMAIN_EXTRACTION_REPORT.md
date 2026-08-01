# STEP590C1 — Admin/Auth Callback Domain Extraction Report

## Scope

HEAVY security architecture extraction over the exact STEP590B tree. Runtime behavior was intended to remain unchanged.

## Production evidence accepted before extraction

The operator reported that STEP590B was deployed and working. The supplied Vercel export contains 119 rows and 84 structured application messages. For update `226863033`, action `a:aw_auth_dec` produced:

```text
webhook.in
update.in
update.ok (273 ms)
HTTP 200
```

The export contains no warning/error-level structured message and no `unknown_callback`, `callback.error` or `callback_dispatch.*` record. This confirms callback-router reachability for that observed update. Browser session exchange success is operator-reported rather than derivable from the log export alone.

## Implementation

- created the bounded domain `src/bot/domains/adminAuth/`;
- moved stable action identities into `actions.js`;
- split challenge parsing into pure `policy.js`;
- split callback response rendering into `views.js`;
- added a thin `service.js` adapter to the canonical Redis auth core;
- moved the challenge transport adapter into `callbacks.js`;
- extracted the inline `a:admin_web_login_toggle` branch into the same bounded domain;
- added separate pre-user and post-user route descriptors;
- moved shared callback route constants to `callbackContracts.js` to prevent router/domain cycles;
- updated callback consistency checking to recognize executable ownership, not only source equality patterns;
- removed `src/bot/adminWebAuthCallback.js`;
- removed the inline login-toggle branch from `src/bot/bot.js`.

## Security invariants preserved

- approver identity is still `ctx.from.id`;
- the challenge route still executes before application-user hydration;
- the login control still requires the existing global Redis guard and super-admin policy;
- challenge transitions still execute only in `src/lib/adminWeb/auth.js`;
- no signed approval URL was introduced;
- no callback may be owned by two routes;
- extracted handlers must return `true` or the router fails closed;
- the operator-control mutation still writes actor Telegram ID, username and `telegram_admin` audit note.

## QA evidence

Verified on the final source tree:

- 83 STEP590C1 executable assertions PASS;
- 2,299 callback ownership/reachability assertions PASS;
- 63 admin-web auth critical assertions PASS;
- admin-auth extraction source contract PASS;
- admin-web auth binding contract PASS;
- admin-web login contract PASS;
- admin-system/control/vocabulary contracts PASS;
- action registry 560/560 PASS;
- callback consistency PASS with 6 executable owners and 0 unresolved callbacks;
- 136 of 137 registered source checks PASS;
- the one remaining source check (`test:bounded-safety-hardening`) was blocked by unavailable `dotenv` because the internal package mirror returned HTTP 404 for `xtend@4.0.2` during `npm ci`;
- 280 JavaScript files pass `node --check`;
- `git diff --check` PASS.

## Truth boundary

Not verified in the implementation environment:

- clean `npm ci` on the final tree;
- complete portable critical spine on the final tree;
- Vercel deployment of STEP590C1;
- live approve/deny and browser exchange after STEP590C1;
- live `a:admin_web_login_toggle` mutation after extraction.

The dependency installation failure is an environment limitation, not evidence that the project dependencies are broken. It is also not counted as PASS.
