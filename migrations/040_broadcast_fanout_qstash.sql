-- 040_broadcast_fanout_qstash.sql
-- QStash fan-out delivery: extend broadcast_sent_log to support queue/worker retries
-- Keep backwards-compatible with legacy direct-send cron.

alter table broadcast_sent_log
  add column if not exists attempts int not null default 0,
  add column if not exists non_retryable boolean not null default false,
  add column if not exists last_error text,
  add column if not exists last_attempt_at timestamptz;

-- Pending statuses are used by QStash delivery worker.
-- (No CHECK constraint: keep schema permissive for future extensions.)

create index if not exists idx_broadcast_sent_log_pending
  on broadcast_sent_log (broadcast_id, status)
  where status in ('queued','sending','retry','deferred','quarantined');

create index if not exists idx_broadcast_sent_log_sending_stale
  on broadcast_sent_log (broadcast_id, last_attempt_at)
  where status = 'sending';
