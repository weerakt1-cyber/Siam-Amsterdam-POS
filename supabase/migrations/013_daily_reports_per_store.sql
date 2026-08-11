-- ─── Per-store daily_reports (cash/reports group) ───────────────────────────
--
-- daily_reports was keyed on `date` alone (one cash report per day, global).
-- Multi-store needs one per (store, day), so the PRIMARY KEY moves from (date)
-- to (store_id, date). store_id was already added + backfilled to Store #1 in
-- migration 010. Existing rows stay valid (all Store #1, dates already unique).
--
-- Idempotent: safe to run more than once.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'daily_reports_pkey'
      and conrelid = 'daily_reports'::regclass
      and array_length(conkey, 1) = 1
  ) then
    alter table daily_reports drop constraint daily_reports_pkey;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'daily_reports_pkey' and conrelid = 'daily_reports'::regclass
  ) then
    alter table daily_reports add constraint daily_reports_pkey primary key (store_id, date);
  end if;
end $$;
