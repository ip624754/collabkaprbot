-- STEP141: IG OAuth accounts (Level A, OAuth-only)
-- Store IG professional account binding + encrypted token per workspace.
-- Invariants:
-- - No tokens in logs
-- - Tokens stored encrypted (app-level)
-- - Brands never see handle before unlock (enforced in bot rendering)

create table if not exists ig_oauth_accounts (
  ws_id bigint primary key references workspaces(id) on delete cascade,
  ig_user_id text not null,
  ig_username text not null,
  account_type text null,
  status text not null default 'CONNECTED',
  access_token_enc text not null,
  token_expires_at timestamptz null,
  scope text null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ig_oauth_accounts_ig_user_id_idx on ig_oauth_accounts(ig_user_id);
