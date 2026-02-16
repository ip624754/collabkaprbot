-- 033: User ban support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='banned_at'
  ) THEN
    ALTER TABLE users ADD COLUMN banned_at timestamptz DEFAULT NULL;
  END IF;
END$$;
