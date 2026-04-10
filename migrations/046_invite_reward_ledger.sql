create table if not exists invite_reward_ledger (
  id bigserial primary key,
  referrer_user_id bigint not null references users(id) on delete cascade,
  invited_user_id bigint references users(id) on delete set null,
  invite_id bigint references member_invites(id) on delete set null,
  invite_code text,
  entry_kind text not null check (entry_kind in ('earn', 'redeem')),
  reward_type text not null check (reward_type in ('invite_join', 'invite_activation', 'pro_7d', 'pro_30d')),
  points integer not null check (points > 0),
  status text not null check (status in ('pending', 'confirmed', 'rejected', 'redeemed')),
  confirm_after timestamptz,
  confirmed_at timestamptz,
  rejected_at timestamptz,
  redeemed_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_invite_reward_ledger_referrer on invite_reward_ledger (referrer_user_id, created_at desc);
create index if not exists idx_invite_reward_ledger_status on invite_reward_ledger (referrer_user_id, status, confirm_after);
create index if not exists idx_invite_reward_ledger_invited on invite_reward_ledger (invited_user_id);

create unique index if not exists uq_invite_reward_join_once
  on invite_reward_ledger (referrer_user_id, invited_user_id, reward_type, entry_kind)
  where entry_kind = 'earn' and reward_type = 'invite_join' and invited_user_id is not null;

create unique index if not exists uq_invite_reward_activation_once
  on invite_reward_ledger (referrer_user_id, invited_user_id, reward_type, entry_kind)
  where entry_kind = 'earn' and reward_type = 'invite_activation' and invited_user_id is not null;
