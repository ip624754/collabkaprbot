-- Collabka migration pack: reconcile/repair (idempotent)
-- Purpose:
--   Bring ANY database to a minimum required infra state without conflicts.
--   Safe to run multiple times.
--
-- Notes:
--   - This script is NOT a full schema install. It only "patches" infra pieces that are safe to add.
--   - Everything here is written to be re-runnable (IF EXISTS / IF NOT EXISTS + guards).

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

-- 4) Soft-delete support (safe add)
ALTER TABLE IF EXISTS barter_threads
  ADD COLUMN IF NOT EXISTS deleted_by_user_ids jsonb DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS brand_leads
  ADD COLUMN IF NOT EXISTS deleted_by_user_ids jsonb DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS brand_applications
  ADD COLUMN IF NOT EXISTS deleted_by_user_ids jsonb DEFAULT '[]'::jsonb;

-- 5) Giveaway performance indexes (safe, only if base tables exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='giveaways') THEN
    EXECUTE $$
      CREATE INDEX IF NOT EXISTS idx_giveaways_expiration
        ON giveaways (status, ends_at)
        WHERE status IN ('ACTIVE', 'RUNNING');
    $$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='giveaway_entries') THEN
    EXECUTE $$
      CREATE INDEX IF NOT EXISTS idx_entries_draw
        ON giveaway_entries (giveaway_id, is_eligible);
    $$;
  END IF;
END $$;

-- 6) Brand Pass: gifted credits bucket (safe add)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='users') THEN
    EXECUTE $$
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS brand_credits_gifted int not null default 0;
    $$;

    EXECUTE $$
      CREATE INDEX IF NOT EXISTS idx_users_brand_credits_gifted
        ON users(brand_credits_gifted);
    $$;
  END IF;
END $$;

-- 7) Brand Pass: persistent contacts unlocks (safe create)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='users')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='workspaces') THEN

    EXECUTE $$
      CREATE TABLE IF NOT EXISTS brand_contact_unlocks (
        id bigserial primary key,
        brand_user_id int not null references users(id) on delete cascade,
        workspace_id int not null references workspaces(id) on delete cascade,
        unlocked_until timestamptz not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (brand_user_id, workspace_id)
      );
    $$;

    EXECUTE $$
      CREATE INDEX IF NOT EXISTS idx_brand_contact_unlocks_brand_until
        ON brand_contact_unlocks (brand_user_id, unlocked_until desc);
    $$;

    EXECUTE $$
      CREATE INDEX IF NOT EXISTS idx_brand_contact_unlocks_ws_until
        ON brand_contact_unlocks (workspace_id, unlocked_until desc);
    $$;

  END IF;
END $$;

-- 8) Payments idempotency hardening (safe indexes)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='stars_payments') THEN
    EXECUTE $$
      CREATE UNIQUE INDEX IF NOT EXISTS uq_stars_payments_provider_charge
        ON stars_payments (provider_payment_charge_id)
        WHERE provider_payment_charge_id is not null;
    $$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='payments') THEN
    EXECUTE $$
      CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_charge
        ON payments (provider_payment_charge_id)
        WHERE provider_payment_charge_id is not null;
    $$;
  END IF;
END $$;

-- 9) Broadcast: per-recipient retry_after (429 defer) (safe add + index)
ALTER TABLE IF EXISTS broadcast_sent_log
  ADD COLUMN IF NOT EXISTS retry_after_until timestamptz;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='broadcast_sent_log') THEN
    EXECUTE $$
      CREATE INDEX IF NOT EXISTS idx_broadcast_sent_log_deferred_retry
        ON broadcast_sent_log (broadcast_id, retry_after_until)
        WHERE status = 'deferred';
    $$;
  END IF;
END $$;

-- 10) Broadcast: DB fuse for cooldown when Redis is unavailable (safe add + index)
ALTER TABLE IF EXISTS broadcasts
  ADD COLUMN IF NOT EXISTS cooldown_until timestamptz,
  ADD COLUMN IF NOT EXISTS cooldown_reason text;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='broadcasts') THEN
    EXECUTE $$
      CREATE INDEX IF NOT EXISTS idx_broadcasts_cooldown_until
        ON broadcasts(cooldown_until);
    $$;
  END IF;
END $$;

-- 11) Broadcast: QStash fan-out delivery support (safe add + indexes)
ALTER TABLE IF EXISTS broadcast_sent_log
  ADD COLUMN IF NOT EXISTS attempts int not null default 0,
  ADD COLUMN IF NOT EXISTS non_retryable boolean not null default false,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='broadcast_sent_log') THEN
    EXECUTE $$
      CREATE INDEX IF NOT EXISTS idx_broadcast_sent_log_pending
        ON broadcast_sent_log (broadcast_id, status)
        WHERE status in ('queued','sending','retry','deferred','quarantined');
    $$;

    EXECUTE $$
      CREATE INDEX IF NOT EXISTS idx_broadcast_sent_log_sending_stale
        ON broadcast_sent_log (broadcast_id, last_attempt_at)
        WHERE status = 'sending';
    $$;
  END IF;
END $$;

-- 12) Structured profile contacts container (safe add)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='workspace_settings') THEN
    EXECUTE $$
      ALTER TABLE workspace_settings
        ADD COLUMN IF NOT EXISTS profile_contacts jsonb not null default '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS profile_contacts_v int not null default 1;
    $$;
  END IF;
END $$;

-- 13) IG OAuth accounts (safe create)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='workspaces') THEN
    EXECUTE $$
      CREATE TABLE IF NOT EXISTS ig_oauth_accounts (
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
    $$;

    EXECUTE $$
      CREATE INDEX IF NOT EXISTS ig_oauth_accounts_ig_user_id_idx
        ON ig_oauth_accounts(ig_user_id);
    $$;
  END IF;
END $$;

-- 14) Payments: canonical atomic fulfillment contract (STEP588X1)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='payments') THEN
    EXECUTE $sql$
      ALTER TABLE payments
        ADD COLUMN IF NOT EXISTS fulfillment_context jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS fulfillment_result jsonb,
        ADD COLUMN IF NOT EXISTS fulfillment_version text
    $sql$;

    EXECUTE 'ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check';
    EXECUTE $sql$
      ALTER TABLE payments
        ADD CONSTRAINT payments_status_check
        CHECK (status IN ('RECEIVED','APPLYING','APPLIED','ORPHANED','ERROR'))
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='payments')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='users') THEN
    EXECUTE $sql$
      CREATE TABLE IF NOT EXISTS payment_fulfillments (
        payment_id bigint PRIMARY KEY REFERENCES payments(id) ON DELETE RESTRICT,
        product_kind text NOT NULL,
        result jsonb NOT NULL DEFAULT '{}'::jsonb,
        applied_by_user_id bigint REFERENCES users(id) ON DELETE SET NULL,
        fulfillment_version text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    $sql$;
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_payment_fulfillments_kind_time
        ON payment_fulfillments(product_kind, created_at DESC)
    $sql$;
  END IF;
END $$;

-- 15) Broadcast delivery unknown-state safety (STEP588X3)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE IF EXISTS broadcast_sent_log
  ADD COLUMN IF NOT EXISTS delivery_attempt_id uuid,
  ADD COLUMN IF NOT EXISTS delivery_unknown_at timestamptz,
  ADD COLUMN IF NOT EXISTS telegram_message_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by_tg_id bigint,
  ADD COLUMN IF NOT EXISTS resolution_note text;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='broadcast_sent_log') THEN
    EXECUTE $$
      CREATE INDEX IF NOT EXISTS idx_broadcast_sent_log_delivery_unknown
        ON broadcast_sent_log (broadcast_id, delivery_unknown_at DESC)
        WHERE status = 'delivery_unknown';
    $$;

    EXECUTE $$
      CREATE INDEX IF NOT EXISTS idx_broadcast_sent_log_attempt
        ON broadcast_sent_log (broadcast_id, user_id, delivery_attempt_id)
        WHERE delivery_attempt_id IS NOT NULL;
    $$;
  END IF;
END $$;
