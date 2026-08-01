# STEP590C3 — Critical Giveaway Callback Bounded Domain

**Mode:** HEAVY / giveaway architecture
**Risk Score:** 17/20
**Baseline:** STEP590C2
**Runtime posture:** behavior-preserving callback extraction; no schema or ENV change

## Objective

Move the critical giveaway callback transport layer out of `src/bot/bot.js` into one bounded domain while preserving the existing database transaction, locks, eligibility rules and Telegram UX.

The STEP does not create another draw algorithm. The canonical settlement boundary remains:

```text
src/db/giveawayAtomicCore.js
src/db/queries.js → drawAndFinalizeGiveawayWinnersAtomicCore()
```

## Domain structure

```text
src/bot/domains/giveaways/
├── actions.js
├── callbacks.js
├── index.js
├── policy.js
└── route.js
```

`src/bot/routes/gwAccess.js` remains only as a compatibility re-export. `bot.js` imports the bounded domain directly.

## Extracted ownership

### `giveaway_access` — 4 actions

```text
a:gw_access
a:gw_access_recheck
a:gw_access_checkme
a:gw_access_user_prompt
```

### `giveaway_participant` — 2 actions

```text
a:gw_join
a:gw_check
```

### `giveaway_lifecycle` — 5 actions

```text
a:gw_end_now
a:gw_end_do
a:gw_wv
a:gw_draw_now
a:gw_draw_do
```

All routes remain `post_user` because they require the canonical application-user row.

## Preserved invariants

```text
one giveaway action → one executable owner
actual eligibility actor = ctx.from.id
manual end → db.atomicEndGiveaway()
manual draw → db.drawAndFinalizeGiveawayWinnersAtomic()
manual and cron draw use the same PostgreSQL atomic core
Redis draw lock remains UX/load shedding only
PostgreSQL advisory + row locks remain correctness boundary
no split winner writes
no JS PRNG fallback
extracted handlers cannot decline into legacy
callback keys and user copy remain stable
```

## Ownership delta

```text
STEP590C2 extracted owners: 22
STEP590C3 extracted owners: 29
STEP590C2 legacy owners:    538
STEP590C3 legacy owners:    531
```

The legacy surface decreases by seven additional callback actions. Four access actions were already extracted and are now consolidated under the same bounded domain.

## Explicit non-goals

- no giveaway schema change;
- no draw algorithm change;
- no sponsor-flow extraction;
- no publish/results-delivery extraction;
- no cron refactor;
- no callback-key rename;
- no Telegram copy redesign;
- no ORM or TypeScript migration.
