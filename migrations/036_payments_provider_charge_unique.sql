-- Harden payments idempotency: unique provider charge id (best-effort)
-- Telegram Stars provides both telegram_payment_charge_id and provider_payment_charge_id.
-- We already dedupe by telegram_payment_charge_id; this adds an extra safety net.

create unique index if not exists uq_stars_payments_provider_charge
  on stars_payments (provider_payment_charge_id)
  where provider_payment_charge_id is not null;

create unique index if not exists uq_payments_provider_charge
  on payments (provider_payment_charge_id)
  where provider_payment_charge_id is not null;
