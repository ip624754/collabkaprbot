-- Collabka migration pack: reconcile/repair (idempotent)
-- Purpose:
--   Bring ANY database to a minimum required infra state without conflicts.
--   Safe to run multiple times.
--
-- Includes:
--   - pgcrypto extension (for deterministic SHA-256 draws)
--   - event_outbox + indexes (reliable delivery)
--   - audit_events + indexes (immutable audit trail)
--   - soft-delete columns: deleted_by_user_ids (jsonb) on key tables
--   - giveaway performance indexes

-- 1) Crypto extension (sha256)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2) Outbox (reliable events)
CREATE TABLE IF NOT EXISTS event_outbox (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'PENDING', -- PENDING, DONE, DEAD
  attempts INTEGER DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_worker
  ON event_outbox (status, next_attempt_at)
  WHERE status = 'PENDING';

-- 3) Audit (immutable events log)
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID,
  entity_type TEXT NOT NULL, -- 'giveaway', 'user', 'system'
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity
  ON audit_events (entity_type, entity_id);

-- 4) Giveaway performance indexes (safe, partial)
CREATE INDEX IF NOT EXISTS idx_giveaways_expiration
  ON giveaways (status, ends_at)
  WHERE status IN ('ACTIVE', 'RUNNING');

CREATE INDEX IF NOT EXISTS idx_entries_draw
  ON giveaway_entries (giveaway_id, is_eligible);

-- 5) Soft delete columns (safe add)
ALTER TABLE IF EXISTS barter_threads
  ADD COLUMN IF NOT EXISTS deleted_by_user_ids jsonb DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS brand_leads
  ADD COLUMN IF NOT EXISTS deleted_by_user_ids jsonb DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS brand_applications
  ADD COLUMN IF NOT EXISTS deleted_by_user_ids jsonb DEFAULT '[]'::jsonb;
