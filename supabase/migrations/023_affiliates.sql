-- ─── Affiliate / distributor commissions (M3a) ──────────────────────────────
-- Brokers refer stores and earn a recurring commission on every confirmed
-- payment that store makes. Managed by the operator in /super-admin for now;
-- the self-service affiliate portal (M3b) reads the same tables. Idempotent.

create table if not exists affiliates (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null,
  contact         text,                               -- phone / email / LINE
  referral_code   text        unique not null,        -- shareable code
  commission_rate numeric     not null default 0.20,  -- fraction of each payment
  status          text        not null default 'active',  -- active | inactive
  payout_info     text,                               -- how to pay them (PromptPay/bank)
  note            text,
  created_at      timestamptz not null default now()
);

-- A store has at most one referrer.
alter table stores add column if not exists affiliate_id uuid references affiliates(id);

create table if not exists commissions (
  id           uuid        primary key default gen_random_uuid(),
  affiliate_id uuid        not null references affiliates(id) on delete cascade,
  store_id     uuid        not null references stores(id) on delete cascade,
  payment_id   uuid        references store_payments(id) on delete set null,
  amount       numeric     not null,                  -- ฿ owed to the affiliate
  rate         numeric     not null,                  -- rate snapshotted at accrual
  status       text        not null default 'pending', -- pending | paid
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);

create index if not exists idx_commissions_affiliate on commissions (affiliate_id, created_at desc);
create index if not exists idx_commissions_status     on commissions (status);
