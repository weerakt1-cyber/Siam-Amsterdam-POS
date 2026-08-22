-- ─── Orders performance indexes ─────────────────────────────────────────────
-- The live boards (kitchen/floor/delivery/POS) poll GET /api/orders every few
-- seconds, now bounded by store_id + created_at window and/or status. These
-- composite indexes let those queries seek instead of scanning the whole table.
-- The single-column orders_created_at_idx / orders_status_idx from 001 stay, but
-- can't serve the store-scoped predicates on their own. Idempotent.

create index if not exists idx_orders_store_created on orders (store_id, created_at desc);
create index if not exists idx_orders_store_status  on orders (store_id, status);
