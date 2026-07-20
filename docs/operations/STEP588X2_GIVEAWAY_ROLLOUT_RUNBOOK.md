# STEP588X2 — Giveaway Rollout Runbook

**Purpose:** controlled deployment and evidence collection for the single atomic giveaway draw path.
**Schema migration:** none.
**Rollback type:** code rollback; committed test draw records must not be rewritten merely to simplify evidence.

## Preconditions

- STEP588X1 runtime baseline is the deployed source baseline or later.
- Do not use a commercially important giveaway for first acceptance.
- Create dedicated canary giveaways with clearly identified test participants.
- Preserve pre-deploy rows and logs before modifying anything.
- Do not manually edit winner rows to manufacture a PASS.

## 1. Pre-deploy source checks

```bash
npm run test:giveaway-draw-critical
npm run smoke:giveaway-single-atomic-path-contract
npm run preflight:source
```

A single `preflight:source` may exceed constrained execution windows. Bounded batches are acceptable only when every registered check and the generated-file/syntax gates are executed and recorded.

## 2. Deploy

Deploy STEP588X2 runtime. No SQL migration is required.

Confirm health and cron surfaces are no worse than the prior accepted baseline. A healthy endpoint does not by itself prove giveaway correctness.

## 3. Manual top-up canary

Create a dedicated ended giveaway with:

- `winners_count = 3`;
- at least four participants;
- exactly one or two `is_eligible = true` participants;
- remaining participants `is_eligible = false`.

Record before-state:

```sql
select id, workspace_id, status, winners_count, ends_at, winners_drawn_at
from giveaways
where id = :giveaway_id;

select user_id, is_eligible, joined_at
from giveaway_entries
where giveaway_id = :giveaway_id
order by user_id;

select *
from giveaway_winners
where giveaway_id = :giveaway_id;
```

Use the Telegram manual draw button once.

Expected:

- final status `WINNERS_DRAWN`;
- exactly three winner rows when at least three participants exist;
- all eligible participants selected before top-up participants;
- no duplicate `user_id` and no duplicate `place`;
- one `gw.winners_drawn` receipt with `source = manual`;
- `actor_user_id` equals the actual internal operator user;
- `used_pool = eligible_topup`;
- `eligible_winners + topup_winners = winners`.

Evidence query:

```sql
select id, status, winners_drawn_at
from giveaways
where id = :giveaway_id;

select place, user_id, created_at
from giveaway_winners
where giveaway_id = :giveaway_id
order by place;

select actor_user_id, action, payload, created_at
from giveaway_audit
where giveaway_id = :giveaway_id
  and action in ('gw.ended_lazy', 'gw.winners_drawn', 'gw.winners_drawn_skipped')
order by id;
```

## 4. Replay/idempotency canary

Press the manual draw action again or replay the same callback in the controlled test.

Expected:

- user receives an already-selected response;
- winner rows remain byte-for-byte equivalent by `(place, user_id)`;
- no second `gw.winners_drawn` audit receipt;
- no second winner notification batch should be triggered by an `already_drawn` result.

## 5. Auto-draw canary

Use a second dedicated giveaway:

- `status = ENDED`;
- `auto_draw = true`;
- stable participant and eligibility rows;
- no existing winners.

Run the normal giveaway cron once.

Expected:

- status becomes `WINNERS_DRAWN`;
- one winner set;
- one `gw.winners_drawn` audit receipt;
- `payload.source = cron`;
- `actor_user_id IS NULL`;
- a second cron run does not alter winners or create a second draw receipt.

## 6. Timed lazy-end canary

Optional but recommended on staging/preview:

- giveaway remains in an endable status;
- `ends_at` is already in the past;
- manual draw is invoked after the UI treats it as ended.

Expected in one committed transaction:

```text
gw.ended_lazy
→ gw.winners_drawn
```

Both audit rows must have the same actor and `same_transaction_as_draw = true` on the lazy-end receipt.

## 7. Underfill canary

Use `winners_count` greater than total participants.

Expected:

- every participant appears at most once;
- giveaway becomes `WINNERS_DRAWN` when at least one participant exists;
- audit `winners` is lower than `requested_winners` and matches durable winner rows;
- no synthetic/duplicate winner is created.

## 8. Sponsor replacement canary

On a non-critical draft giveaway, replace a two-row sponsor set with another ordered set.

Expected:

- final rows exactly match the submitted ordered set;
- no intermediate empty state is observable after a successful transaction;
- a failed request must preserve the prior committed set.

## Stop conditions

Stop rollout and preserve evidence when any of the following occurs:

- partial winner rows with status not drawn;
- `WINNERS_DRAWN` with no winners despite available entries;
- duplicate place or user;
- manual and cron still use different audit formats;
- more than one `gw.winners_drawn` receipt;
- eligible participants omitted while fallback participants win;
- transaction/connection error followed by a changed partial state;
- sponsor set becomes empty after a failed replacement.

## Rollback

Code rollback to STEP588X1 is technically possible because STEP588X2 adds no schema.

However:

- do not revert or delete already committed winners automatically;
- do not rerun an important giveaway under a different algorithm;
- preserve audit/winner rows and decide correction through a separate incident STEP;
- keep STEP587 and STEP589 on HOLD.

## Production acceptance evidence

Required before marking STEP588X2 production-accepted:

- deployment identifier/commit;
- one manual top-up canary;
- one replay/idempotency check;
- one cron canary;
- SQL before/after winner and audit evidence;
- confirmation of no duplicate notifications or winner changes;
- operator statement that no important live giveaway was used for destructive testing.
