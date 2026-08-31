-- ============================================================
-- Baze POS — Inventory "content size" for precise ML / G stock cutting.
--
-- Bars and kitchens buy in whole containers (a 700 ml bottle of Rum, a 1 kg
-- bag of sugar) but consume in fine measures per recipe (50 ml a pour, 20 g a
-- serve). Recording how much of a fine measure sits inside one stock unit lets
-- the app convert a recipe's "50 ml" into the fraction of a bottle to deduct,
-- so stock is cut accurately down to the ml / g.
--
--   content_amount + content_unit  ⇒  "1 stock unit contains N <unit>"
--   e.g. Rum: unit='bottle', content_amount=700, content_unit='ml'
--
-- Both are nullable — items already stocked in a fine unit (unit='ml'/'g') or
-- items with no recipe links need neither, and existing rows keep working
-- unchanged (conversion falls back to treating recipe unit = stock unit).
-- Run once in Supabase SQL Editor (or via the provisioning script).
-- ============================================================

alter table inventory_items
  add column if not exists content_amount numeric,
  add column if not exists content_unit   text;
