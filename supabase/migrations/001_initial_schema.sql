-- ============================================================
-- Siam Amsterdam POS — Initial Schema
-- Run once in Supabase SQL Editor before first deploy
-- ============================================================

-- ─── 1. Menu Items ────────────────────────────────────────────────────────────
create table if not exists menu_items (
  id            text        primary key,
  name          text        not null,
  name_th       text        not null default '',
  price         numeric     not null default 0,
  category      text        not null default 'other',
  available     boolean     not null default true,
  cost          numeric,
  sku           text,
  description   text,
  unit          text,
  tax_rate      numeric     not null default 0,
  image         text,
  sort_order    integer     not null default 0,
  variants      jsonb       not null default '[]',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─── 2. Orders ────────────────────────────────────────────────────────────────
create table if not exists orders (
  id             text        primary key,
  table_no       text        not null,
  note           text        not null default '',
  status         text        not null default 'pending',
  source         text        not null default 'pos',
  subtotal       numeric     not null default 0,
  discount       jsonb,
  total          numeric     not null default 0,
  payment_method text,
  member_name    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists orders_created_at_idx on orders (created_at desc);
create index if not exists orders_status_idx     on orders (status);
create index if not exists orders_table_no_idx   on orders (table_no);

-- ─── 3. Order Items ───────────────────────────────────────────────────────────
create table if not exists order_items (
  id            bigserial   primary key,
  order_id      text        not null references orders(id) on delete cascade,
  menu_id       text        not null,
  name          text        not null,
  name_th       text        not null default '',
  qty           integer     not null default 1,
  price         numeric     not null default 0,
  variant_label text
);

create index if not exists order_items_order_id_idx on order_items (order_id);

-- ─── 4. Members ───────────────────────────────────────────────────────────────
create table if not exists members (
  id            text        primary key,
  name          text        not null,
  phone         text,
  birthday      date,
  notes         text,
  points        integer     not null default 0,
  stamps        integer     not null default 0,
  stamps_earned integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─── 5. Inventory Items ───────────────────────────────────────────────────────
create table if not exists inventory_items (
  id                  text        primary key,
  name                text        not null,
  unit                text        not null default 'pcs',
  category            text        not null default 'other',
  current_stock       numeric     not null default 0,
  low_stock_threshold numeric     not null default 5,
  cost_per_unit       numeric,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ─── 6. Stock Adjustments ─────────────────────────────────────────────────────
create table if not exists stock_adjustments (
  id         text        primary key,
  item_id    text        not null references inventory_items(id) on delete cascade,
  delta      numeric     not null,
  reason     text        not null default 'manual',
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists stock_adj_item_id_idx on stock_adjustments (item_id);

-- ─── 7. Daily Reports ─────────────────────────────────────────────────────────
create table if not exists daily_reports (
  date         date        primary key,
  opening_cash numeric     not null default 0,
  cash_ins     jsonb       not null default '[]',
  expenses     jsonb       not null default '[]',
  updated_at   timestamptz not null default now()
);

-- ─── 8. Coupons ───────────────────────────────────────────────────────────────
create table if not exists coupons (
  id          text        primary key,
  code        text        not null unique,
  name        text        not null,
  description text,
  type        text        not null default 'percent',
  value       numeric     not null default 0,
  min_order   numeric     not null default 0,
  max_uses    integer     not null default 0,
  used_count  integer     not null default 0,
  active      boolean     not null default true,
  start_date  date,
  end_date    date,
  member_only boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── 9. Coupon Uses ───────────────────────────────────────────────────────────
create table if not exists coupon_uses (
  id              text        primary key,
  coupon_id       text        not null references coupons(id) on delete cascade,
  coupon_code     text        not null,
  discount_amount numeric     not null default 0,
  order_total     numeric     not null default 0,
  member_name     text,
  created_at      timestamptz not null default now()
);

-- ─── 10. POS Staff Users ──────────────────────────────────────────────────────
create table if not exists pos_users (
  id         text        primary key,
  name       text        not null,
  role       text        not null default 'staff',
  pin        text        not null default '',
  color      text        not null default '#f59e0b',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── RLS: backend uses service_role key → disable RLS on all tables ───────────
alter table menu_items        disable row level security;
alter table orders            disable row level security;
alter table order_items       disable row level security;
alter table members           disable row level security;
alter table inventory_items   disable row level security;
alter table stock_adjustments disable row level security;
alter table daily_reports     disable row level security;
alter table coupons           disable row level security;
alter table coupon_uses       disable row level security;
alter table pos_users         disable row level security;
