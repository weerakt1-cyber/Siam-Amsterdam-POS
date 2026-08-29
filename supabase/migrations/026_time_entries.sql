-- Staff time clock: clock in/out + meal/other breaks, per store + PIN operator.
-- Powers the "กะของฉัน" (My Shift) screen. Clocking in is required before a
-- staff member can use the POS. A shift left open past its business-day cutoff
-- is auto-closed by the app layer (marked auto_closed).

create table if not exists time_entries (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  staff_id    uuid not null references staff(id) on delete cascade,
  clock_in    timestamptz not null default now(),
  clock_out   timestamptz,
  -- [{ "start": iso, "end": iso|null, "type": "meal" | "restroom" | "other" }]
  breaks      jsonb not null default '[]'::jsonb,
  status      text  not null default 'open',   -- 'open' | 'closed'
  auto_closed boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists time_entries_store_staff_idx
  on time_entries (store_id, staff_id, clock_in desc);

-- At most one open shift per staff per store.
create unique index if not exists time_entries_one_open_idx
  on time_entries (store_id, staff_id) where status = 'open';

-- Store-isolation posture: only the service-role client (the API layer) touches
-- this table. RLS on with no policies denies all direct anon/authenticated access.
alter table time_entries enable row level security;
