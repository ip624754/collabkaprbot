-- 042: Payments FK hardening (never cascade-delete financial logs)
--
-- Problem:
--   stars_payments.user_id and payments.user_id were created with ON DELETE CASCADE.
--   If a user row is ever physically deleted, financial history disappears as well,
--   breaking auditability and potentially idempotency around charge IDs.
--
-- Fix:
--   Replace user_id FKs in payment ledgers with ON DELETE RESTRICT.
--   Keep all other user references (applying_by_user_id / applied_by_user_id) as SET NULL.

DO $$
DECLARE
  conname text;
  deltype "char";
BEGIN
  -- stars_payments.user_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='stars_payments') THEN
    SELECT c.conname, c.confdeltype
      INTO conname, deltype
    FROM pg_constraint c
    WHERE c.contype='f'
      AND c.conrelid='stars_payments'::regclass
      AND pg_get_constraintdef(c.oid) LIKE '%FOREIGN KEY (user_id)%REFERENCES users(id)%'
    LIMIT 1;

    IF conname IS NULL THEN
      EXECUTE 'ALTER TABLE stars_payments '
           || 'ADD CONSTRAINT stars_payments_user_id_fkey '
           || 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT';
    ELSIF deltype = 'c' THEN
      EXECUTE format('ALTER TABLE stars_payments DROP CONSTRAINT %I', conname);
      EXECUTE 'ALTER TABLE stars_payments '
           || 'ADD CONSTRAINT stars_payments_user_id_fkey '
           || 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT';
    END IF;
  END IF;

  -- payments.user_id
  conname := NULL;
  deltype := NULL;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='payments') THEN
    SELECT c.conname, c.confdeltype
      INTO conname, deltype
    FROM pg_constraint c
    WHERE c.contype='f'
      AND c.conrelid='payments'::regclass
      AND pg_get_constraintdef(c.oid) LIKE '%FOREIGN KEY (user_id)%REFERENCES users(id)%'
    LIMIT 1;

    IF conname IS NULL THEN
      EXECUTE 'ALTER TABLE payments '
           || 'ADD CONSTRAINT payments_user_id_fkey '
           || 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT';
    ELSIF deltype = 'c' THEN
      EXECUTE format('ALTER TABLE payments DROP CONSTRAINT %I', conname);
      EXECUTE 'ALTER TABLE payments '
           || 'ADD CONSTRAINT payments_user_id_fkey '
           || 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT';
    END IF;
  END IF;
END$$;
