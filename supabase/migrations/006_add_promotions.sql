-- ============================================================
-- Baze POS — Item-level promotions (auto-applied deals, separate
-- from the code-based `coupons` table which is order-level).
--
-- Three mechanics (type):
--   'bundle'    — buy N of a specific item for a fixed total price
--                 (e.g. 1 Shot 150 / 2 Shots 250). buy_qty + bundle_price.
--   'free_item' — buy N of a specific item, get something free — TAG/NOTE
--                 ONLY (no separate line, no stock deduction; staff hand it
--                 out). buy_qty + free_text.
--   'discount'  — % or ฿ off a specific item OR a whole category, optionally
--                 time-limited (happy hour). discount_type + discount_value.
--
-- Timing ("both" model): optional calendar date range AND/OR an optional
-- daily time window (start_time/end_time as "HH:MM"; if start_time > end_time
-- the window wraps past midnight, e.g. 22:00–02:00). No timing fields = always
-- active while active=true.
--
-- Run once in Supabase SQL Editor (or via the provisioning script).
-- ============================================================

create table if not exists promotions (
  id             text        primary key,
  name           text        not null,
  type           text        not null default 'discount' check (type in ('bundle', 'free_item', 'discount')),
  active         boolean     not null default true,

  -- Trigger target. bundle/free_item are always a single item; discount can be
  -- an item or a whole category.
  target_type    text        not null default 'item' check (target_type in ('item', 'category')),
  target_id      text,       -- menu_items.id (target_type=item) or a category value (target_type=category)

  -- Mechanic params (nullable; used per type)
  buy_qty        integer,    -- bundle & free_item: quantity that triggers the deal
  bundle_price   numeric,    -- bundle: total price for buy_qty units
  free_text      text,       -- free_item: what the customer gets, e.g. "Free Peanuts"
  discount_type  text        check (discount_type in ('percent', 'fixed')),  -- discount only
  discount_value numeric,    -- discount: percent 0–100, or ฿ off per unit

  -- Timing
  start_date     date,
  end_date       date,
  start_time     text,       -- "HH:MM", 24h; null = no daily window
  end_time       text,       -- "HH:MM"

  -- QR advertising
  show_on_qr     boolean     not null default true,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists promotions_active_idx on promotions (active);

-- Access control lives at the Next.js API route layer (backend uses the
-- service_role key) — same pattern as coupons/menu_items. The QR ordering page
-- reads active promotions through /api/promotions (server-side), not the anon
-- key directly, so no RLS policy is needed here.
alter table promotions disable row level security;
