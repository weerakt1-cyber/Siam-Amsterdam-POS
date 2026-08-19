-- ─── Table reservations / event bookings ─────────────────────────────────────
--
-- A customer opens the public /reserve/{store} link, logs in the same way as the
-- QR order page (member phone lookup or guest name), then requests a table for a
-- date/time. The shop is alerted (Telegram) and approves/rejects from the POS;
-- the customer watches the status flip on the same page — mirroring how a QR
-- order shows "Processing → Ready".
--
-- Store-scoped like every other tenant table (store_id + default Store #1 + FK +
-- index + RLS backup), so it drops straight into the multi-store model from
-- migrations 010/012. Idempotent: safe to run more than once.

create table if not exists reservations (
  id            uuid        primary key default gen_random_uuid(),
  store_id      uuid        not null default '00000000-0000-0000-0000-000000000001'
                              references stores(id) on delete cascade,

  -- ── Booking reference shown to the customer / quoted at the door ──
  ref_code      text        not null,

  -- ── Who is booking (same identity model as the QR order flow) ──
  member_id     text,                    -- set when they logged in as a member
  customer_name text        not null,    -- member name or guest name
  phone         text,                    -- contact number for the booking

  -- ── What they want (relates to the floor plan) ──
  zone          text,                    -- floor-plan zone (Indoor/Outdoor/VIP…)
  table_no      text,                    -- specific table on the floor plan
  party_size    integer     not null default 1,

  -- ── When ──
  reserved_date date        not null,
  start_time    time        not null,
  end_time      time        not null,

  -- ── Extras ──
  event_name    text,                    -- title of the booking / occasion
  requirements  text,                    -- things the shop should prepare

  -- ── Lifecycle ──
  status        text        not null default 'pending'
                              check (status in (
                                'pending','approved','rejected',
                                'seated','completed','no_show','cancelled')),
  staff_reply   text,                    -- message the shop sends back on decision
  reminder_sent_at timestamptz,          -- day-before reminder fired once (cron)

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Unique booking reference per store (the code is what staff/customer quote).
create unique index if not exists idx_reservations_store_ref
  on reservations(store_id, ref_code);

-- The per-store filter every query uses, plus availability lookups by date.
create index if not exists idx_reservations_store_id
  on reservations(store_id);
create index if not exists idx_reservations_store_date
  on reservations(store_id, reserved_date);

-- keep updated_at fresh on any change
create or replace function public.touch_reservations_updated_at()
  returns trigger language plpgsql as $$
  begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_reservations_updated_at on reservations;
create trigger trg_reservations_updated_at
  before update on reservations
  for each row execute function public.touch_reservations_updated_at();

-- ── RLS backup (same net as migration 012) ───────────────────────────────────
-- The app reads/writes on the service_role key, which BYPASSES RLS, so this does
-- not change how the app runs today; it only ensures anon/authenticated keys can
-- never cross store boundaries. current_store_id() is defined in 012.
alter table reservations enable row level security;
drop policy if exists store_isolation on reservations;
create policy store_isolation on reservations for all to authenticated
  using (store_id = public.current_store_id())
  with check (store_id = public.current_store_id());
