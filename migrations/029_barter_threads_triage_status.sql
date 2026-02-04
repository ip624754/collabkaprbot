-- Add lightweight buyer-side triage status to barter threads.
-- Safe to run multiple times.

alter table barter_threads
  add column if not exists triage_status text not null default 'open';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'barter_threads_triage_status_chk'
  ) then
    alter table barter_threads
      add constraint barter_threads_triage_status_chk
      check (triage_status in ('open','in_progress','spam'));
  end if;
exception when undefined_table then
  -- If the base schema isn't present in this DB yet, ignore.
  null;
end $$;

create index if not exists idx_barter_threads_triage_status on barter_threads(triage_status);
