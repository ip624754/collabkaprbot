# Work History — STEP588X4

## STEP588X4 — Admin Web Auth Challenge Binding & Throttling

**Date:** 2026-07-20
**Mode:** HEAVY / CRITICAL
**Risk score:** 19/20
**Parent:** STEP588X3

### Implemented

- replaced signed web approval links with Telegram callback decisions;
- made actual Telegram `ctx.from.id` authoritative and allowlisted;
- added browser-verifier HMAC binding to challenge status, fallback verification and exchange;
- made approve/deny, fallback attempts and approved-to-consumed session issuance atomic through Redis Lua;
- split read-only status from POST-only exchange;
- added `authVersion=2` and automatic rejection of all pre-X4 sessions;
- enforced configured session idle timeout;
- changed fallback code generation to cryptographic RNG;
- disabled fallback by default and required an explicit allowlisted actor when enabled;
- limited code disclosure to the explicit fallback actor;
- added atomic attempt counter, lockout and dedicated start/code throttles;
- made auth fail closed on rate-limit/auth-store failure;
- added executable auth policy tests and a source contract;
- updated action registry, web login UX, ENV contract and handoff documentation.

### QA

- admin auth critical policy: 48 assertions PASS;
- payment/giveaway/broadcast critical regressions: 66 / 55 / 35 assertions PASS;
- registered source checks: 128/128 PASS in one final invocation;
- JavaScript syntax: 253/253 PASS;
- dependency/runtime preflight: PASS after clean `npm ci`;
- package-lock, action/callback registries, generated action docs and migration pack: PASS / no drift;
- npm audit: 0 vulnerabilities;
- Vercel function budget: 11/12.

### Production boundary

No production deployment, live Telegram approval, Upstash concurrency test, fallback brute-force, browser cookie canary or idle-expiry canary was executed in this STEP environment.
