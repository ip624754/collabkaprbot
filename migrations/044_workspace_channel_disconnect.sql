-- STEP409: soft disconnect / reconnect workspace channel.
-- Keep history/profile/billing; disable active creator flows via DB-truth flag.

alter table workspace_settings
  add column if not exists channel_connected boolean not null default true;

alter table workspace_settings
  add column if not exists channel_disconnected_at timestamptz;

update workspace_settings
   set channel_connected = true
 where channel_connected is null;
