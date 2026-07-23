-- ============================================================
-- Siam Amsterdam POS — Delivery platform channels (Phase 1)
-- Adds channel tagging for Grab / LINE MAN / Shopee Food orders
-- entered manually via /pos/delivery. Webhook integration (Phase 2)
-- will reuse these same columns.
-- Run once in Supabase SQL Editor
-- ============================================================

-- 'dine-in' | 'takeaway' | 'delivery'
alter table orders add column if not exists order_type text not null default 'dine-in';

-- 'grab' | 'lineman' | 'shopeefood' — null for non-delivery orders
alter table orders add column if not exists channel text;

-- Platform order code the rider quotes, e.g. "GF-1234" (Phase 2: real platform order id)
alter table orders add column if not exists platform_code text;

-- Commission fraction snapshotted at order time, e.g. 0.30 = 30%
alter table orders add column if not exists commission_rate numeric;

create index if not exists idx_orders_channel on orders (channel) where channel is not null;
