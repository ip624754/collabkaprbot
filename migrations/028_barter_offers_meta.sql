-- Adds structured meta to barter offers (creator offers)
-- Used for brand-side filtering + richer cards + official channel posts.

alter table if exists barter_offers
  add column if not exists meta jsonb not null default '{}'::jsonb;

-- Optional: speeds up tag overlap filters (goals_tags/req_tags)
create index if not exists idx_barter_offers_meta_gin on barter_offers using gin (meta);
