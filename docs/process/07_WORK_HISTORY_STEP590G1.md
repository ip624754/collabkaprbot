# STEP590G1 — Cron Tick Decomposition with Compatibility Façade

**Date:** 2026-08-02
**Mode:** HEAVY
**Risk Score:** 12/12
**Approval:** `APPROVE STEP590G1_CRON_TICK_DECOMPOSITION_WITH_COMPATIBILITY_FACADE`

## Baseline

- production-accepted STEP590F_R1;
- operator commit `2226269`;
- package `1.3.33`;
- `src/bot/cron.js`: 2,216 lines;
- `api/cron_router.js`: 114 lines.

## Implemented

- converted `src/bot/cron.js` into a thin compatibility façade;
- extracted bounded cron runtime, giveaway, broadcast, Instagram verification and audit flush modules;
- retained all 12 public exports and all four cron-router jobs;
- added manifest-driven decomposition, façade and real ESM linkage gates;
- made existing cron source contracts repository-aware of the bounded modules;
- bumped package to `1.3.34`.

## Preserved contracts

- Redis locks and TTL;
- giveaway transaction and advisory lock;
- broadcast cooldown, hard-skip and delivery classification;
- duplicate-alert suppression;
- API routes, function budget, SQL, ENV, callbacks and Telegram copy.

## QA

- STEP590G1 executable test: 162 assertions PASS;
- façade and ESM linkage gates: PASS;
- queries regression: 263 assertions PASS;
- portable critical spine: 6/6 PASS;
- source preflight: PASS;
- function budget: 11, unchanged;
- artifact exact parity: PASS.

## Truth Boundary

Source implementation and local regression evidence are VERIFIED. Clean operator dependency installation, Git push, Vercel deployment and production cron execution are NOT VERIFIED in this artifact session.

## Next

After explicit production acceptance of G1: STEP590G2 QStash Broadcast Delivery Worker Decomposition.
