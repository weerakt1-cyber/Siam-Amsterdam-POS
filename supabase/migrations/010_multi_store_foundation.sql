-- ─── Multi-store foundation (Phase 0-1: schema + backfill only) ───────────────
--
-- Goal: give every tenant-scoped table a `store_id` so data can later be
-- isolated per store. This migration is deliberately NON-BREAKING and does NOT
-- turn on any isolation yet:
--   • The API routes still run on the service_role key, which bypasses RLS, and
--     none of them filter by store_id yet — so behaviour is unchanged.
--   • Every store_id is backfilled to Store #1 (Siam Amsterdam) and gets a
--     DEFAULT of Store #1, so existing INSERTs that don't mention store_id keep
--     working and existing SELECTs (which ignore the column) are unaffected.
--
-- Enforcement (API-layer filtering) and RLS-as-backup come in later phases.
-- Idempotent: safe to run more than once.

-- ── Stores registry ──────────────────────────────────────────────────────────
create table if not exists stores (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  slug       text        unique,
  created_at timestamptz not null default now()
);
alter table stores disable row level security;  -- RLS policies added in Phase 3

-- Store #1 = the existing venue. Fixed UUID so code/backfill can reference it.
insert into stores (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Siam Amsterdam', 'siam-amsterdam')
on conflict (id) do nothing;

-- ── Add store_id to every tenant-scoped table ────────────────────────────────
-- Child tables (order_items, coupon_uses, menu_ingredients, stock_adjustments)
-- get store_id denormalised too, so future per-store filtering/RLS is a single
-- indexed predicate instead of a join. `profiles` gets it as identity → store.
do $$
declare
  t      text;
  store1 uuid := '00000000-0000-0000-0000-000000000001';
  -- Only tables that actually exist in the live DB. (menu_ingredients from
  -- migration 005 was never created in production, so it's omitted; the
  -- to_regclass guard below also skips anything absent, just in case.)
  tbls   text[] := array[
    'orders','order_items','menu_items','categories','members',
    'inventory_items','stock_adjustments','daily_reports','coupons','coupon_uses',
    'promotions','pos_users','staff','api_keys',
    'webhook_configs','app_config','profiles'
  ];
begin
  foreach t in array tbls loop
    -- 0. skip tables that don't exist (keeps this migration robust/idempotent)
    if to_regclass('public.' || t) is null then
      raise notice 'skipping missing table %', t;
      continue;
    end if;
    -- 1. add nullable column (no-op if already there)
    execute format('alter table %I add column if not exists store_id uuid', t);
    -- 2. backfill existing rows to Store #1
    execute format('update %I set store_id = %L where store_id is null', t, store1);
    -- 3. default new rows to Store #1 (keeps current single-store inserts working;
    --    Phase 4 provisioning will set store_id explicitly for new stores)
    execute format('alter table %I alter column store_id set default %L', t, store1);
    -- 4. now that no NULLs remain, enforce presence
    execute format('alter table %I alter column store_id set not null', t);
    -- 5. FK to stores (guarded — ADD CONSTRAINT has no IF NOT EXISTS)
    if not exists (select 1 from pg_constraint where conname = t || '_store_id_fkey') then
      execute format(
        'alter table %I add constraint %I foreign key (store_id) references stores(id) on delete cascade',
        t, t || '_store_id_fkey');
    end if;
    -- 6. index for the per-store filter that every query will soon use
    execute format('create index if not exists %I on %I(store_id)', 'idx_' || t || '_store_id', t);
  end loop;
end $$;

-- ── Notes for later phases (NOT done here) ───────────────────────────────────
-- Phase 2: getSessionProfile() returns store_id; every API route filters reads
--          by it and stamps writes. app_config lookups become (store_id, key) —
--          its PRIMARY KEY (currently `key`) must change to (store_id, key) then.
-- Phase 3: enable RLS on all tenant tables with a store-scoped policy as backup.
-- Phase 4: on signup, assign/create a store instead of defaulting to Store #1.
