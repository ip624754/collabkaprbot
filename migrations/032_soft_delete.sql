-- 032: Soft delete — each user can hide items from their own view
-- deleted_by_user_ids = jsonb array of user IDs who "deleted" this item

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='barter_threads' AND column_name='deleted_by_user_ids'
  ) THEN
    ALTER TABLE barter_threads ADD COLUMN deleted_by_user_ids jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='brand_leads' AND column_name='deleted_by_user_ids'
  ) THEN
    ALTER TABLE brand_leads ADD COLUMN deleted_by_user_ids jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='brand_applications' AND column_name='deleted_by_user_ids'
  ) THEN
    ALTER TABLE brand_applications ADD COLUMN deleted_by_user_ids jsonb DEFAULT '[]'::jsonb;
  END IF;
END$$;
