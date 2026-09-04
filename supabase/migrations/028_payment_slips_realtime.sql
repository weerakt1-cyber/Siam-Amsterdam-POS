-- ─── Realtime for payment_slips ─────────────────────────────────────────────
-- Lets POS devices subscribe to slip changes so a slip verified on the cashier's
-- phone reaches the manager's phone instantly (postgres_changes), instead of
-- waiting for the ~90s /api/alerts poll. RLS on payment_slips (migration 025)
-- still scopes what each subscriber receives to their own store.
--
-- REPLICA IDENTITY FULL so Realtime can evaluate the store-isolation policy and
-- the store_id filter against UPDATE rows (a manual staff confirm flips
-- pending → verified via UPDATE); payment_slips is low-volume so the extra WAL
-- is negligible. Idempotent.

alter table if exists public.payment_slips replica identity full;

do $$
begin
  -- The publication Supabase Realtime listens on. Adding a table twice errors,
  -- so guard on the catalog first.
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'payment_slips'
  ) then
    execute 'alter publication supabase_realtime add table public.payment_slips';
  end if;
exception
  when undefined_object then
    -- No supabase_realtime publication in this environment (e.g. a bare local
    -- Postgres without the Realtime extension) — nothing to attach to.
    null;
end $$;
