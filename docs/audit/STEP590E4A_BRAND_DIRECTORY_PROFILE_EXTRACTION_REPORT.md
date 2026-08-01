# STEP590E4A — Brand Directory/Profile Extraction Report

**Date:** 2026-08-01
**Baseline:** operator-pushed STEP590E3C commit `858a0b1`
**Verdict:** SOURCE IMPLEMENTATION COMPLETE / FOCUSED QA PASS / OPERATOR DEPENDENCY AND DEPLOY GATE PENDING

## Scope reviewed

- ten Brand directory/filter callbacks;
- twenty-eight Brand profile/edit/reset/Pass/Plan callbacks;
- callback ownership and post-user dispatch wiring;
- payment, applications/deals, team and curator exclusion boundaries;
- source contracts that previously assumed legacy placement.

## Findings

### F1 — The approved 38-action boundary is executable and isolated

All 38 callbacks were independent legacy dispatcher branches and could be moved behind two post-user route owners without moving DB, Redis, payment or input-mode implementations.

### F2 — Payment and application ownership remain separate

`a:brand_buy` and `a:brand_plan_buy` remain `payment_purchase` owned. Brand application and deal callbacks retain their STEP590E1 owners. The Brands domain exposes information and profile orchestration only; it introduces no payment fulfillment or application lifecycle path.

### F3 — Brand profile persistence remains canonical

The extracted profile owner continues to use existing profile helpers, input modes and DB methods. Profile reset remains confirm-first and calls `deleteBrandProfile` once. No alternate profile store or state machine was introduced.

### F4 — Two source contracts required domain awareness

`smoke-creator-app-local-context-contract.js` and `smoke-creator-brands-home-open-contract.js` previously inspected `brand_dir_open`/`brands_home` only in `bot.js`. After extraction, they now inspect the canonical Brands directory domain and assert the legacy branches are absent.

## Ownership result

```text
before: 285 extracted / 275 legacy
after:  323 extracted / 237 legacy
aliases: 7
unresolved: 0
registry: 560/560
```

## Verified evidence

- STEP590E4A executable suite: 212 assertions PASS;
- STEP590E4A source contract: PASS;
- creator application local-context contract: PASS;
- creator Brand directory open-path contract: PASS;
- callback ownership/reachability: 2,866 assertions PASS;
- callback consistency: 323 extracted / 237 legacy / 7 aliases / 0 unresolved;
- action registry: 560/560 PASS;
- STEP590E3C: 77 assertions PASS;
- STEP590E3B: 166 assertions PASS;
- STEP590E3A: 224 assertions PASS;
- Applications/Leads: 302 assertions PASS;
- Barter: 492 assertions PASS;
- Payment: 164 assertions PASS;
- Giveaway: 119 assertions PASS;
- Broadcast: 161 assertions PASS;
- Navigation/shared UX: 93 assertions PASS;
- package-lock consistency: PASS;
- JavaScript syntax: 352/352 PASS;
- full `preflight:source`: PASS under temporary local `dotenv` and `@upstash/redis` execution-only shims;
- portable critical spine: 6/6 PASS under the same temporary shims;
- shims and `node_modules` removed before final tree/artifact generation.

## Not verified in the implementation environment

- clean `npm ci` on the exact final artifact because the configured package mirror previously returned 404 for `xtend@4.0.2`;
- fresh `npm audit` on the final artifact;
- real Upstash behavior from shim-assisted gates;
- Git commit/origin parity for STEP590E4A;
- Vercel production deployment and Telegram runtime canary.

## Residual risk

The compatibility seam still injects a broad dependency object from the composition root. STEP590F/STEP590I should narrow capability interfaces and enforce import direction. Brand team and curator callbacks remain legacy-owned until STEP590E4B/E4C.
