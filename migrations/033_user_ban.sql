-- 033: User ban support
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='brand_leads_status_chk') THEN
    ALTER TABLE brand_leads 
      ADD CONSTRAINT brand_leads_status_chk 
      CHECK (status in ('new','in_progress','closed','spam'));
  END IF;
END$$;

create index if not exists idx_brand_leads_ws_status_created on brand_leads (workspace_id, status, created_at desc);
create index if not exists idx_brand_leads_owner_status_created on brand_leads (owner_user_id, status, created_at desc);
create index if not exists idx_brand_leads_brand_user_created on brand_leads (brand_user_id, created_at desc);
