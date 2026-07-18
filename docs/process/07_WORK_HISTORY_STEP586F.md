# Work History — STEP586F

**Date:** 2026-07-18
**STEP:** STEP586F — Access, Error and Empty-State Recovery
**Mode:** STANDARD with adversarial authorization review
**Baseline:** STEP586E
**Status:** IMPLEMENTED / LOCAL QA PASS / LIVE UX NOT VERIFIED

## Objective

Create a truthful recovery system for stale objects, changed access, missing roles and empty lists without weakening authorization or revealing private-object existence.

## Runtime changes

- added `src/bot/recoveryCopy.js` with immutable recovery classes;
- added bounded `answerRecovery(...)`, `renderRecovery(...)` and recovery-destination helpers;
- classified ordinary-user failures across channel, application, dialog, offer, giveaway, folder and role surfaces;
- added reason + next-action structure to selected empty states;
- removed selected Redis/internal-ID/source leakage from ordinary-user text;
- preserved technical causes in `[copy_safety]` logs;
- changed curator workspace read order so specific membership is proved before unrestricted detail lookup;
- added a role guard to the legacy curator workspace callback;
- updated exact source contracts affected by the canonical copy change.

## Source enforcement

Added:

```bash
npm run smoke:access-error-empty-state-recovery-contract
```

The guard is included in `preflight:source`.

## Security finding

A forged curator workspace callback could reach unrestricted workspace detail lookup before specific workspace membership proof. The read order is now membership-first for non-admin actors. Live exploitation was not tested.

## Invariants preserved

- callback IDs and destinations;
- permissions and authoritative mutations;
- database schema and migrations;
- payments, credits and entitlements;
- invite economics;
- application/deal mechanics;
- giveaway mechanics;
- webhook/QStash behavior.

## QA

PASS locally:

- STEP586F guard;
- STEP586A–E regression guards;
- callback registry with zero unresolved references;
- dependency/runtime preflight;
- runtime proof spine;
- staging acceptance source contract;
- complete 223-file JavaScript syntax sweep;
- residual admin/broadcast/Instagram invariants;
- npm audit with zero vulnerabilities.

`npm run preflight:source` passed all reached assertion/registry/generator gates, then exceeded the tool limit in the long serial syntax sweep. The complete syntax surface and residual checks passed separately. The final serial PASS line was not observed.

## Not verified

- live Telegram traversal and mobile wrapping;
- Vercel Preview/production;
- live Neon/Redis/QStash;
- remote STEP584 acceptance;
- real-user comprehension.

## Next

`STEP586G — Admin and Operator Vocabulary`.
