# STEP586H — Live Telegram Acceptance and Mobile Copy Pass

**Date:** 2026-07-18
**Parent:** STEP586G
**Mode:** HEAVY acceptance

## Changed

- added `scripts/telegram-mobile-acceptance.js`;
- added `scripts/telegram-mobile-copy-audit.js`;
- added `scripts/smoke-telegram-mobile-acceptance-contract.js`;
- added `acceptance:telegram-mobile` command;
- added `lint:telegram-mobile-copy` source guard;
- added STEP586H guard to `preflight:source`;
- added live acceptance runbook and audit report;
- shortened source-confirmed mobile-risk labels in Smart Matching, Promotion, manager invite, subscription revoke and system notice screens;
- ignored local Telegram acceptance evidence artifacts.

## Preserved

- callbacks;
- destinations;
- permissions;
- prices and credits;
- invite rewards;
- payment apply behavior;
- database schema and migrations;
- Redis/QStash/Neon runtime.

## Verified

- local acceptance contract PASS;
- static button hard-limit scan PASS;
- no PASS without evidence;
- unapproved spend protections PASS;
- changed-file syntax PASS.

## Not verified

- deployed preview/staging target;
- live Telegram paths;
- real phone wrapping;
- screenshots/transcripts;
- remote acceptance PASS.

## Release state

The STEP586H implementation is ready to apply. The final live gate remains BLOCKED until an operator executes the runbook against an exact deployed target and finalizes the evidence pack with PASS.

## QA truth restoration

`smoke-admin-ops-render.js` was already red on the STEP586G baseline because its expected strings still used the older English operator vocabulary. The rendered runtime text was correct.

STEP586H updates the stale assertions only. This is a test-contract synchronization, not an admin runtime change.

Final local snapshot:

- 2,023 static Telegram labels scanned;
- 0 hard width violations;
- 13 dynamic labels deferred to real-phone evidence;
- 227/227 JavaScript syntax PASS;
- callbacks 0 unresolved;
- dependency preflight and runtime proof PASS;
- npm audit 0 vulnerabilities;
- canonical source preflight timed during its long serial run; all remaining components passed separately.
