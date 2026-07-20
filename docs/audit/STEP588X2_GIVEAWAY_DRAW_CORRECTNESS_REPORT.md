# STEP588X2 — Giveaway Draw Correctness & Single Atomic Path

**Date:** 2026-07-20
**Mode:** HEAVY / CRITICAL
**Risk Score:** 17/20
**Parent baseline:** STEP588X1
**Status:** SOURCE READY / PRODUCTION CANARY PENDING

## Objective

Remove the split giveaway settlement mechanism and make one PostgreSQL transaction own:

1. canonical giveaway row and draw parameters;
2. deterministic eligible-first selection;
3. deterministic top-up from ineligible entries;
4. winner persistence;
5. `WINNERS_DRAWN` transition;
6. actor/source-attributed audit receipt.

The STEP also makes sponsor replacement transactional because a delete-then-loop update was another confirmed giveaway partial-state boundary.

## Implemented mechanism

### Canonical service

`src/db/giveawayAtomicCore.js` now contains the dependency-light transaction service used through `src/db/queries.js`.

Both runtime callers use it:

- manual Telegram callback: `source = manual`, `actor_user_id = current internal user`;
- cron auto-draw: `source = cron`, `actor_user_id = NULL`.

The old manual JavaScript PRNG, direct `setWinners()`, independent status update and independent audit write were removed from the runtime flow.

### Transaction contract

```text
BEGIN ISOLATION LEVEL REPEATABLE READ
→ transaction-local statement timeout
→ PostgreSQL advisory transaction lock
→ giveaway row FOR UPDATE
→ canonical DB winners_count / ends_at / created_at
→ optional deadline-based ENDED transition + audit
→ eligible deterministic selection
→ ineligible deterministic top-up
→ bulk winner replacement
→ WINNERS_DRAWN update
→ reproducibility hashes
→ actor/source draw audit
→ COMMIT
```

Any failure before commit rolls back winners, status and audit together.

### Selection truth

- Eligible entries always occupy the first winner places.
- When eligible entries are fewer than `winners_count`, the remaining places are selected from `is_eligible = FALSE` entries.
- When no eligible entries exist, the draw uses all entries.
- When total participants are fewer than requested winners, every available participant is selected once; the result is explicitly underfilled rather than duplicated.
- Selection seed is derived from the locked database row:
  - `giveaway_id + ends_at` when `ends_at` exists;
  - `giveaway_id + created_at` as the durable fallback.
- Caller-provided stale count/deadline values are not authoritative.

### Idempotency and concurrency

- PostgreSQL advisory transaction lock is the cross-worker correctness boundary.
- Giveaway row lock and `winners_drawn_at IS NULL` enforce final idempotency.
- A repeated draw returns `already_drawn` and preserves the committed winner set.
- Redis draw lock remains only UX/load shedding for the Telegram callback.

### Audit truth

The `gw.winners_drawn` receipt is written in the same transaction and contains:

- caller source;
- actor through the relational `actor_user_id` column;
- isolation and snapshot timestamp;
- seed and seed source;
- algorithm/hash versions;
- requested and actual winner counts;
- eligible/top-up counts;
- eligible/all-entry pool hashes and cutoff timestamps;
- final winners hash.

A timed lazy end writes `gw.ended_lazy` in the same transaction before the draw receipt.

### Sponsor replacement

`replaceGiveawaySponsors()` now delegates to a transaction service:

```text
lock giveaway
→ delete old sponsor rows
→ one ordered bulk insert
→ commit
```

An insert failure restores the previous sponsor set through rollback.

## Corrected source defects

- undeclared `snapshotTs` and `txIsolation` scope defect eliminated;
- malformed duplicated `FROM giveaways` and duplicated `WHERE` fragments removed with the retired implementation;
- manual draw no longer has a separate algorithm or persistence path;
- manual top-up now works for `0 < eligible < requested`, not only when eligible is zero;
- winner persistence no longer uses a delete-plus-per-row runtime loop;
- actor/source audit is atomic with settlement;
- sponsor replacement is no longer externally observable as a partial delete.

## Executable verification

`node scripts/test-giveaway-draw-critical.js`

Verified by 55 executable assertions:

- eligible-first top-up;
- zero eligible;
- insufficient total participants;
- no duplicate winner;
- advisory lock contention;
- repeated draw idempotency;
- failure after winner insert;
- failure before status update;
- audit failure rollback;
- manual/cron mechanism parity;
- durable seed and reproducibility metadata;
- timed lazy-end and draw in one transaction;
- empty-pool skip receipt;
- wrong status and workspace mismatch fail closed;
- sponsor replacement success and rollback.

Supplementary drift guard:

`node scripts/smoke-giveaway-single-atomic-path-contract.js`

## QA summary

### VERIFIED

- 124/124 registered source checks PASS across bounded batches;
- 55 giveaway behavioral assertions PASS;
- 66 payment behavioral assertions remain PASS;
- 238/238 JavaScript syntax checks PASS across `api`, `migrations`, `scripts`, and `src`;
- action registry generation has no drift;
- migration pack generation has no drift;
- optional admin render, broadcast overload and Instagram contact-leak checks PASS;
- package-lock consistency PASS;
- no migration is required by STEP588X2.

### NOT VERIFIED

- real PostgreSQL multi-session lock contention;
- real Neon transaction rollback under connection termination;
- production cron/manual overlap;
- production Telegram manual callback behavior;
- production winner notifications;
- production sponsor replacement;
- full dependency/runtime preflight in this environment: `npm ci` did not complete and local `grammy` / `@upstash/qstash` remained unavailable;
- STEP586H1 24-hour observation.

## Release decision

STEP588X2 is source-ready but not production-accepted. STEP587 and STEP589 remain HOLD. Use the STEP588X2 rollout runbook and retain the next remediation target as STEP588X3.
