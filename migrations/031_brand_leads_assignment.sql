-- 031: Assignment — distribute leads among curators
-- assigned_user_id = curator who took this lead
-- assigned_at = when it was assigned

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='brand_leads' AND column_name='assigned_user_id'
  ) THEN
    ALTER TABLE brand_leads ADD COLUMN assigned_user_id bigint REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='brand_leads' AND column_name='assigned_at'
  ) THEN
    ALTER TABLE brand_leads ADD COLUMN assigned_at timestamptz;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_brand_leads_assigned ON brand_leads (assigned_user_id) WHERE assigned_user_id IS NOT NULL;
