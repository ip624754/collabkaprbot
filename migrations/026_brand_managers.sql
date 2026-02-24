-- Brand Pass: persistent contacts unlocks (DB fallback when Redis is down)

create table if not exists brand_contact_unlocks (
  id bigserial primary key,
  brand_user_id int not null references users(id) on delete cascade,
  workspace_id int not null references workspaces(id) on delete cascade,
  unlocked_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_user_id, workspace_id)
);

create index if not exists idx_brand_contact_unlocks_brand_until
  on brand_contact_unlocks (brand_user_id, unlocked_until desc);

create index if not exists idx_brand_contact_unlocks_ws_until
  on brand_contact_unlocks (workspace_id, unlocked_until desc);
