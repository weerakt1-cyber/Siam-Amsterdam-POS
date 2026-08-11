-- ─── Phase 3: RLS store isolation (defense-in-depth) ─────────────────────────
--
-- The app reads/writes through server routes on the service_role key, which
-- BYPASSES RLS — so these policies do NOT change how the app runs today. They
-- are a safety net: if any code path ever queries these tables with the anon or
-- a per-user (authenticated) key, it can only ever see/modify its own store's
-- rows. anon (no auth.uid()) sees nothing; service_role still sees everything.
--
-- Idempotent: safe to run more than once.

-- Resolve the caller's store from their profile. SECURITY DEFINER so the lookup
-- itself isn't blocked by profiles' own RLS (and to avoid policy recursion).
create or replace function public.current_store_id() returns uuid
  language sql stable security definer set search_path = public as $$
    select store_id from public.profiles where id = auth.uid()
  $$;

-- Every tenant table keyed on store_id gets the same store-scoped policy.
do $$
declare
  t    text;
  tbls text[] := array[
    'orders','order_items','menu_items','categories','members',
    'inventory_items','stock_adjustments','daily_reports','coupons','coupon_uses',
    'promotions','pos_users','staff','api_keys','webhook_configs','app_config'
  ];
begin
  foreach t in array tbls loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists store_isolation on public.%I', t);
    execute format(
      'create policy store_isolation on public.%I for all to authenticated '
      || 'using (store_id = public.current_store_id()) '
      || 'with check (store_id = public.current_store_id())', t);
  end loop;
end $$;

-- The stores registry itself: an authenticated user sees only their own store.
alter table public.stores enable row level security;
drop policy if exists store_self on public.stores;
create policy store_self on public.stores for all to authenticated
  using (id = public.current_store_id())
  with check (id = public.current_store_id());
