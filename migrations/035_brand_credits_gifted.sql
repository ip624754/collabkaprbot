-- Track gifted Brand Pass credits separately from purchased/trial.
-- Allows safe revoke of gifts without touching purchased credits.

alter table users
  add column if not exists brand_credits_gifted int not null default 0;

create index if not exists idx_users_brand_credits_gifted on users(brand_credits_gifted);
