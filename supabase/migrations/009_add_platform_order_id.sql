-- ============================================================
-- Siam Amsterdam POS — Delivery Phase 2: platform order IDs
-- Real order IDs pushed by platform webhooks (GrabFood etc.).
-- platform_code (008) stays as the human-readable short code.
-- The unique index makes webhook order creation idempotent —
-- a redelivered webhook can't create a duplicate order.
-- Run once in Supabase SQL Editor
-- ============================================================

alter table orders add column if not exists platform_order_id text;

create unique index if not exists idx_orders_platform_order_id
  on orders (platform_order_id) where platform_order_id is not null;
