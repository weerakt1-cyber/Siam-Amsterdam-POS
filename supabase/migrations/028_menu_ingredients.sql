-- ============================================================
-- Baze POS — menu_ingredients (recipe → stock link table).
--
-- This table was defined in migration 005 but never actually created in
-- production, and 010 deliberately omitted it from the store_id backfill for
-- that reason. As a result, saving a menu item's tracked ingredients from the
-- item editor silently 500'd (the PUT hit a non-existent table), so recipes
-- never persisted, never re-displayed, and — most importantly — order payment
-- could not deduct real stock for them.
--
-- This migration (re)creates it with the SAME shape the rest of the schema
-- uses: text ids for the child + its FKs (menu_items.id and inventory_items.id
-- are both text), a denormalised store_id (default = the sole existing store,
-- matching every other tenant-scoped table) with an index, and RLS enabled with
-- NO policy — the API runs on the service_role key which bypasses RLS, while the
-- anon/authenticated roles are denied direct access. Idempotent: safe to re-run.
--
-- The same DDL was applied directly to the production project so the live app
-- would work immediately; this file records it for version history and so that
-- newly provisioned stores get the table too.
-- ============================================================

create table if not exists menu_ingredients (
  id                    text        primary key,
  menu_item_id          text        not null references menu_items(id) on delete cascade,
  inventory_item_id     text        not null references inventory_items(id) on delete cascade,
  quantity_per_serving  numeric     not null default 0,
  unit                  text        not null default '',
  store_id              uuid        not null default '00000000-0000-0000-0000-000000000001'
                                    references stores(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists menu_ingredients_menu_item_id_idx on menu_ingredients(menu_item_id);
create index if not exists menu_ingredients_store_id_idx      on menu_ingredients(store_id);

alter table menu_ingredients enable row level security;
