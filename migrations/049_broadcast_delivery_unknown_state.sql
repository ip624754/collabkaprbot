-- STEP588X3: Broadcast Delivery Unknown-State Safety
-- Preserve at-most-once delivery semantics when Telegram outcome or DB receipt is ambiguous.

create extension if not exists pgcrypto;

alter table broadcast_sent_log
  add column if not exists delivery_attempt_id uuid,
  add column if not exists delivery_unknown_at timestamptz,
  add column if not exists telegram_message_ids jsonb not null default '[]'::jsonb,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by_tg_id bigint,
  add column if not exists resolution_note text;

create index if not exists idx_broadcast_sent_log_delivery_unknown
  on broadcast_sent_log (broadcast_id, delivery_unknown_at desc)
  where status = 'delivery_unknown';

create index if not exists idx_broadcast_sent_log_attempt
  on broadcast_sent_log (broadcast_id, user_id, delivery_attempt_id)
  where delivery_attempt_id is not null;
