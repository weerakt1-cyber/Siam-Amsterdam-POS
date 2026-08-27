-- ─── In-app bank-transfer slip verification (Phase 1) ───────────────────────
-- Stores without an Omise account accept PromptPay/bank transfers and verify the
-- customer's slip — either automatically (SlipOK API) or manually (staff confirm
-- from the slip photo). One row per slip submitted against an order.
--
-- Per-store receiving config lives in app_config (existing pattern), key
--   'transfer_settings' = JSON {
--     "enabled": true,
--     "mode": "auto" | "manual",          -- auto = SlipOK verify, manual = staff confirm
--     "promptpayId": "0812345678",        -- phone / citizen id / ewallet id
--     "accountName": "นายวีรพัฒน์ ...",   -- display + receiver matching
--     "bankCode": "004",                  -- optional, for receiver matching
--     "slipokApiKey": "...", "slipokBranchId": "..."   -- per-store credentials
--   }
-- Idempotent.

create table if not exists payment_slips (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null default '00000000-0000-0000-0000-000000000001'
               references stores(id) on delete cascade,
  order_id     text not null references orders(id) on delete cascade,
  trans_ref    text,                        -- from slip QR; null in manual mode
  amount       numeric(12,2) not null,
  sender_name  text,                        -- masked, from verify API
  receiver_ok  boolean,                     -- receiver matched store account
  method       text not null check (method in ('auto','manual')),
  status       text not null default 'pending'
               check (status in ('pending','verified','rejected')),
  verified_by  uuid,                        -- profile id (manual confirm) or null (auto)
  raw_payload  jsonb,                       -- full verify-API response / decoded QR
  image_url    text,                        -- Supabase Storage path of slip photo
  created_at   timestamptz not null default now(),
  verified_at  timestamptz
);

-- Anti-reuse: one transaction can pay one order per store, ever.
create unique index if not exists uq_payment_slips_store_transref
  on payment_slips(store_id, trans_ref) where trans_ref is not null;
create index if not exists idx_payment_slips_store_order
  on payment_slips(store_id, order_id);

-- RLS backup, same pattern as migration 012/016
alter table payment_slips enable row level security;
drop policy if exists store_isolation on payment_slips;
create policy store_isolation on payment_slips for all to authenticated
  using (store_id = public.current_store_id())
  with check (store_id = public.current_store_id());
