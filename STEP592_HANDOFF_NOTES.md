# STEP592 Handoff Notes

## Canonical parent

- Commit: `d0c2f10e328d3e1464649831bcbf67840e875703`
- Package: `1.3.39`
- Verdict: `PRODUCTION_ACCEPT_STEP591_PRODUCT_AND_OPERATIONS_REBASELINE`

## Result

- Package: `1.3.40`
- Existing Admin → Users now contains a founder-owned founding-cohort workspace.
- Persistence uses one namespaced Redis state key and one token-owned lock key.
- Existing `api/admin-web-read.js` owns the read section; existing `api/admin-web-write.js` owns three founder-only mutations.
- No new API route, Vercel function, SQL migration or ENV variable.
- Cohort changes never send Telegram messages, create offers, change payments or publish content.

## Machine readiness definition

Exit readiness is true only when all are true:

- at least 10 launch-ready creators;
- at least 5 `ACTIVE` offers owned by cohort creators;
- zero blocker defects;
- at least one onboarding canary PASS timestamp no older than 14 days;
- named owner;
- cadence and future next-review date;
- Redis cohort state and active-offer evidence are available.

## Acceptance layers

1. Source implementation and QA: complete.
2. Production control-plane acceptance: pending deploy and bounded add/remove persistence canary.
3. Product/liquidity exit: pending real cohort and offers.

Do not start STEP593 until the actual STEP592 product exit is evidenced, unless the roadmap is explicitly re-approved with a revised dependency contract.
