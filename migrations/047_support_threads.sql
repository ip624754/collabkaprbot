create table if not exists support_threads (
  id bigserial primary key,
  user_id bigint references users(id) on delete set null,
  user_tg_id bigint not null,
  status text not null default 'open' check (status in ('open', 'waiting_operator', 'waiting_user', 'closed')),
  category text,
  source text not null default 'telegram_bot',
  support_chat_id bigint,
  support_message_id bigint,
  support_topic_id bigint,
  opened_at timestamptz not null default now(),
  last_user_message_at timestamptz,
  last_operator_reply_at timestamptz,
  closed_at timestamptz,
  last_operator_tg_id bigint,
  last_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_support_threads_open_user
  on support_threads (user_id)
  where user_id is not null and closed_at is null;

create index if not exists idx_support_threads_status_updated
  on support_threads (status, updated_at desc);

create index if not exists idx_support_threads_user_updated
  on support_threads (user_id, updated_at desc);

create index if not exists idx_support_threads_tg_updated
  on support_threads (user_tg_id, updated_at desc);
