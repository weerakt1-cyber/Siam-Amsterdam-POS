-- ─── Store billing fields (Phase 1) ─────────────────────────────────────────
-- Extends the subscription columns from 019 with:
--   • billing_cycle — 'monthly' | 'yearly'
--   • locked_price  — the ฿ this store always pays per cycle. Grandfathering:
--                     once set, raising a base price in plans.ts never changes it.
-- Idempotent. Manual billing still — nothing here charges money.

alter table stores add column if not exists billing_cycle text;      -- 'monthly' | 'yearly'
alter table stores add column if not exists locked_price  numeric;   -- ฿ per cycle, fixed at signup
