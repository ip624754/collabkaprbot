# STEP590C2 — Critical Payment Callback Domain Extraction Report

## Verdict

**SOURCE READY / PRODUCTION PAYMENT CALLBACK CANARY PENDING**

STEP590C2 extracts 16 payment-related callback actions from the central Telegram callback monolith into a bounded payment domain. Product state machines, prices, signed payloads, atomic fulfillment and administrative recovery services remain canonical and unchanged.

## Baseline evidence

The supplied STEP590C1 production log shows a successful browser-bound admin login sequence on deployment `dpl_CWVBb9vAN6BBPUtYfngss22JGYP1`: Telegram callback `a:aw_auth_dec` reached `update.ok`, session exchange returned HTTP 200 and subsequent authenticated admin reads returned HTTP 200. The supplied evidence does not contain `unknown_callback` or `callback_dispatch.*` signatures.

The log establishes the STEP590C1 login path used as the STEP590C2 source baseline. It does not independently prove the deny path or login-control toggle.

## Implementation

- added `src/bot/domains/payments/`;
- added `payment_purchase` and `payment_admin` route contracts;
- registered 16 exact callback owners;
- removed the corresponding inline branches from `src/bot/bot.js`;
- preserved payment session signing and TTL behavior;
- preserved Telegram-admin payment controls, ledger view, apply and auto-heal calls;
- updated source-contract tests to follow executable ownership rather than inline source location.

## Source verification

Verified on the final source tree:

- payment bounded-domain executable tests: 164 assertions PASS;
- payment bounded-domain source contract: PASS;
- callback ownership and reachability: 2,340 assertions PASS;
- action registry: 560/560 PASS;
- callback consistency: 554 refs, 560 registry keys, 22 extracted owners, 0 unresolved;
- payment fulfillment critical regression: 66 assertions PASS;
- giveaway critical regression: 55 assertions PASS;
- broadcast critical regression: 35 assertions PASS;
- admin-auth critical regression: 63 assertions PASS;
- health/privacy critical regression: 52 assertions PASS;
- JavaScript syntax: 287/287 PASS;
- package-lock consistency: PASS;
- `git diff --check`: PASS.

## Environment-blocked evidence

Fresh dependency installation was not available in the implementation environment because the configured package mirror returned HTTP 404 for `xtend@4.0.2`. Therefore:

- `test:bounded-safety-hardening` is BLOCKED by missing `dotenv`;
- the complete portable critical spine is not newly claimed on the final STEP590C2 tree;
- fresh `npm audit` is not claimed.

The operator must run the listed commands after applying the package.

## Production acceptance required

A production canary must verify invoice rendering and administrative payment navigation without unintended purchase or control mutation. No payment should be represented as production-accepted from source evidence alone.
