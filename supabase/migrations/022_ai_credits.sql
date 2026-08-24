-- ─── AI add-on credit system (Phase 1.5) ────────────────────────────────────
-- 1 credit = ฿1 of real Claude API cost. Each AI call debits its actual cost;
-- when the balance hits 0 the AI is blocked until reset/top-up. Yearly plans
-- refresh the monthly allowance on the purchase day-of-month (no rollover);
-- monthly plans refresh on renewal. Idempotent.

alter table stores add column if not exists ai_status            text    not null default 'none';  -- none | monthly | yearly
alter table stores add column if not exists ai_credit_balance    numeric not null default 0;       -- ฿ remaining
alter table stores add column if not exists ai_monthly_allowance numeric not null default 0;       -- ฿ refilled each reset
alter table stores add column if not exists ai_reset_day         integer;                           -- day-of-month for the yearly refresh
alter table stores add column if not exists ai_next_reset        date;                              -- next refill date
alter table stores add column if not exists ai_until             date;                              -- AI add-on expiry

-- store_payments now covers subscription renewals AND AI purchases/top-ups.
alter table store_payments add column if not exists kind text not null default 'subscription';      -- subscription | ai | ai_topup

-- Per-call usage ledger (transparency + auditing the cost model).
create table if not exists ai_usage (
  id            uuid        primary key default gen_random_uuid(),
  store_id      uuid        not null references stores(id) on delete cascade,
  route         text        not null,          -- 'chat' | 'menu-optimize'
  input_tokens  integer     not null default 0,
  output_tokens integer     not null default 0,
  cost_thb      numeric     not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_ai_usage_store on ai_usage (store_id, created_at desc);
