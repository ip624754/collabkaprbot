# STEP588X3 — Broadcast Delivery Unknown-State Safety Rollout Runbook

**Policy:** migration first, runtime second. Do not use an important commercial broadcast as the first canary.

## 1. Pre-deploy snapshot

Record:

- current Vercel deployment ID;
- current repository commit/tree;
- active broadcast IDs and statuses;
- counts by `broadcast_sent_log.status`;
- whether QStash fanout is enabled;
- current broadcast cron health.

Suggested read-only SQL:

```sql
select status, count(*)
from broadcast_sent_log
group by status
order by status;

select id, status, total_count, sent_count, failed_count, updated_at
from broadcasts
where status in ('RUNNING', 'PAUSED')
order by id desc;
```

## 2. Apply migration 049

Apply `migrations/049_broadcast_delivery_unknown_state.sql` to production Neon before deploying runtime.

Verify:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'broadcast_sent_log'
  and column_name in (
    'delivery_attempt_id',
    'delivery_unknown_at',
    'telegram_message_ids',
    'resolved_at',
    'resolved_by_tg_id',
    'resolution_note'
  )
order by column_name;

select indexname
from pg_indexes
where tablename = 'broadcast_sent_log'
  and indexname in (
    'idx_broadcast_sent_log_delivery_unknown',
    'idx_broadcast_sent_log_attempt'
  )
order by indexname;
```

Expected: six columns and two indexes.

## 3. Deploy runtime

Deploy STEP588X3 only after the schema verification succeeds.

Immediately verify:

- `/api/health` remains reachable;
- cron router does not report a migration error;
- QStash signature verification remains green;
- admin Communications loads;
- no unexpected increase in `delivery_unknown`.

## 4. Normal-send canary

Use a controlled audience containing only operator-owned test accounts.

Verify exactly one row per recipient:

```sql
select
  broadcast_id,
  user_id,
  status,
  attempts,
  delivery_attempt_id,
  telegram_message_ids,
  last_attempt_at,
  delivery_unknown_at,
  last_error
from broadcast_sent_log
where broadcast_id = :canary_broadcast_id
order by user_id;
```

Expected:

- `status = 'sent'`;
- `attempts = 1` for the first successful claim;
- non-null `delivery_attempt_id`;
- Telegram message ID present when returned by the send helper;
- one Telegram message per intended recipient.

## 5. Replay check

Replay the same delivery payload or allow a duplicate QStash invocation for the same `(broadcast_id, user_id)`.

Expected:

- claim returns not claimable;
- no second Telegram message;
- attempts and attempt ID remain unchanged;
- status remains `sent`.

## 6. Unknown-state canary

Do not induce a DB outage in production. Use staging/preview fault injection or a controlled test adapter to simulate:

```text
Telegram success
→ mark sent throws / returns no row
```

Expected:

- only DB receipt writes are retried;
- Telegram send count remains one;
- row becomes `delivery_unknown`, or honestly remains `sending_unconfirmed` while DB is unavailable;
- later stale quarantine converts persisted `sending` to `delivery_unknown`;
- no QStash or cron path sends it again.

Verify:

```sql
select *
from broadcast_sent_log
where status = 'delivery_unknown'
order by delivery_unknown_at desc;
```

## 7. Founder reconciliation

In Admin → Communications:

1. open `Неопределённые доставки`;
2. compare Telegram evidence and recipient state;
3. select `Подтвердить отправку` or `Подтвердить ошибку`;
4. enter a mandatory evidence note.

Verify SQL:

```sql
select status, resolved_at, resolved_by_tg_id, resolution_note
from broadcast_sent_log
where broadcast_id = :broadcast_id and user_id = :user_id;
```

Verify that no Telegram message is sent by reconciliation.

## 8. 429 check

Use only a safe staging simulation. Confirm that distinct-recipient counting executes through Redis Lua and that explicit 429 still enters deferred/quarantine handling rather than unknown handling.

## 9. Observation window

For at least one full broadcast cycle record:

- sent count;
- unknown count;
- blocked/failed/deferred counts;
- stale quarantine count;
- QStash retry logs;
- operator reconciliation events;
- duplicate-message evidence: expected zero.

## 10. Rollback

Migration 049 is additive and may remain installed.

Runtime rollback to STEP588X2 is technically possible, but it is unsafe while any `delivery_unknown` rows exist because STEP588X2 can reclaim stale `sending` and lacks the new operator contract. Preferred policy is fix-forward.

Before any rollback:

```sql
select count(*) as unknown_count
from broadcast_sent_log
where status = 'delivery_unknown';
```

If non-zero, keep STEP588X3 runtime or manually quarantine operations until a fix-forward deployment is ready.

## 11. Acceptance evidence

Preserve:

- migration output;
- Vercel deployment ID;
- canary broadcast ID;
- SQL before/after rows;
- Telegram screenshots or transcript;
- duplicate replay result;
- unknown-state simulation result;
- reconciliation audit evidence.

Only then mark STEP588X3 `PRODUCTION ACCEPTED`.
