-- STEP105: Structured profile contacts (read-only support)
--
-- Goal: add an optional structured contacts container to workspace_settings.
-- In STEP105 we only READ these contacts (no creator UI changes yet).

alter table workspace_settings
  add column if not exists profile_contacts jsonb not null default '{}'::jsonb;

alter table workspace_settings
  add column if not exists profile_contacts_v int not null default 1;
