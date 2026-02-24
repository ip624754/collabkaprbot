-- 037_broadcast_sent_log_retry_after.sql
-- Broadcast per-recipient retry_after (defer recipients that hit Telegram 429)
-- Goal: one "heavy" recipient must NOT stall the whole broadcast forever.

alter table broadcast_sent_log
  add column if not exists retry_after_until timestamptz;

create index if not exists idx_broadcast_sent_log_deferred_retry
  on broadcast_sent_log (broadcast_id, retry_after_until)
  where status = 'deferred';
