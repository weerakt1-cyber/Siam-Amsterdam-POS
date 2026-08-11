-- ─── Per-store app_config (Phase 2: config group) ───────────────────────────
--
-- app_config held one row per `key` (global). For multi-store, each store needs
-- its own payment keys / bar_settings / floor_layout / categories, so the key
-- must be unique PER STORE, not globally. store_id was already added + backfilled
-- to Store #1 in migration 010; here we move the PRIMARY KEY from (key) to
-- (store_id, key). Existing rows stay valid (all Store #1, keys already unique).
--
-- Idempotent: safe to run more than once.
do $$
begin
  -- drop the old single-column PK if it's still (key)
  if exists (
    select 1 from pg_constraint
    where conname = 'app_config_pkey'
      and conrelid = 'app_config'::regclass
      and array_length(conkey, 1) = 1
  ) then
    alter table app_config drop constraint app_config_pkey;
  end if;

  -- add the composite PK if not present
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_config_pkey' and conrelid = 'app_config'::regclass
  ) then
    alter table app_config add constraint app_config_pkey primary key (store_id, key);
  end if;
end $$;
