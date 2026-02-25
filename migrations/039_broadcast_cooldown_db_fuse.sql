-- 039_broadcast_cooldown_db_fuse.sql
-- DB fuse for broadcast 429 cooldown when Redis is unavailable.
-- Goal: avoid expensive recipient polling in Neon during cooldown.

alter table broadcasts
  add column if not exists cooldown_until timestamptz,
  add column if not exists cooldown_reason text;

create index if not exists idx_broadcasts_cooldown_until on broadcasts(cooldown_until);
