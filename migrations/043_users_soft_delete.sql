-- 043: Users soft-delete / deactivation flags
--
-- We intentionally avoid hard-deleting users to preserve:
--   - payment ledgers / audit trails
--   - idempotency keys (telegram/provider charge ids)
--   - relational integrity for historical records
--
-- Use:
--   - is_deleted=true + deleted_at for "soft delete" (hide/disable)
--   - deactivated_at for temporary disabling (optional)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='users') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='users' AND column_name='is_deleted'
    ) THEN
      ALTER TABLE users ADD COLUMN is_deleted boolean NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='users' AND column_name='deleted_at'
    ) THEN
      ALTER TABLE users ADD COLUMN deleted_at timestamptz;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='users' AND column_name='deactivated_at'
    ) THEN
      ALTER TABLE users ADD COLUMN deactivated_at timestamptz;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='users' AND column_name='deactivated_reason'
    ) THEN
      ALTER TABLE users ADD COLUMN deactivated_reason text;
    END IF;
  END IF;
END$$;
