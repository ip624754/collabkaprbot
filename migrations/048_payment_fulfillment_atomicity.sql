-- STEP588X1: canonical atomic Stars fulfillment + durable recovery context.
-- Product mutation, payment_fulfillments receipt and payments.status='APPLIED'
-- commit in one transaction. Safe to re-run through the migration runner.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS fulfillment_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS fulfillment_result jsonb,
  ADD COLUMN IF NOT EXISTS fulfillment_version text;

-- APPLYING has been used by runtime since STEP98 but the original constraint did
-- not include it. Rebuild the constraint so claim/recovery state is schema-valid.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN ('RECEIVED','APPLYING','APPLIED','ORPHANED','ERROR'));

CREATE TABLE IF NOT EXISTS payment_fulfillments (
  payment_id bigint PRIMARY KEY REFERENCES payments(id) ON DELETE RESTRICT,
  product_kind text NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_by_user_id bigint REFERENCES users(id) ON DELETE SET NULL,
  fulfillment_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_fulfillments_kind_time
  ON payment_fulfillments(product_kind, created_at DESC);
