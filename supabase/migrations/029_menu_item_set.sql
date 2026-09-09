-- ============================================================
-- Baze POS — Set / Combo menu items.
--
-- A "set" is an ordinary menu item flagged is_set = true whose option groups
-- (the existing menu_items.variants jsonb) each represent one item slot in the
-- combo — e.g. a set with groups "Main dish", "Drink", "Dessert", each holding
-- the choices for that slot and their price adjustments. This reuses the proven
-- variant pricing/order/stock paths; the only new state is the flag, which lets
-- the UI badge the item as a set, require every group, and title the QR
-- option card accordingly.
--
-- Nullable/defaulted so every existing row keeps working (is_set = false).
-- The same DDL is applied to production directly so the feature works as soon
-- as the web build ships.
-- ============================================================

alter table menu_items
  add column if not exists is_set boolean not null default false;
