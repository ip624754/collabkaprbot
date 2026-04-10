create table if not exists member_invites (
  id bigserial primary key,
  referrer_user_id bigint not null references users(id) on delete cascade,
  invited_user_id bigint not null unique references users(id) on delete cascade,
  invite_code text not null,
  source text not null,
  status text not null default 'created',
  start_param text,
  joined_at timestamptz not null default now(),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source in ('inline_share', 'raw_link', 'invite_card')),
  check (status in ('created', 'activated'))
);

create unique index if not exists uniq_member_invites_pair on member_invites (referrer_user_id, invited_user_id);
create index if not exists idx_member_invites_referrer_joined_at on member_invites (referrer_user_id, joined_at desc);
create index if not exists idx_member_invites_invite_code on member_invites (invite_code);
