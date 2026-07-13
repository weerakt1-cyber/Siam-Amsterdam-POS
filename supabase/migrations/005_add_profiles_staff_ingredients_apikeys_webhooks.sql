-- ============================================================
-- Baze POS — Reconcile tables that existed in production but were
-- never captured as a migration (profiles, staff, menu_ingredients,
-- api_keys, webhook_configs). Without this file, applying
-- 001-004 to a fresh Supabase project produces a schema missing
-- five tables the app actually queries at runtime — provisioning
-- a new customer would look successful and then fail on first
-- staff PIN login / recipe save / API key / webhook use.
-- Run once in Supabase SQL Editor (or via the provisioning script).
-- ============================================================

-- ─── 11. Profiles (Supabase Auth — Google/LINE login gate) ────────────────────
-- One row per auth.users id. Role is admin-assigned, not self-granted: a new
-- signup gets requested_role + status='pending' until an admin approves via
-- /pos/users → App Users tab (src/app/api/admin/approve).
create table if not exists profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  name           text not null,
  role           text check (role in ('admin', 'manager', 'bartender', 'staff')),
  requested_role text check (requested_role in ('admin', 'manager', 'bartender', 'staff')),
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  color          text not null default '#f59e0b',
  avatar_url     text,
  provider       text not null default 'oauth',
  created_at     timestamptz default now()
);

-- Unlike every other table here, profiles IS queried from the browser with the
-- anon key (src/lib/supabase-browser.ts), so it needs RLS + policies rather
-- than being wide open — a user may only read/create/update their OWN row.
-- The admin approve/pending API routes use the service_role key (src/lib/
-- supabase.ts) and bypass RLS entirely, so they can see every profile.
alter table profiles enable row level security;
drop policy if exists "read own"   on profiles;
drop policy if exists "insert own" on profiles;
drop policy if exists "update own" on profiles;
create policy "read own"   on profiles for select using (auth.uid() = id);
create policy "insert own" on profiles for insert with check (auth.uid() = id);
create policy "update own" on profiles for update using (auth.uid() = id);

-- ─── 12. Staff (PIN-based POS identity — separate from profiles/Google login) ─
-- The POS operating identity is always a real staff PIN account, never the
-- Google/email profile (see src/components/pos/StaffGate.tsx + AppAuthGuard).
-- PIN is stored in plaintext — this is a single-tenant kiosk app behind a
-- physical device, not a public multi-user system; treat as a prototype-grade
-- tradeoff, not a pattern to copy elsewhere.
create table if not exists staff (
  id         text        primary key,
  name       text        not null,
  role       text        not null default 'staff' check (role in ('admin', 'manager', 'bartender', 'staff')),
  pin        text        not null default '',
  color      text        not null default '#f59e0b',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── 13. Menu Ingredients (recipe → inventory links, drives stock deduction) ──
create table if not exists menu_ingredients (
  id                   text        primary key,
  menu_item_id         text        not null references menu_items(id) on delete cascade,
  inventory_item_id    text        not null references inventory_items(id) on delete cascade,
  quantity_per_serving numeric     not null default 0,
  unit                 text        not null default '',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists menu_ingredients_menu_item_id_idx      on menu_ingredients (menu_item_id);
create index if not exists menu_ingredients_inventory_item_id_idx on menu_ingredients (inventory_item_id);

-- ─── 14. API Keys (Public API v1 — src/lib/api-auth.ts) ───────────────────────
create table if not exists api_keys (
  id         text        primary key,
  label      text        not null,
  key_hash   text        not null,
  active     boolean     not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists api_keys_key_hash_idx on api_keys (key_hash);

-- ─── 15. Webhook Configs (outbound event webhooks — src/lib/webhooks.ts) ──────
create table if not exists webhook_configs (
  id         text        primary key,
  url        text        not null,
  events     text[]      not null default '{}',
  active     boolean     not null default true,
  secret     text        not null,
  label      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── RLS: same pattern as 001 — backend uses service_role key, access control
-- lives at the Next.js API route layer, not Postgres RLS. Only profiles (above)
-- is the exception because it's read directly from the browser.
alter table staff           disable row level security;
alter table menu_ingredients disable row level security;
alter table api_keys        disable row level security;
alter table webhook_configs disable row level security;
