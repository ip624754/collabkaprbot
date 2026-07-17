# STEP586D — Invite Center Language and Mechanism Honesty

**Date:** 2026-07-18  
**Status:** DONE  
**Mode:** HEAVY  
**Baseline:** STEP586C FULL

## Implemented

- replaced ordinary-user `Инвайты` language with `Приглашения` across the bounded invite module;
- localized source labels, statuses, card/link/share copy and recovery routes;
- defined `приглашён`, `активирован`, `в ожидании`, `доступно` and `использовано` against persisted state;
- corrected the false copy claim that points exist only for activation;
- exposed immutable DB source-of-truth rules for `+2 / 24h`, `+10 / 48h`, `100 / 7d` and `250 / 30d`;
- made bot copy consume the same rule and catalog objects as DB reward processing;
- stated self-referral, existing-user, raw-open and incomplete-profile exclusions;
- separated pending points from spendable points on hub, stats, points, history, reward, confirm and success screens;
- made redeem confirmation show cost, pending exclusion, remaining balance and target-selection rule;
- made redeem success show the actual target returned by the transaction;
- added `smoke:invite-language-mechanism-honesty-contract` to source preflight;
- updated intentional invite/home/role copy contracts.

## Preserved

- callback identities and destinations;
- attribution and activation mechanics;
- point values and confirmation windows;
- reward costs and durations;
- ledger schema and migration;
- anti-abuse uniqueness and advisory lock;
- redeem target-selection order;
- payment and collaboration flows.

## Truth Boundary

All invite contracts, dependency/runtime preflight, runtime-proof regressions, callback checks and the 219-file parallel syntax sweep pass locally. The canonical serial source preflight passed its assertion/generator gates and timed out during the long sequential syntax sweep; it did not emit a final PASS line. Live Telegram, production ledger timing, live reward redemption, remote staging and real-user comprehension remain unverified.

## Next

**STEP586E — Monetization and Paid Product Clarity.**
