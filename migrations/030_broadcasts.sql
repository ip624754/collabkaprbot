-- 030_broadcasts.sql
-- Broadcast jobs: admin mass-messaging with batched delivery.

create table if not exists broadcasts (
  id bigserial primary key,
  created_by_user_id bigint not null references users(id),
  status text not null default 'DRAFT',
  -- DRAFT → PENDING → RUNNING → DONE / PAUSED / STOPPED / ERROR
  audience text not null default 'all',
  -- all / creators / brands / curators / managers
  draft_type text,
  -- text / photo / video / animation / document
  draft_text text,
  draft_file_id text,
  draft_caption text,
  buttons_json text,
  -- JSON array: [{text, url}]
  total_count int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  last_sent_user_id bigint,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_broadcasts_status on broadcasts(status);

-- Track which users received which broadcast (idempotency).
create table if not exists broadcast_sent_log (
  broadcast_id bigint not null references broadcasts(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  status text not null default 'sent',
  -- sent / failed / blocked
  sent_at timestamptz not null default now(),
  primary key (broadcast_id, user_id)
);
