-- ─── Store subscription payments ledger (Phase 1) ───────────────────────────
-- One row per renewal attempt. The shop submits a payment (status 'pending')
-- with a PromptPay slip; the operator confirms it in /super-admin, which extends
-- the store's subscription by `months`. Manual/semi-automatic — no gateway.
-- Idempotent.

create table if not exists store_payments (
  id           uuid        primary key default gen_random_uuid(),
  store_id     uuid        not null references stores(id) on delete cascade,
  plan         text        not null,
  cycle        text        not null,                       -- 'monthly' | 'yearly'
  amount       numeric     not null,
  months       integer     not null,                       -- months this payment adds on confirm
  status       text        not null default 'pending',     -- 'pending' | 'confirmed' | 'rejected'
  slip_url     text,                                        -- storage path in the 'payment-slips' bucket
  note         text,
  created_at   timestamptz not null default now(),
  confirmed_by text,                                        -- super-admin email
  confirmed_at timestamptz
);

create index if not exists idx_store_payments_store  on store_payments (store_id, created_at desc);
create index if not exists idx_store_payments_status on store_payments (status);
